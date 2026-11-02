function fail(message) {
  throw new Error(message);
}

function origin(value, label) {
  try {
    const url = new URL(value);
    if (!/^https?:$/u.test(url.protocol)) fail(`${label} must use http or https`);
    return url.origin;
  } catch {
    fail(`${label} must be a valid URL`);
  }
}

function statesByRoute(matrix) {
  return new Map((matrix.routes ?? []).map((route) => [route.id, new Map((route.states ?? []).map((state) => [state.id, state]))]));
}

function stateSupportsViewports(state, requiredViewports) {
  return !Array.isArray(state.viewports) || requiredViewports.every((name) => state.viewports.includes(name));
}

function viewportNames(matrix) {
  return new Set((matrix.viewports ?? []).map((viewport) => viewport.name));
}

function validateCanvasAssertions(browserMatrix, highRiskBrowserStates) {
  for (const key of highRiskBrowserStates) {
    const [routeId, stateId] = key.split("\0");
    const state = (browserMatrix.routes ?? [])
      .find((route) => route.id === routeId)?.states
      ?.find((entry) => entry.id === stateId);
    for (const assertion of state?.assertions ?? []) {
      if (assertion.type !== "canvas-nonblank") continue;
      if (!Array.isArray(assertion.expectedBackground) || assertion.expectedBackground.length < 3) {
        fail("high-risk canvas-nonblank assertions require expectedBackground RGB evidence");
      }
      if (!Number.isFinite(assertion.threshold) || assertion.threshold <= 0) {
        fail("high-risk canvas-nonblank assertions require a positive threshold");
      }
      const minimum = assertion.minimumChangedSamples;
      const ratio = assertion.minimumChangedRatio;
      if ((!Number.isFinite(minimum) || minimum < 2) && (!Number.isFinite(ratio) || ratio <= 0)) {
        fail("high-risk canvas-nonblank assertions require multiple foreground samples or a positive ratio");
      }
      const hasRuntimeReadiness = (state.assertions ?? []).some((candidate) => candidate.type === "attribute"
        && candidate.selector === assertion.selector
        && /status|ready/iu.test(candidate.name ?? "")
        && candidate.value === "ready");
      if (!hasRuntimeReadiness) {
        fail("high-risk canvas-nonblank assertions require a matching runtime ready attribute");
      }
    }
  }
}

function validateThresholds(matrix) {
  const groups = [matrix.thresholds, ...(matrix.routes ?? []).flatMap((route) => [route.thresholds, ...(route.states ?? []).map((state) => state.thresholds)])].filter(Boolean);
  for (const thresholds of groups) {
    const finite = (name) => thresholds[name] === undefined || Number.isFinite(thresholds[name]);
    if (!["channelThreshold", "maxGeometryDeltaPx", "maxMissingSelectors", "maxPixelChangedRatio", "maxStyleMismatches", "maxTextMismatches"].every(finite)) {
      fail("fidelity thresholds must be finite numbers");
    }
    if (thresholds.channelThreshold !== undefined && (thresholds.channelThreshold < 0 || thresholds.channelThreshold > 0.2)) fail("channelThreshold must be between 0 and 0.2");
    if (thresholds.maxPixelChangedRatio !== undefined && (thresholds.maxPixelChangedRatio < 0 || thresholds.maxPixelChangedRatio > 0.25)) fail("maxPixelChangedRatio must be between 0 and 0.25");
    if (thresholds.maxGeometryDeltaPx !== undefined && (thresholds.maxGeometryDeltaPx < 0 || thresholds.maxGeometryDeltaPx > 32)) fail("maxGeometryDeltaPx must be between 0 and 32");
    if (thresholds.maxMissingSelectors !== undefined && thresholds.maxMissingSelectors !== 0) fail("maxMissingSelectors must be 0 at completion");
    if (thresholds.maxStyleMismatches !== undefined && thresholds.maxStyleMismatches < 0) fail("maxStyleMismatches cannot be negative");
    if (thresholds.maxTextMismatches !== undefined && thresholds.maxTextMismatches !== 0) fail("maxTextMismatches must be 0 at completion");
  }
}

function validateMasks(matrix) {
  const forbidden = new Set(["*", "body", "html", "main", "#__next", "#root"]);
  for (const route of matrix.routes ?? []) {
    for (const state of route.states ?? []) {
      const masks = state.maskSelectors ?? route.maskSelectors ?? matrix.maskSelectors ?? [];
      if (!Array.isArray(masks) || masks.length > 4) fail("maskSelectors must be an array with at most four targeted selectors");
      if (masks.some((selector) => typeof selector !== "string" || forbidden.has(selector.trim().toLowerCase()))) fail("maskSelectors cannot hide the full page or application root");
      if (masks.length > 0 && typeof state.maskReason !== "string") fail("masked fidelity states require maskReason");
    }
  }
}

function validateSubstituteMedia(matrix) {
  const forbidden = new Set(["*", "body", "html", "main", "canvas", "#__next", "#root"]);
  for (const route of matrix.routes ?? []) {
    for (const state of route.states ?? []) {
      const selectors = state.substituteMediaSelectors ?? route.substituteMediaSelectors ?? matrix.substituteMediaSelectors ?? [];
      if (!Array.isArray(selectors) || selectors.length > 12) fail("substituteMediaSelectors must be an array with at most twelve targeted media selectors");
      if (selectors.some((selector) => typeof selector !== "string" || !selector.trim() || forbidden.has(selector.trim().toLowerCase()))) {
        fail("substituteMediaSelectors cannot target canvas, full-page roots, or generic selectors");
      }
      if (selectors.length > 0 && state.sourceReference) {
        fail("substituteMediaSelectors require a live source page; fixed sourceReference images have no auditable media bounds");
      }
    }
  }
}

function importedSiteIds(source) {
  if (typeof source !== "string") return [];
  return [...source.matchAll(/\bfrom\s+["']@\/sites\/([a-z0-9][a-z0-9-]*)\//gu)].map((match) => match[1]);
}

function validateActiveSite(activeAppSource, siteId) {
  const expectedImport = new RegExp(`\\bfrom\\s+["']@/sites/${siteId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/`, "u");

  // New callers provide each route entry independently. Layout metadata/imports are
  // intentionally not evidence that either rendered route mounts this adapter.
  if (activeAppSource && typeof activeAppSource === "object" && !Array.isArray(activeAppSource)) {
    for (const [label, source] of [["root page", activeAppSource.rootPage], ["catch-all page", activeAppSource.catchAllPage]]) {
      if (typeof source !== "string" || !expectedImport.test(source)) {
        fail(`${label} does not mount ${siteId}`);
      }
      if (importedSiteIds(source).some((importedSiteId) => importedSiteId !== siteId)) {
        fail(`${label} imports an adapter other than ${siteId}`);
      }
    }
    return;
  }

  // Keep existing consumers working until they pass separate entry sources. A joined
  // source cannot identify the boundary between root and catch-all pages, so accept it
  // only when it contains two target adapter imports and no competing site adapter.
  const imported = importedSiteIds(activeAppSource);
  if (imported.filter((importedSiteId) => importedSiteId === siteId).length < 2 || imported.some((importedSiteId) => importedSiteId !== siteId)) {
    fail(`root page and catch-all page must both mount ${siteId}`);
  }
}

export function validateCompletionPolicy({ activeAppSource, browserMatrix, candidateBaseUrl, fidelityMatrix, siteId, stateMatrix, targetUrl }) {
  const sourceOrigin = origin(fidelityMatrix.sourceBaseUrl, "sourceBaseUrl");
  const candidateOrigin = origin(candidateBaseUrl, "candidateBaseUrl");
  if (sourceOrigin !== origin(targetUrl, "target URL")) fail("sourceBaseUrl origin must match target-url.txt");
  if (sourceOrigin === candidateOrigin) fail("source and candidate must use different origins");
  validateActiveSite(activeAppSource, siteId);

  for (const [label, matrix] of [["browser", browserMatrix], ["fidelity", fidelityMatrix]]) {
    if (matrix.schemaVersion !== 1 || !Array.isArray(matrix.viewports) || matrix.viewports.length < 2) fail(`${label} matrix requires schemaVersion 1 and at least two viewports`);
    if (!Array.isArray(matrix.routes) || matrix.routes.length === 0) fail(`${label} matrix requires at least one route`);
    if (matrix.routes.some((route) => !route.id || !Array.isArray(route.states) || route.states.length === 0)) fail(`${label} matrix routes require ids and states`);
  }
  validateThresholds(fidelityMatrix);
  validateMasks(fidelityMatrix);
  validateSubstituteMedia(fidelityMatrix);

  if (!Array.isArray(stateMatrix.states) || stateMatrix.states.length === 0) fail("STATE_MATRIX requires states");
  if (!stateMatrix.states.some((state) => state.risk === "high")) fail("completion requires at least one high-risk state");
  const browserRoutes = statesByRoute(browserMatrix);
  const fidelityRoutes = statesByRoute(fidelityMatrix);
  const browserViewports = viewportNames(browserMatrix);
  const fidelityViewports = viewportNames(fidelityMatrix);
  const highRiskBrowserStates = new Set();
  for (const state of stateMatrix.states) {
    if (!state || !["low", "high"].includes(state.risk)) fail("every state requires risk: low|high");
    const verification = state.verification;
    if (!verification || typeof verification.sourceEvidence !== "string" || !verification.sourceEvidence.trim()) fail("every state requires source evidence");
    const browserState = browserRoutes.get(verification.browserRoute)?.get(verification.browserState);
    if (!browserState) fail("state references a missing browser route/state");
    const requiredViewports = state.viewport === "all"
      ? [...new Set((stateMatrix.viewports ?? []).map((viewport) => viewport.name))]
      : String(state.viewport ?? "").split(/[\s,/]+/u).filter(Boolean);
    if (requiredViewports.length === 0) fail("high-risk states require viewport coverage");
    if (requiredViewports.some((name) => !browserViewports.has(name))) fail("state viewport is missing from browser coverage");
    if (!stateSupportsViewports(browserState, requiredViewports)) fail("browser state excludes a required viewport");
    if (state.risk === "low") {
      if (typeof state.lowRiskRationale !== "string" || state.lowRiskRationale.trim().length < 20) fail("low-risk states require a substantive lowRiskRationale");
      continue;
    }
    highRiskBrowserStates.add(`${verification.browserRoute}\0${verification.browserState}`);
    const fidelityState = fidelityRoutes.get(verification.fidelityRoute)?.get(verification.fidelityState);
    if (!fidelityState) fail("high-risk state references a missing fidelity route/state");
    if (requiredViewports.some((name) => !fidelityViewports.has(name))) fail("high-risk state viewport is missing from fidelity coverage");
    if (!stateSupportsViewports(fidelityState, requiredViewports)) fail("fidelity state excludes a required viewport");
  }
  validateCanvasAssertions(browserMatrix, highRiskBrowserStates);
}

export function validateFidelityInputs(matrix, sourceBaseUrl, candidateBaseUrl) {
  if (origin(sourceBaseUrl, "sourceBaseUrl") === origin(candidateBaseUrl, "candidateBaseUrl")) fail("source and candidate must use different origins");
  if (matrix.schemaVersion !== 1 || !Array.isArray(matrix.viewports) || matrix.viewports.length === 0) fail("fidelity matrix requires schemaVersion 1 and at least one viewport");
  if (!Array.isArray(matrix.routes) || matrix.routes.length === 0 || matrix.routes.some((route) => !Array.isArray(route.states) || route.states.length === 0)) fail("fidelity matrix requires routes with states");
  validateThresholds(matrix);
  validateMasks(matrix);
  validateSubstituteMedia(matrix);
}

export function assertReportPassed(report, label) {
  if (report?.passed !== true || !Array.isArray(report.results) || report.results.length === 0) fail(`${label} report must contain at least one passing result`);
  if (report.results.some((entry) => entry.passed !== true)) fail(`${label} report contains a failed result`);
}
