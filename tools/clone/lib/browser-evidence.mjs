const browserTargets = new WeakMap();
const browserDownloads = new WeakMap();

function requireSyntheticValue(value, label) {
  if (typeof value !== "string" || !/^(fixture|synthetic|test)-[a-z0-9][a-z0-9._-]{0,127}$/iu.test(value)) {
    throw new Error(`${label} must be a synthetic fixture/test value`);
  }
}

function validateSyntheticLoginState(loginState) {
  if (!loginState || typeof loginState !== "object") throw new Error("login state must be an object");
  const cookies = loginState.cookies ?? [];
  const localStorage = loginState.localStorage ?? [];
  if (!Array.isArray(cookies) || !Array.isArray(localStorage)) throw new Error("login state cookies and localStorage must be arrays");
  for (const cookie of cookies) {
    if (!cookie || typeof cookie.name !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/iu.test(cookie.name)) throw new Error("login cookie name is invalid");
    if (Object.keys(cookie).some((key) => !["name", "value"].includes(key))) throw new Error("login cookies may only set name and value on the current fixture origin");
    requireSyntheticValue(cookie.value, `login cookie ${cookie.name}`);
  }
  for (const entry of localStorage) {
    if (!entry || typeof entry.key !== "string" || !/^[a-z0-9][a-z0-9._-]{0,95}$/iu.test(entry.key)) throw new Error("login localStorage key is invalid");
    requireSyntheticValue(entry.value, `login localStorage ${entry.key}`);
  }
  return { cookies, localStorage };
}

function validateUploadFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("upload requires at least one inline synthetic file");
  return files.map((file) => {
    if (!file || typeof file !== "object" || typeof file.name !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(file.name)) {
      throw new Error("upload filename must be a safe basename");
    }
    if (typeof file.text !== "string" || Buffer.byteLength(file.text, "utf8") > 1024 * 1024) throw new Error("upload text must be an inline value no larger than 1 MiB");
    if (file.mimeType !== undefined && (typeof file.mimeType !== "string" || !/^[a-z]+\/[a-z0-9.+-]+$/iu.test(file.mimeType))) {
      throw new Error("upload mimeType is invalid");
    }
    return { buffer: Buffer.from(file.text, "utf8"), mimeType: file.mimeType ?? "text/plain", name: file.name };
  });
}

async function frameFor(page, frameSelector) {
  if (typeof frameSelector !== "string" || !frameSelector) throw new Error("iframe action requires frameSelector");
  const handle = await page.locator(frameSelector).elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error(`cannot access iframe ${frameSelector}`);
  return frame;
}

function targetsFor(page) {
  if (!browserTargets.has(page)) browserTargets.set(page, new Map());
  return browserTargets.get(page);
}

export async function installSyntheticLoginState(context, page, originUrl, loginState) {
  const { cookies, localStorage } = validateSyntheticLoginState(loginState);
  const origin = new URL(originUrl).origin;
  if (cookies.length > 0) {
    await context.addCookies(cookies.map((cookie) => ({
      name: cookie.name,
      sameSite: cookie.sameSite ?? "Lax",
      url: origin,
      value: cookie.value,
    })));
  }
  if (localStorage.length > 0) {
    await page.addInitScript((entries) => {
      for (const entry of entries) localStorage.setItem(entry.key, entry.value);
    }, localStorage);
  }
}

export async function getBrowserFrame(page, frameSelector) {
  return frameFor(page, frameSelector);
}

export function getBrowserTarget(page, name = "popup") {
  return targetsFor(page).get(name) ?? null;
}

export function getBrowserDownloads(page) {
  return browserDownloads.get(page) ?? [];
}

export async function performBrowserAction(page, action) {
  switch (action.type) {
    case "click":
      await page.locator(action.selector).click();
      break;
    case "drag": {
      const box = await page.locator(action.selector).boundingBox();
      if (!box) throw new Error(`cannot drag missing selector ${action.selector}`);
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + (action.deltaX ?? 0), startY + (action.deltaY ?? 0), { steps: action.steps ?? 8 });
      await page.mouse.up();
      break;
    }
    case "fill":
      await page.locator(action.selector).fill(action.value ?? "");
      break;
    case "history-back": {
      const beforeUrl = page.url();
      await page.goBack({ waitUntil: action.waitUntil ?? "commit", timeout: action.timeoutMs ?? 5000 });
      if (action.waitMs) await page.waitForTimeout(action.waitMs);
      if (action.urlPattern && !new RegExp(action.urlPattern).test(page.url())) {
        throw new Error(`history Back URL ${page.url()} does not match ${action.urlPattern}`);
      }
      if (page.url() === beforeUrl && action.allowUnchanged !== true) throw new Error("browser history Back did not change the URL");
      break;
    }
    case "history-forward": {
      const beforeUrl = page.url();
      await page.goForward({ waitUntil: action.waitUntil ?? "commit", timeout: action.timeoutMs ?? 5000 });
      if (action.waitMs) await page.waitForTimeout(action.waitMs);
      if (action.urlPattern && !new RegExp(action.urlPattern).test(page.url())) {
        throw new Error(`history Forward URL ${page.url()} does not match ${action.urlPattern}`);
      }
      if (page.url() === beforeUrl && action.allowUnchanged !== true) throw new Error("browser history Forward did not change the URL");
      break;
    }
    case "wait-for-attribute":
      await page.locator(action.selector).waitFor({ state: "attached", timeout: action.timeoutMs ?? 5000 });
      await page.waitForFunction(
        ({ name, selector, value }) => document.querySelector(selector)?.getAttribute(name) === value,
        { name: action.name, selector: action.selector, value: action.value },
        { timeout: action.timeoutMs ?? 5000 },
      );
      break;
    case "frame-click":
      await (await frameFor(page, action.frameSelector)).locator(action.selector).click();
      break;
    case "frame-fill":
      await (await frameFor(page, action.frameSelector)).locator(action.selector).fill(action.value ?? "");
      break;
    case "frame-press":
      await (await frameFor(page, action.frameSelector)).locator(action.selector).press(action.key);
      break;
    case "hover":
      await page.locator(action.selector).hover({
        position: action.x === undefined && action.y === undefined
          ? undefined
          : { x: action.x ?? 0, y: action.y ?? 0 },
      });
      break;
    case "press":
      await page.keyboard.press(action.key);
      break;
    case "inject-login-state":
      await installSyntheticLoginState(page.context(), page, page.url(), action.loginState);
      await page.evaluate((entries) => {
        for (const entry of entries) localStorage.setItem(entry.key, entry.value);
        window.dispatchEvent(new Event("browser-audit-login-state"));
      }, validateSyntheticLoginState(action.loginState).localStorage);
      break;
    case "open-popup": {
      const target = action.target ?? "popup";
      if (typeof target !== "string" || !/^[a-z0-9_-]{1,48}$/iu.test(target)) throw new Error("popup target is invalid");
      const [popup] = await Promise.all([
        page.waitForEvent("popup", { timeout: action.timeoutMs ?? 5000 }),
        page.locator(action.selector).click(),
      ]);
      await popup.waitForLoadState(action.waitUntil ?? "domcontentloaded");
      targetsFor(page).set(target, popup);
      break;
    }
    case "upload-files":
      await page.locator(action.selector).setInputFiles(validateUploadFiles(action.files));
      break;
    case "download": {
      const download = await Promise.all([
        page.waitForEvent("download", { timeout: action.timeoutMs ?? 5000 }),
        page.locator(action.selector).click(),
      ]).then(([value]) => value);
      const downloads = browserDownloads.get(page) ?? [];
      downloads.push(download);
      browserDownloads.set(page, downloads);
      break;
    }
    case "realtime-send": {
      if (typeof action.message !== "string" || action.message.length > 1024) throw new Error("realtime message must be a short string");
      await page.evaluate((message) => {
        if (!window.fixtureRealtime || typeof window.fixtureRealtime.send !== "function") throw new Error("fixture realtime bridge is unavailable");
        window.fixtureRealtime.send(message);
      }, action.message);
      break;
    }
    case "expect-rejection": {
      if (!action.action || action.action.type === "expect-rejection") throw new Error("expect-rejection requires one non-recursive action");
      try {
        await performBrowserAction(page, action.action);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (action.messagePattern && !new RegExp(action.messagePattern).test(message)) throw new Error(`rejection did not match ${action.messagePattern}: ${message}`);
        break;
      }
      throw new Error("expected browser action to be rejected");
    }
    case "seekAnimations": {
      const animationCount = await page.evaluate(async (timeMs) => {
        await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
        const animations = document.getAnimations({ subtree: true });
        for (const animation of animations) {
          animation.pause();
          animation.currentTime = timeMs;
        }
        document.documentElement.getBoundingClientRect();
        await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
        return animations.length;
      }, action.ms ?? 0);
      if (action.requireAnimations !== false && animationCount === 0) {
        throw new Error("seekAnimations found no active animations");
      }
      break;
    }
    case "scrollTo":
      await page.evaluate((value) => window.scrollTo({ left: value.x ?? 0, top: value.y ?? 0 }), action);
      break;
    case "touchSwipe": {
      const session = await page.context().newCDPSession(page);
      const x = action.x ?? Math.round((await page.evaluate(() => innerWidth)) / 2);
      const startY = action.startY ?? Math.round((await page.evaluate(() => innerHeight)) * 0.8);
      const deltaY = action.deltaY ?? 480;
      const steps = action.steps ?? 8;
      const dispatch = (type, y) => session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 3, radiusY: 3, force: 1 }],
        modifiers: 0,
      });
      await dispatch("touchStart", startY);
      for (let index = 1; index <= steps; index += 1) {
        await dispatch("touchMove", startY - (deltaY * index) / steps);
        await page.waitForTimeout(action.stepMs ?? 16);
      }
      await dispatch("touchEnd", startY - deltaY);
      await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
      const releasedAt = await page.evaluate(() => scrollY);
      await page.evaluate((value) => { window.__browserAuditTouchReleaseY = value; }, releasedAt);
      await session.detach();
      break;
    }
    case "wait":
      await page.waitForTimeout(action.ms ?? 0);
      break;
    case "wheel":
      await page.mouse.wheel(action.deltaX ?? 0, action.deltaY ?? 0);
      break;
    default:
      throw new Error(`unsupported browser action: ${action.type}`);
  }
}

export async function performBrowserActions(page, actions = []) {
  for (const action of actions) await performBrowserAction(page, action);
}

export async function captureDomEvidence(page, selectorEntries = []) {
  const evidence = {};
  for (const entry of selectorEntries) {
    const selector = typeof entry === "string" ? entry : entry.selector;
    const id = typeof entry === "string" ? entry : entry.id ?? entry.selector;
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count === 0) {
      evidence[id] = { count: 0, exists: false, selector };
      continue;
    }
    evidence[id] = await locator.first().evaluate((node, values) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const trackedStyles = [
        "background-color",
        "border-radius",
        "clip-path",
        "color",
        "display",
        "filter",
        "font-family",
        "font-size",
        "font-style",
        "font-weight",
        "letter-spacing",
        "line-height",
        "opacity",
        "position",
        "text-transform",
        "transform",
        "visibility",
        "z-index",
      ];
      return {
        attributes: {
          ariaExpanded: node.getAttribute("aria-expanded"),
          ariaHidden: node.getAttribute("aria-hidden"),
          role: node.getAttribute("role"),
        },
        box: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
        count: values.count,
        exists: true,
        inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
        selector: values.selector,
        styles: Object.fromEntries(trackedStyles.map((property) => [property, style.getPropertyValue(property).trim()])),
        tag: node.tagName.toLowerCase(),
        text: (node.textContent ?? "").replace(/\s+/gu, " ").trim().slice(0, 500),
        visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0,
      };
    }, { count, selector });
  }
  return evidence;
}

export async function capturePageEvidence(page) {
  return page.evaluate(() => ({
    activeElement: document.activeElement instanceof HTMLElement
      ? document.activeElement.getAttribute("aria-label") || document.activeElement.id || document.activeElement.tagName.toLowerCase()
      : null,
    animationCount: document.getAnimations().length,
    document: {
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
    },
    scroll: { x: scrollX, y: scrollY },
    title: document.title,
    url: location.href,
    viewport: { height: innerHeight, width: innerWidth },
  }));
}
