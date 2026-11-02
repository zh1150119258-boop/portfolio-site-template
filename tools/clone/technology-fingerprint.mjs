#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { chromium } from "playwright";

import { startStaticFixtureServer } from "./lib/static-fixture-server.mjs";
import { option, parseCli, repoRoot } from "./lib/workbench-utils.mjs";

const { options, positionals } = parseCli(process.argv.slice(2));
let fixtureServer = null;
const fixtureRoot = option(options, "fixture-root");
if (fixtureRoot) fixtureServer = await startStaticFixtureServer(resolve(repoRoot, String(fixtureRoot)), String(option(options, "fallback", "fixture.html")));
const baseUrl = String(positionals[0] ?? option(options, "url", fixtureServer?.baseUrl ?? ""));
const path = String(option(options, "path", "/"));
if (!baseUrl) throw new Error("usage: technology-fingerprint.mjs <url> or --fixture-root <directory> [--path /route]");
const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href;
const hostName = new URL(url).hostname.replace(/[^a-z0-9.-]+/giu, "-");
const outputPath = resolve(repoRoot, String(option(options, "output", join(".workbench", "cache", "fingerprints", `${hostName}.json`))));

const browser = await chromium.launch({ headless: !options.has("headed") });
const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
await context.addInitScript(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  window.__workbenchCanvasContexts = [];
  HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
    window.__workbenchCanvasContexts.push(String(type));
    return original.call(this, type, ...args);
  };
});
const page = await context.newPage();
const runtimeErrors = [];
const bundleSignals = {
  framerMotion: false,
  gsap: false,
  lenis: false,
  locomotiveScroll: false,
  scrollTrigger: false,
  swiper: false,
  three: false,
};
const scriptBodyTasks = [];
let scannedScriptBytes = 0;
let scannedScriptCount = 0;
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
page.on("response", (response) => {
  if (response.request().resourceType() !== "script") return;
  scriptBodyTasks.push((async () => {
    try {
      const body = await response.body();
      if (body.length > 8_000_000 || scannedScriptBytes + body.length > 32_000_000) return;
      scannedScriptBytes += body.length;
      scannedScriptCount += 1;
      const source = body.toString("utf8");
      bundleSignals.framerMotion ||= /framer[\s._-]*motion|motionValue|AnimatePresence/iu.test(source);
      bundleSignals.gsap ||= /\bgsap\b|TweenLite|TimelineLite|GreenSock/iu.test(source);
      bundleSignals.lenis ||= /\bLenis\b|__lenis|lenis(?:\.min)?\.js/iu.test(source);
      bundleSignals.locomotiveScroll ||= /locomotive[\s._-]*scroll/iu.test(source);
      bundleSignals.scrollTrigger ||= /ScrollTrigger/iu.test(source);
      bundleSignals.swiper ||= /\bSwiper\b|swiper(?:-bundle)?/iu.test(source);
      bundleSignals.three ||= /WebGLRenderer|three(?:\.module)?\.js|REVISION:\s*["']\d+/iu.test(source);
    } catch {
      // Cross-origin or streamed script bodies may be unavailable; runtime evidence still applies.
    }
  })());
});

try {
  await page.goto(url, { timeout: Number(option(options, "timeout", 30000)), waitUntil: "domcontentloaded" });
  await page.waitForTimeout(Number(option(options, "settle-ms", 1200)));
  await Promise.allSettled([...scriptBodyTasks]);
  const fingerprint = await page.evaluate(() => {
    const scriptNodes = [...document.scripts];
    const scriptCorpus = scriptNodes.map((script) => `${script.src} ${script.textContent ?? ""}`).join("\n");
    const resourceUrls = performance.getEntriesByType("resource").map((entry) => entry.name);
    const resourceHosts = [...new Set(resourceUrls.flatMap((resource) => {
      try { return [new URL(resource, location.href).hostname]; } catch { return []; }
    }))].sort();
    const detects = (globalName, pattern) => Boolean(window[globalName]) || pattern.test(scriptCorpus);
    const canvases = [...document.querySelectorAll("canvas")];
    const videos = [...document.querySelectorAll("video")].map((video) => ({
      autoplay: video.autoplay,
      controls: video.controls,
      currentSrcHost: (() => { try { return new URL(video.currentSrc || video.src, location.href).hostname || null; } catch { return null; } })(),
      height: video.videoHeight,
      loop: video.loop,
      muted: video.muted,
      playsInline: video.playsInline,
      poster: Boolean(video.poster),
      preload: video.preload,
      readyState: video.readyState,
      width: video.videoWidth,
    }));
    const iframes = [...document.querySelectorAll("iframe")].map((iframe) => {
      try { return new URL(iframe.src, location.href).hostname; } catch { return "invalid"; }
    });
    const sameOriginLinks = [...document.links].filter((link) => link.origin === location.origin);
    const globalNames = Object.getOwnPropertyNames(window).map((name) => name.toLowerCase());
    const nextDetected = Boolean(document.querySelector("script[src*='_next']")) || Boolean(window.__NEXT_DATA__);
    const markers = {
      dataLenisCount: document.querySelectorAll("[data-lenis-prevent], [data-lenis-prevent-wheel], [data-lenis-prevent-touch]").length,
      dataScrollCount: document.querySelectorAll("[data-scroll], [data-scroll-container]").length,
      htmlClasses: [...document.documentElement.classList].filter((name) => /lenis|smooth|scroll/iu.test(name)),
      pinSpacerCount: document.querySelectorAll(".pin-spacer, [class*='pin-spacer']").length,
      scrollSmootherCount: document.querySelectorAll("#smooth-wrapper, #smooth-content, [data-scroll-container]").length,
    };
    const libraries = {
      framerMotion: /framer[\s._-]*motion/iu.test(scriptCorpus),
      gsap: detects("gsap", /\bgsap\b|TweenLite|TimelineLite/iu) || globalNames.some((name) => name.includes("gsap")),
      lenis: detects("Lenis", /\blenis\b/iu) || globalNames.some((name) => name.includes("lenis")) || markers.dataLenisCount > 0 || markers.htmlClasses.some((name) => /lenis/iu.test(name)),
      locomotiveScroll: /locomotive[\s._-]*scroll/iu.test(scriptCorpus),
      next: nextDetected,
      react: nextDetected || Boolean(document.querySelector("[data-reactroot], [data-reactid], #__next")) || /react-dom/iu.test(scriptCorpus),
      scrollTrigger: detects("ScrollTrigger", /ScrollTrigger/iu) || globalNames.some((name) => name.includes("scrolltrigger")) || markers.pinSpacerCount > 0,
      swiper: detects("Swiper", /\bswiper\b/iu),
      three: detects("THREE", /WebGLRenderer|three(?:\.module)?\.js/iu),
    };
    return {
      canvas: {
        contextsRequested: [...new Set(window.__workbenchCanvasContexts ?? [])],
        count: canvases.length,
        sizes: canvases.map((canvas) => ({ clientHeight: canvas.clientHeight, clientWidth: canvas.clientWidth, height: canvas.height, width: canvas.width })),
      },
      document: {
        animationCount: document.getAnimations().length,
        height: document.documentElement.scrollHeight,
        language: document.documentElement.lang || null,
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        title: document.title,
        width: document.documentElement.scrollWidth,
      },
      libraries,
      markers,
      media: { iframeHosts: [...new Set(iframes)].sort(), nativeVideos: videos },
      resources: { hosts: resourceHosts },
      routing: {
        sameOriginLinkCount: sameOriginLinks.length,
        uniqueSameOriginPaths: [...new Set(sameOriginLinks.map((link) => link.pathname))].length,
      },
      url: location.href,
    };
  });
  fingerprint.libraries = Object.fromEntries(Object.entries(fingerprint.libraries).map(([name, detected]) => [name, detected || bundleSignals[name] === true]));
  fingerprint.resources.scannedScriptBytes = scannedScriptBytes;
  fingerprint.resources.scannedScriptCount = scannedScriptCount;
  const recommendations = [];
  if (fingerprint.canvas.contextsRequested.some((contextType) => /webgl/iu.test(contextType)) || fingerprint.libraries.three) recommendations.push("inspect-webgl-scene");
  if (fingerprint.libraries.gsap || fingerprint.libraries.scrollTrigger) recommendations.push("load-gsap-skills");
  if (fingerprint.libraries.lenis || fingerprint.libraries.locomotiveScroll) recommendations.push("measure-wheel-and-touch-physics");
  if (fingerprint.media.nativeVideos.length > 0) recommendations.push("audit-native-video-readiness-and-overlays");
  if (fingerprint.document.height > 1800) recommendations.push("capture-long-form-scroll-states");
  const report = { ...fingerprint, recommendations, runtimeErrors, schemaVersion: 1 };
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`technology fingerprint: ${recommendations.join(", ") || "standard-dom"}`);
  console.log(`report: ${relative(repoRoot, outputPath)}`);
} finally {
  await context.close();
  await browser.close();
  await fixtureServer?.close();
}
