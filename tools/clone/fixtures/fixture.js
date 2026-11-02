const pages = {
  marketing: {
    description: "Marketing page interaction fixture",
    title: "Northstar Studio",
    content: `
      <h1>Launch focused products without losing the details.</h1>
      <div data-dialog-background><p class="lede">A restrained marketing layout with navigation, calls to action, responsive cards, and an accessible dialog.</p>
      <div class="actions"><button class="button" data-open-dialog>Request a demo</button><a class="button secondary" href="#features">View features</a><a class="button secondary" data-history-link href="/editorial">Read editorial</a></div>
      <section class="grid" id="features" aria-label="Features"><article class="panel"><h2>Research</h2><p>Capture source evidence.</p></article><article class="panel"><h2>Build</h2><p>Keep implementation isolated.</p></article><article class="panel"><h2>Verify</h2><p>Exercise every state.</p></article></section></div>
      <dialog aria-labelledby="dialog-title"><h2 id="dialog-title">Request a demo</h2><p>Dialog state is keyboard dismissible.</p><a class="button secondary" href="#features">View features</a><button class="button" data-close-dialog>Close</button></dialog>`,
  },
  editorial: {
    description: "Editorial article layout fixture",
    title: "Field Notes",
    content: `
      <article class="article"><p>Issue 04 / Systems</p><h1>Design evidence is a living contract.</h1><div class="figure" role="img" aria-label="Abstract editorial placeholder">Editorial figure</div><p>High-fidelity work improves when observations, intermediate states, and implementation decisions remain connected.</p><p>A static screenshot can describe composition, but it cannot establish input physics, route history, or transition timing.</p></article>`,
  },
  commerce: {
    description: "Commerce product grid fixture",
    title: "Common Goods",
    content: `
      <h1>Everyday equipment, clearly compared.</h1><section class="grid" aria-label="Products"><article class="panel"><h2>Desk Lamp</h2><p class="product-price">$88</p><button class="button" data-open-drawer>Add to cart</button></article><article class="panel"><h2>Steel Tray</h2><p class="product-price">$42</p><button class="button" data-open-drawer>Add to cart</button></article><article class="panel"><h2>Wool Pad</h2><p class="product-price">$56</p><button class="button" data-open-drawer>Add to cart</button></article></section>
      <aside class="drawer" aria-label="Shopping cart" hidden><h2>Your cart</h2><p>Desk Lamp, quantity 1</p><button class="button" data-close-drawer>Close cart</button></aside>`,
  },
  dashboard: {
    description: "SaaS dashboard fixture",
    title: "Signal Desk",
    content: `
      <h1>Operations overview</h1><div class="tabs" role="tablist"><button class="button secondary" role="tab" aria-selected="true" data-tab="active">Active</button><button class="button secondary" role="tab" aria-selected="false" data-tab="archived">Archived</button></div>
      <section class="panel" data-tab-panel><h2>Active projects</h2><table><thead><tr><th scope="col">Project</th><th scope="col">Owner</th><th scope="col">Status</th></tr></thead><tbody><tr><td>Atlas</td><td>Mina</td><td>Review</td></tr><tr><td>Beacon</td><td>Sam</td><td>Build</td></tr></tbody></table></section>`,
  },
  forms: {
    description: "Form validation fixture",
    title: "Account Access",
    content: `
      <h1>Sign in to continue</h1><p class="lede">A keyboard-friendly form with labels, validation, and a deterministic success state.</p><form novalidate><label>Email<input name="email" type="email" autocomplete="email" required /></label><label>Password<input name="password" type="password" autocomplete="current-password" required /></label><button class="button" type="submit">Sign in</button><p class="status" role="status" aria-live="polite"></p></form>`,
  },
  immersive: {
    description: "WebGL and reduced-motion fixture",
    title: "Light Field",
    content: `
      <h1>Pointer-independent WebGL lifecycle</h1><p class="lede">A deterministic WebGL scene verifies context creation, visible pixels, time-driven change, and reduced-motion fallback.</p><div class="canvas-wrap"><canvas width="640" height="360" aria-label="Animated WebGL field"></canvas></div><div class="media-controls"><button class="button" data-toggle-canvas data-frame-count="0">Pause</button></div>`,
  },
  popup: {
    description: "Synthetic popup fixture",
    title: "Fixture Popup",
    content: `<h1>Fixture popup</h1><p data-popup-message>Popup opened from the local browser benchmark.</p>`,
  },
  "complex-browser": {
    description: "Synthetic advanced browser workflow fixture",
    title: "Browser Workflow Lab",
    content: `
      <h1>Browser workflow lab</h1>
      <p class="lede" data-login-status>Anonymous fixture session</p>
      <section class="panel" aria-label="Embedded workflow"><h2>Embedded workflow</h2><iframe data-workflow-frame title="Fixture embedded workflow" src="/iframe.html"></iframe><p class="status" data-frame-status></p></section>
      <section class="panel" aria-label="Browser transfer workflow"><h2>Browser transfer workflow</h2><button class="button" data-open-popup>Open fixture popup</button><a class="button secondary" data-download href="/__fixture-download__">Download fixture report</a><label>Fixture attachment<input data-upload type="file" accept="text/plain" /></label><p class="status" data-upload-status></p></section>
      <section class="panel" aria-label="Realtime workflow"><h2>Realtime workflow</h2><button class="button" data-send-realtime>Send fixture ping</button><p class="status" data-realtime-status>Connecting</p></section>`,
  },
  "video-editorial": {
    description: "Native video, smooth scroll, and long-form editorial fixture",
    title: "Moving Field Notes",
    content: `
      <article class="video-editorial" data-editorial>
        <section class="video-hero">
          <video data-native-video autoplay muted loop playsinline aria-label="Editorial hero video"></video>
          <div><p>Field Journal / 01</p><h1>Motion belongs to the reading rhythm.</h1><button class="button" data-open-film>Watch film</button></div>
        </section>
        ${Array.from({ length: 6 }, (_, index) => `<section class="editorial-chapter"><p>Chapter ${String(index + 1).padStart(2, "0")}</p><h2>${["Arrival", "Material", "Weather", "Distance", "Practice", "Return"][index]}</h2><p>Long-form layout supplies enough measured distance for scroll trajectories, pinned moments, and reveal thresholds without relying on target-site content.</p></section>`).join("")}
      </article>
      <div class="film-overlay" data-film-overlay data-phase="closed" hidden>
        <div class="film-backdrop"></div>
        <div class="film-surface"><div class="film-media-slot"></div><button class="button" data-close-film>Close film</button></div>
      </div>`,
  },
};

const key = location.pathname.split("/").filter(Boolean).at(-1) || "marketing";
const page = pages[key] || pages.marketing;
document.title = page.title;
document.querySelector('meta[name="description"]').setAttribute("content", page.description);
document.querySelector("#app").innerHTML = `
  <header class="site-header shell"><a class="brand" href="/marketing">Workbench Fixture</a><nav class="nav" aria-label="Fixture pages"><a href="/editorial">Editorial</a><a href="/commerce">Commerce</a><a href="/dashboard">Dashboard</a><a href="/forms">Forms</a><a href="/immersive">Immersive</a></nav></header>
  <main class="shell" id="main" tabindex="-1">${page.content}</main>`;

const dialog = document.querySelector("dialog");
const dialogBackground = document.querySelector("[data-dialog-background]");
let dialogOpener = null;
const dialogFocusable = () => [...dialog?.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []];
document.querySelector("[data-open-dialog]")?.addEventListener("click", () => {
  dialogOpener = document.activeElement;
  dialogBackground.inert = true;
  dialog.showModal();
  dialogFocusable()[0]?.focus();
});
document.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close());
dialog?.addEventListener("close", () => {
  dialogBackground.inert = false;
  dialogOpener?.focus();
});
dialog?.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const items = dialogFocusable();
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

const drawer = document.querySelector(".drawer");
document.querySelectorAll("[data-open-drawer]").forEach((button) => button.addEventListener("click", () => { drawer.hidden = false; }));
document.querySelector("[data-close-drawer]")?.addEventListener("click", () => { drawer.hidden = true; });

document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-tab]").forEach((candidate) => candidate.setAttribute("aria-selected", String(candidate === button)));
  document.querySelector("[data-tab-panel] h2").textContent = button.dataset.tab === "archived" ? "Archived projects" : "Active projects";
}));

document.querySelector("form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const status = document.querySelector(".status");
  status.textContent = data.get("email") && data.get("password") ? "Signed in for fixture testing" : "Complete both fields";
});

function initializeComplexBrowser() {
  if (key !== "complex-browser") return Promise.resolve();
  const loginStatus = document.querySelector("[data-login-status]");
  const updateLoginStatus = () => {
    const hasCookie = document.cookie.split("; ").includes("fixture_session=fixture-session-accepted");
    const hasLocalSession = localStorage.getItem("fixture.auth.state") === "synthetic-authenticated";
    loginStatus.textContent = hasCookie && hasLocalSession ? "Authenticated synthetic fixture session" : "Anonymous fixture session";
  };
  updateLoginStatus();
  addEventListener("browser-audit-login-state", updateLoginStatus);

  document.querySelector("[data-workflow-frame]").addEventListener("load", (event) => {
    event.currentTarget.contentWindow?.postMessage({ type: "fixture-parent-ready" }, location.origin);
  });
  addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.data?.type !== "fixture-frame-complete") return;
    document.querySelector("[data-frame-status]").textContent = `Frame completed: ${event.data.value}`;
  });
  document.querySelector("[data-open-popup]").addEventListener("click", () => window.open("/popup", "fixture-popup", "popup,width=480,height=360"));
  document.querySelector("[data-upload]").addEventListener("change", (event) => {
    const file = event.currentTarget.files?.[0];
    document.querySelector("[data-upload-status]").textContent = file ? `Uploaded fixture: ${file.name}` : "No fixture attachment";
  });

  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__fixture-realtime__`);
  const messages = [];
  window.fixtureRealtime = {
    get messages() { return messages; },
    get readyState() { return socket.readyState; },
    send(message) { socket.send(message); },
  };
  socket.addEventListener("message", (event) => {
    messages.push(String(event.data));
    document.querySelector("[data-realtime-status]").textContent = String(event.data);
  });
  socket.addEventListener("error", () => { document.querySelector("[data-realtime-status]").textContent = "Realtime fixture failed"; });
  return new Promise((resolveReady, reject) => {
    socket.addEventListener("open", resolveReady, { once: true });
    socket.addEventListener("error", () => reject(new Error("fixture realtime connection failed")), { once: true });
  });
}

const canvas = document.querySelector("canvas");
if (canvas) {
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) throw new Error("WebGL context is unavailable");
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertex, "attribute vec2 p; uniform float x; void main(){gl_Position=vec4(p.x+x,p.y,0.0,1.0);}");
  gl.compileShader(vertex);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragment, "precision mediump float; uniform float tint; void main(){gl_FragColor=vec4(0.25+tint,0.85,0.42,1.0);}");
  gl.compileShader(fragment);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "WebGL link failed");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.45, -0.55, 0.45, -0.55, 0, 0.55]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p");
  const offset = gl.getUniformLocation(program, "x");
  const tint = gl.getUniformLocation(program, "tint");
  gl.useProgram(program);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = !reduced;
  let frame = 0;
  const draw = () => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.04, 0.08, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(offset, reduced ? 0 : Math.sin(frame / 18) * 0.35);
    gl.uniform1f(tint, reduced ? 0.2 : ((frame % 60) / 60) * 0.35);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.dataset.renderer = String(gl.getParameter(gl.RENDERER));
    canvas.dataset.webglVersion = gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl";
    canvas.dataset.renderStatus = "ready";
    if (running) {
      frame += 1;
      document.querySelector("[data-toggle-canvas]")?.setAttribute("data-frame-count", String(frame));
      requestAnimationFrame(draw);
    }
  };
  draw();
  document.querySelector("[data-toggle-canvas]")?.addEventListener("click", (event) => {
    running = !running;
    event.currentTarget.textContent = running ? "Pause" : "Resume";
    if (running) requestAnimationFrame(draw);
  });
}

async function initializeVideoEditorial() {
  if (key !== "video-editorial") return;
  const createFixtureVideo = async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 64;
    sourceCanvas.height = 36;
    const sourceContext = sourceCanvas.getContext("2d");
    const stream = sourceCanvas.captureStream(20);
    const mimeType = ["video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("No deterministic WebM MediaRecorder codec is available");
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    const stopped = new Promise((resolveStopped) => recorder.addEventListener("stop", resolveStopped, { once: true }));
    recorder.start();
    for (let frame = 0; frame < 12; frame += 1) {
      // Keep independently-created fixture videos visually identical for fidelity captures.
      sourceContext.fillStyle = "#31745b";
      sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      await new Promise((resolveFrame) => setTimeout(resolveFrame, 50));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
  };
  const fixtureVideoUrl = await createFixtureVideo();
  const heroVideo = document.querySelector("[data-native-video]");
  heroVideo.src = fixtureVideoUrl;
  await heroVideo.play();

  const overlay = document.querySelector("[data-film-overlay]");
  const mediaSlot = overlay.querySelector(".film-media-slot");
  let overlayTimer = 0;
  const mountFilm = () => {
    if (mediaSlot.querySelector("video")) return;
    const video = document.createElement("video");
    video.dataset.filmVideo = "";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-label", "Fixture film");
    video.src = fixtureVideoUrl;
    mediaSlot.append(video);
    video.play();
  };
  const setPhase = (phase) => {
    clearTimeout(overlayTimer);
    overlay.dataset.phase = phase;
    if (phase === "opening") overlayTimer = window.setTimeout(() => setPhase("open"), 360);
    if (phase === "closing") overlayTimer = window.setTimeout(() => {
      overlay.dataset.phase = "closed";
      overlay.hidden = true;
      mediaSlot.querySelector("video")?.remove();
    }, 360);
  };
  document.querySelector("[data-open-film]").addEventListener("click", () => {
    mountFilm();
    overlay.hidden = false;
    document.body.classList.add("fixture-scroll-locked");
    requestAnimationFrame(() => setPhase("opening"));
  });
  document.querySelector("[data-close-film]").addEventListener("click", () => {
    document.body.classList.remove("fixture-scroll-locked");
    setPhase("closing");
  });

  let current = scrollY;
  let target = scrollY;
  let touchY = null;
  let touchVelocity = 0;
  const clampTarget = () => Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, target));
  const animateScroll = () => {
    target = clampTarget();
    current += (target - current) * 0.12;
    if (Math.abs(target - current) < 0.1) current = target;
    scrollTo(0, current);
    requestAnimationFrame(animateScroll);
  };
  addEventListener("wheel", (event) => {
    event.preventDefault();
    target += event.deltaY;
  }, { passive: false });
  addEventListener("touchstart", (event) => {
    event.preventDefault();
    touchY = event.touches[0]?.clientY ?? null;
    touchVelocity = 0;
  }, { passive: false });
  addEventListener("touchmove", (event) => {
    event.preventDefault();
    const next = event.touches[0]?.clientY;
    if (touchY === null || next === undefined) return;
    touchVelocity = touchY - next;
    target += touchVelocity;
    touchY = next;
  }, { passive: false });
  addEventListener("touchend", () => {
    const releaseVelocity = touchVelocity;
    current = scrollY;
    target = current + releaseVelocity * 1.8;
    touchY = null;
  }, { passive: true });
  requestAnimationFrame(animateScroll);
}

Promise.all([initializeVideoEditorial(), initializeComplexBrowser()])
  .then(() => { window.fixtureReady = true; })
  .catch((error) => {
    console.error(error);
    window.fixtureReady = false;
  });
