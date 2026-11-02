#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

import { captureDomEvidence, capturePageEvidence, performBrowserActions } from "./lib/browser-evidence.mjs";
import { startStaticFixtureServer } from "./lib/static-fixture-server.mjs";
import { compareDomEvidence, comparePngBuffers } from "./lib/visual-comparison.mjs";
import { validateFidelityInputs } from "./lib/completion-policy.mjs";
import { installResourceOverrides, validatedEvidenceFile } from "./lib/resource-overrides.mjs";
import { option, parseCli, readJson, repoRoot } from "./lib/workbench-utils.mjs";

const { options, positionals } = parseCli(process.argv.slice(2));
const configPath = resolve(repoRoot, positionals[0] ?? "fixtures/browser/fidelity.matrix.json");
if (!existsSync(configPath)) throw new Error(`fidelity matrix not found: ${relative(repoRoot, configPath)}`);
const config = readJson(configPath);
if (config.schemaVersion !== 1 || !Array.isArray(config.viewports) || !Array.isArray(config.routes)) {
  throw new Error("fidelity matrix must contain schemaVersion 1, viewports, and routes");
}

const outputDirectory = resolve(repoRoot, String(option(options, "output", ".workbench/fidelity")));
const reportPath = resolve(repoRoot, String(option(options, "report", join(outputDirectory, "report.json"))));
mkdirSync(outputDirectory, { recursive: true });

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase();
}

function stateThreshold(state, route, name, fallback) {
  return state.thresholds?.[name] ?? route.thresholds?.[name] ?? config.thresholds?.[name] ?? fallback;
}

function targetUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href;
}

function attachRuntimeDiagnostics(page, errors) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (!/^(data|blob):/u.test(request.url())) errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
  });
}

async function maskCoverageRatio(page, selectors) {
  if (selectors.length === 0) return 0;
  return page.evaluate((values) => {
    const viewportArea = Math.max(1, innerWidth * innerHeight);
    const area = values.reduce((total, selector) => total + [...document.querySelectorAll(selector)].reduce((selectorTotal, node) => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
      const height = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
      return selectorTotal + width * height;
    }, 0), 0);
    return Math.min(1, area / viewportArea);
  }, selectors);
}

async function validateSubstituteMediaNodes(page, selectors) {
  if (selectors.length === 0) return;
  const invalid = await page.evaluate((values) => values.flatMap((selector) => [...document.querySelectorAll(selector)]
    .filter((node) => !["IMG", "VIDEO", "PICTURE"].includes(node.tagName) && !node.hasAttribute("data-replaceable-media"))
    .map((node) => `${selector} -> ${node.tagName.toLowerCase()}`)), selectors);
  if (invalid.length > 0) throw new Error(`substituteMediaSelectors matched non-media nodes: ${invalid.join(", ")}`);
  const missing = await page.evaluate((values) => values.filter((selector) => document.querySelectorAll(selector).length === 0), selectors);
  if (missing.length > 0) throw new Error(`substituteMediaSelectors matched no nodes: ${missing.join(", ")}`);
}

async function freezeMedia(page) {
  await page.evaluate(() => {
    for (const media of document.querySelectorAll("video, audio")) {
      media.pause();
    }
  });
}

async function preparePage(context, url, actions, state) {
  const page = await context.newPage();
  const errors = [];
  attachRuntimeDiagnostics(page, errors);
  await page.goto(url, {
    timeout: state.navigationTimeoutMs ?? config.navigationTimeoutMs ?? 30000,
    waitUntil: state.waitUntil ?? config.waitUntil ?? "domcontentloaded",
  });
  if (config.readyExpression) await page.waitForFunction(config.readyExpression);
  if (config.readyDelayMs || state.readyDelayMs) await page.waitForTimeout(state.readyDelayMs ?? config.readyDelayMs);
  await performBrowserActions(page, actions);
  if (state.settleMs) await page.waitForTimeout(state.settleMs);
  return { errors, page };
}

let fixtureServer = null;
let candidateFixtureServer = null;
if (config.fixtureRoot) {
  fixtureServer = await startStaticFixtureServer(resolve(repoRoot, config.fixtureRoot), config.fallbackFile ?? "fixture.html");
  candidateFixtureServer = await startStaticFixtureServer(resolve(repoRoot, config.fixtureRoot), config.fallbackFile ?? "fixture.html");
}
const sourceBaseUrl = String(option(options, "source-url", config.sourceBaseUrl ?? fixtureServer?.baseUrl ?? ""));
const candidateBaseUrl = String(option(options, "candidate-url", config.candidateBaseUrl ?? candidateFixtureServer?.baseUrl ?? ""));
if (!sourceBaseUrl || !candidateBaseUrl) throw new Error("provide --source-url and --candidate-url, or configure fixtureRoot");
validateFidelityInputs(config, sourceBaseUrl, candidateBaseUrl);

const browser = await chromium.launch({ headless: !options.has("headed") });
const report = {
  candidateBaseUrl,
  config: relative(repoRoot, configPath),
  failures: [],
  results: [],
  schemaVersion: 1,
  sourceBaseUrl,
};

try {
  for (const viewport of config.viewports) {
    for (const route of config.routes) {
      for (const state of route.states ?? []) {
        if (state.viewports && !state.viewports.includes(viewport.name)) continue;
        const contextOptions = {
          hasTouch: state.hasTouch ?? false,
          isMobile: state.isMobile ?? false,
          reducedMotion: state.reducedMotion ?? "no-preference",
          viewport: { height: viewport.height, width: viewport.width },
        };
          const sourceContext = await browser.newContext(contextOptions);
          const candidateContext = await browser.newContext(contextOptions);
          await installResourceOverrides(sourceContext, state.sourceResourceOverrides ?? route.sourceResourceOverrides ?? config.sourceResourceOverrides ?? []);
        const id = `${route.id}-${state.id}-${viewport.name}`;
        const entry = { id, passed: false };
        try {
          const commonActions = [...(route.actions ?? []), ...(state.actions ?? [])];
          const sourceActions = [...commonActions, ...(state.sourceActions ?? [])];
          const candidateActions = [...commonActions, ...(state.candidateActions ?? [])];
          const sourcePath = state.sourcePath ?? route.sourcePath ?? route.path;
          const candidatePath = state.candidatePath ?? route.candidatePath ?? route.path;
          const [source, candidate] = await Promise.all([
            preparePage(sourceContext, targetUrl(sourceBaseUrl, sourcePath), sourceActions, state),
            preparePage(candidateContext, targetUrl(candidateBaseUrl, candidatePath), candidateActions, state),
          ]);
          const configuredSelectors = state.selectors ?? route.selectors ?? config.selectors ?? [];
          const maskSelectors = state.maskSelectors ?? route.maskSelectors ?? config.maskSelectors ?? [];
          const substituteMediaSelectors = state.substituteMediaSelectors ?? route.substituteMediaSelectors ?? config.substituteMediaSelectors ?? [];
          await Promise.all([
            validateSubstituteMediaNodes(source.page, substituteMediaSelectors),
            validateSubstituteMediaNodes(candidate.page, substituteMediaSelectors),
          ]);
          const selectors = [
            ...configuredSelectors,
            ...substituteMediaSelectors.map((selector) => ({ id: `substitute-media:${selector}`, selector })),
          ];
          const screenshotMasks = [...new Set([...maskSelectors, ...substituteMediaSelectors])];
          const [sourceMaskRatio, candidateMaskRatio, sourceSubstituteRatio, candidateSubstituteRatio] = await Promise.all([
            maskCoverageRatio(source.page, maskSelectors),
            maskCoverageRatio(candidate.page, maskSelectors),
            maskCoverageRatio(source.page, substituteMediaSelectors),
            maskCoverageRatio(candidate.page, substituteMediaSelectors),
          ]);
          if (Math.max(sourceMaskRatio, candidateMaskRatio) > 0.5) throw new Error(`mask coverage exceeds half the viewport (${Math.max(sourceMaskRatio, candidateMaskRatio).toFixed(3)})`);
          if (Math.max(sourceSubstituteRatio, candidateSubstituteRatio) > 0.95) throw new Error(`substitute media coverage exceeds 95% of the viewport (${Math.max(sourceSubstituteRatio, candidateSubstituteRatio).toFixed(3)})`);
          await Promise.all([freezeMedia(source.page), freezeMedia(candidate.page)]);
          const screenshotOptions = {
            animations: "allow",
            caret: "hide",
            fullPage: state.fullPage ?? false,
          };
          const sourceReference = state.sourceReference ? validatedEvidenceFile(state.sourceReference, "sourceReference") : null;
          const [liveSourcePng, candidatePng, sourceDom, candidateDom, sourcePage, candidatePage] = await Promise.all([
            source.page.screenshot({ ...screenshotOptions, mask: screenshotMasks.map((selector) => source.page.locator(selector)) }),
            candidate.page.screenshot({ ...screenshotOptions, mask: screenshotMasks.map((selector) => candidate.page.locator(selector)) }),
            captureDomEvidence(source.page, selectors),
            captureDomEvidence(candidate.page, selectors),
            capturePageEvidence(source.page),
            capturePageEvidence(candidate.page),
          ]);
          const sourcePng = sourceReference?.body ?? liveSourcePng;
          if (sourceReference) {
            const [referenceMeta, candidateMeta] = await Promise.all([sharp(sourcePng).metadata(), sharp(candidatePng).metadata()]);
            if (referenceMeta.width !== candidateMeta.width || referenceMeta.height !== candidateMeta.height) {
              throw new Error(`sourceReference dimensions ${referenceMeta.width}x${referenceMeta.height} do not match candidate ${candidateMeta.width}x${candidateMeta.height}`);
            }
          }
          const comparison = await comparePngBuffers(sourcePng, candidatePng, stateThreshold(state, route, "channelThreshold", 0.08));
          const dom = compareDomEvidence(sourceDom, candidateDom);
          const stateDirectory = join(outputDirectory, safeName(id));
          mkdirSync(stateDirectory, { recursive: true });
          writeFileSync(join(stateDirectory, "source.png"), sourcePng);
          writeFileSync(join(stateDirectory, "candidate.png"), candidatePng);
          await sharp(comparison.diff, { raw: { channels: 4, height: comparison.height, width: comparison.width } }).png().toFile(join(stateDirectory, "diff.png"));

          const limits = {
            maxGeometryDeltaPx: stateThreshold(state, route, "maxGeometryDeltaPx", 12),
            maxMissingSelectors: stateThreshold(state, route, "maxMissingSelectors", 0),
            maxPixelChangedRatio: stateThreshold(state, route, "maxPixelChangedRatio", 0.15),
            maxStyleMismatches: stateThreshold(state, route, "maxStyleMismatches", null),
            maxTextMismatches: stateThreshold(state, route, "maxTextMismatches", null),
          };
          const failures = [];
          if (new URL(source.page.url()).origin !== new URL(sourceBaseUrl).origin) failures.push("source redirected away from its configured origin");
          if (new URL(candidate.page.url()).origin !== new URL(candidateBaseUrl).origin) failures.push("candidate redirected away from its configured origin");
          if (new URL(source.page.url()).origin === new URL(candidate.page.url()).origin) failures.push("source and candidate converged on the same origin");
          if (comparison.changedRatio > limits.maxPixelChangedRatio) failures.push(`pixel ratio ${comparison.changedRatio.toFixed(4)} exceeds ${limits.maxPixelChangedRatio}`);
          if (dom.maximumBoxDelta > limits.maxGeometryDeltaPx) failures.push(`geometry delta ${dom.maximumBoxDelta.toFixed(2)}px exceeds ${limits.maxGeometryDeltaPx}px`);
          if (dom.missingSelectors > limits.maxMissingSelectors) failures.push(`${dom.missingSelectors} missing selector(s) exceeds ${limits.maxMissingSelectors}`);
          if (Number.isFinite(limits.maxStyleMismatches) && dom.styleMismatches > limits.maxStyleMismatches) failures.push(`${dom.styleMismatches} style mismatch(es) exceeds ${limits.maxStyleMismatches}`);
          if (Number.isFinite(limits.maxTextMismatches) && dom.textMismatches > limits.maxTextMismatches) failures.push(`${dom.textMismatches} text mismatch(es) exceeds ${limits.maxTextMismatches}`);
          if ((state.failOnRuntimeErrors ?? config.failOnRuntimeErrors) && (source.errors.length > 0 || candidate.errors.length > 0)) failures.push("runtime errors were recorded");
          Object.assign(entry, {
            candidate: { dom: candidateDom, errors: candidate.errors, page: candidatePage },
            comparison: {
              changedPixels: comparison.changedPixels,
              changedRatio: comparison.changedRatio,
              meanChannelDelta: comparison.meanChannelDelta,
            },
            dom,
            failures,
            limits,
            maskCoverage: { candidate: candidateMaskRatio, source: sourceMaskRatio },
            substituteMediaCoverage: { candidate: candidateSubstituteRatio, source: sourceSubstituteRatio },
            source: { dom: sourceDom, errors: source.errors, page: sourcePage, reference: sourceReference ? relative(repoRoot, sourceReference.localPath) : null },
          });
          entry.passed = failures.length === 0;
          if (!entry.passed) report.failures.push({ failures, id });
          console.log(`${entry.passed ? "PASS" : "FAIL"}  ${id}${failures.length ? ` - ${failures.join("; ")}` : ""}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          entry.error = message;
          report.failures.push({ id, message });
          console.log(`FAIL  ${id} - ${message}`);
        } finally {
          report.results.push(entry);
          await Promise.all([sourceContext.close(), candidateContext.close()]);
        }
      }
    }
  }
} finally {
  await browser.close();
  await fixtureServer?.close();
  await candidateFixtureServer?.close();
}

report.passed = report.failures.length === 0;
report.score = report.results.length === 0 ? 0 : report.results.filter((entry) => entry.passed).length / report.results.length;
mkdirSync(resolve(reportPath, ".."), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`\nFidelity comparison: ${report.results.filter((entry) => entry.passed).length}/${report.results.length} passed`);
console.log(`Report: ${relative(repoRoot, reportPath)}`);
if (!report.passed && !options.has("allow-fail")) process.exitCode = 1;
