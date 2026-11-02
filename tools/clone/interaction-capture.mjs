#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { chromium } from "playwright";

import { captureDomEvidence, capturePageEvidence, performBrowserActions } from "./lib/browser-evidence.mjs";
import { startStaticFixtureServer } from "./lib/static-fixture-server.mjs";
import { installResourceOverrides } from "./lib/resource-overrides.mjs";
import { option, parseCli, readJson, repoRoot } from "./lib/workbench-utils.mjs";

const { options, positionals } = parseCli(process.argv.slice(2));
const configPath = resolve(repoRoot, positionals[0] ?? "fixtures/browser/interaction.plan.json");
if (!existsSync(configPath)) throw new Error(`interaction plan not found: ${relative(repoRoot, configPath)}`);
const config = readJson(configPath);
if (config.schemaVersion !== 1 || !Array.isArray(config.viewports) || !Array.isArray(config.states)) {
  throw new Error("interaction plan must contain schemaVersion 1, viewports, and states");
}
const expectedResultCount = config.viewports.reduce((total, viewport) => total + config.states
  .filter((state) => !state.viewports || state.viewports.includes(viewport.name)).length, 0);
if (expectedResultCount === 0) throw new Error("interaction plan schedules zero state/viewport results");

const outputDirectory = resolve(repoRoot, String(option(options, "output", ".workbench/interactions")));
const reportPath = resolve(repoRoot, String(option(options, "report", join(outputDirectory, "report.json"))));
mkdirSync(outputDirectory, { recursive: true });
const safeName = (value) => String(value).replace(/[^a-z0-9_-]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase();

let fixtureServer = null;
if (config.fixtureRoot) fixtureServer = await startStaticFixtureServer(resolve(repoRoot, config.fixtureRoot), config.fallbackFile ?? "fixture.html");
const baseUrl = String(option(options, "url", config.baseUrl ?? fixtureServer?.baseUrl ?? ""));
if (!baseUrl) throw new Error("provide --url or configure fixtureRoot");

const browser = await chromium.launch({ headless: !options.has("headed") });
const report = { baseUrl, config: relative(repoRoot, configPath), results: [], schemaVersion: 1 };
try {
  for (const viewport of config.viewports) {
    for (const state of config.states) {
      if (state.viewports && !state.viewports.includes(viewport.name)) continue;
      const context = await browser.newContext({
        hasTouch: state.hasTouch ?? false,
        isMobile: state.isMobile ?? false,
        reducedMotion: state.reducedMotion ?? "no-preference",
        viewport: { height: viewport.height, width: viewport.width },
      });
      await installResourceOverrides(context, state.resourceOverrides ?? config.resourceOverrides ?? []);
      const page = await context.newPage();
      const id = `${state.id}-${viewport.name}`;
      try {
        await page.goto(new URL(state.path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href, {
          timeout: state.navigationTimeoutMs ?? config.navigationTimeoutMs ?? 30000,
          waitUntil: state.waitUntil ?? config.waitUntil ?? "domcontentloaded",
        });
        if (config.readyExpression) await page.waitForFunction(config.readyExpression);
        if (state.readyDelayMs ?? config.readyDelayMs) await page.waitForTimeout(state.readyDelayMs ?? config.readyDelayMs);
        await performBrowserActions(page, state.setupActions ?? []);
        await performBrowserActions(page, state.triggerActions ?? []);
        const frames = [];
        let elapsed = 0;
        for (const timestamp of [...new Set(state.timestampsMs ?? [0, 50, 180, 500])].sort((left, right) => left - right)) {
          await page.waitForTimeout(Math.max(0, timestamp - elapsed));
          elapsed = timestamp;
          const frameId = `${safeName(id)}-${String(timestamp).padStart(4, "0")}ms`;
          const screenshotPath = join(outputDirectory, `${frameId}.png`);
          await page.screenshot({ animations: "allow", caret: "hide", fullPage: state.fullPage ?? false, path: screenshotPath });
          frames.push({
            dom: await captureDomEvidence(page, state.selectors ?? []),
            page: await capturePageEvidence(page),
            screenshot: relative(repoRoot, screenshotPath),
            timestampMs: timestamp,
          });
        }
        report.results.push({ frames, id, passed: true });
        console.log(`PASS  ${id} - ${frames.length} frame(s)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.results.push({ error: message, id, passed: false });
        console.log(`FAIL  ${id} - ${message}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await fixtureServer?.close();
}

report.passed = report.results.every((entry) => entry.passed);
mkdirSync(resolve(reportPath, ".."), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`\nInteraction capture: ${report.results.filter((entry) => entry.passed).length}/${report.results.length} passed`);
console.log(`Report: ${relative(repoRoot, reportPath)}`);
if (!report.passed) process.exitCode = 1;
