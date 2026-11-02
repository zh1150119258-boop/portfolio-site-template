/** 网站的 Cloudflare Worker 入口：统一域名、后台页面、R2 封面与媒体、访问计数、图片优化、页面边缘缓存。 */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { recordHit } from "./hits";
import { SITE } from "../site.config";

const SITE_HOST = new URL(SITE.url).hostname;

interface Fetcher { fetch(request: Request): Promise<Response> }

interface Env {
  ASSETS: Fetcher;
  MEDIA_BUCKET: R2Bucket;
  VIEWS?: Parameters<typeof recordHit>[1];
  /** 当前部署的版本号（wrangler version_metadata）；页面缓存按版本区分，部署新版后旧缓存自动失效。 */
  CF_VERSION?: { id: string };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

function parseRange(value: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset < 0 || offset >= size || end < offset) return null;
  return { offset, length: Math.min(end, size - 1) - offset + 1 };
}

// /media/<R2 路径>：从 R2 读取媒体文件。
// - 封面图（posters/…）一直走这里：同源，能用 Cloudflare 图片压缩，后台截图也需要同源。
// - 视频正式上线后应走媒体子域（R2 自定义域名，不经过 Worker，更快更省）；这里的视频读取用于本地预览，
//   以及还没绑定媒体子域时的临时方案（把 site.config.ts 的 mediaUrl 设成 "/media"）。支持拖动进度条（Range）。
const MEDIA_KEY = /^(posters|brand|previews|streams-balanced|social)\/[a-z0-9/_-]+\.(jpg|mp4)$/i;
async function serveMedia(request: Request, key: string, bucket: R2Bucket) {
  if (!MEDIA_KEY.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const isImage = key.endsWith(".jpg");
  const metadata = await bucket.head(key);
  if (!metadata) return new Response("Not found", { status: 404 });
  const rangeHeader = isImage ? null : request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, metadata.size) : undefined;
  if (rangeHeader && !range) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${metadata.size}` } });
  const object = request.method === "HEAD" ? metadata : await bucket.get(key, range ? { range } : undefined);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": isImage ? "image/jpeg" : "video/mp4",
    "Cache-Control": isImage ? "public, max-age=86400, stale-while-revalidate=604800" : "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
  });
  if (!isImage) headers.set("Accept-Ranges", "bytes");
  if (range) {
    headers.set("Content-Length", String(range.length));
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
  } else headers.set("Content-Length", String(metadata.size));
  const body = request.method === "HEAD" || !("body" in object) ? null : (object as R2ObjectBody).body;
  return new Response(body, { status: range ? 206 : 200, headers });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 统一到 https://<正式域名>：http 打开时浏览器不会保存后台登录用的 Secure Cookie（会出现登录后马上又要登录），
    // www 和不带 www 的登录状态也不互通
    if ((url.protocol === "http:" || url.hostname === `www.${SITE_HOST}`) && url.hostname.endsWith(SITE_HOST)) {
      url.protocol = "https:";
      url.hostname = SITE_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api/hit") return recordHit(request, env.VIEWS);
    // R2 里的封面和（临时 / 本地预览用的）视频，见 serveMedia
    if (url.pathname.startsWith("/media/")) return serveMedia(request, decodeURIComponent(url.pathname.slice("/media/".length)), env.MEDIA_BUCKET);
    // 在线后台页面（页面本身是静态文件；所有数据接口都要登录）
    if (url.pathname === "/admin" || url.pathname === "/admin/") return env.ASSETS.fetch(new Request(new URL("/admin/", request.url), request));

    // 带扩展名的是静态文件（图片、脚本、样式等）；其余都是页面或页面数据（.rsc）
    const last = url.pathname.split("/").pop() ?? "";
    // 网站地图按后台最新作品动态生成，robots.txt 按 site.config.ts 生成，也交给页面程序
    const isAppRoute = !last.includes(".") || last.endsWith(".rsc") || url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt";
    if (!isAppRoute && !url.pathname.startsWith("/api/") && url.pathname !== "/_vinext/image") {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // 页面在 Cloudflare 边缘缓存（见 cachedPage）：访问时直接给缓存，超过 1 分钟的在后台重新生成，后台修改下一次打开就生效
    const render = () => handler.fetch(request, env, ctx);
    if (request.method === "GET" && !url.pathname.startsWith("/api/") && url.hostname !== "localhost") return cachedPage(request, render, ctx, env.CF_VERSION?.id ?? "");
    return render();
  },
};

// 页面缓存：访问的人少时，60 秒就过期会导致几乎每次打开都要重新生成（要等 2–3 秒）。
// 现在缓存保存 1 天，但超过 1 分钟的缓存在给出页面的同时，在后台重新生成一份新的（先快后新）。
// 所以后台改了作品，改完后的第一次打开可能还是旧页面，再打开就是新的。部署新版本时版本号变了，旧缓存全部不用。
const PAGE_FRESH = 60;
const PAGE_KEEP = 86400;
const CACHED_AT = "x-site-cached-at";
async function cachedPage(request: Request, render: () => Promise<Response>, ctx: ExecutionContext, version: string) {
  const cache = (caches as unknown as { default: Cache }).default;
  // 页面数据请求（RSC）和普通页面用同一个网址时，按请求头区分缓存
  const key = new URL(request.url);
  key.searchParams.set("__v", [request.headers.get("rsc") ?? "", request.headers.get("next-router-state-tree") ? "tree" : "", request.headers.get("accept")?.includes("text/x-component") ? "x" : ""].join("."));
  key.searchParams.set("__d", version);
  const cacheKey = new Request(key.toString(), { method: "GET" });
  const store = async () => {
    const response = await render();
    if (response.status !== 200 || response.headers.has("set-cookie")) return response;
    const stored = new Response(response.body, response);
    stored.headers.set("Cache-Control", `public, max-age=0, s-maxage=${PAGE_KEEP}`);
    stored.headers.set(CACHED_AT, String(Date.now()));
    ctx.waitUntil(cache.put(cacheKey, stored.clone()));
    return stored;
  };
  const hit = await cache.match(cacheKey);
  if (!hit) return forBrowser(await store());
  const age = (Date.now() - Number(hit.headers.get(CACHED_AT) ?? 0)) / 1000;
  if (!(age < PAGE_FRESH)) ctx.waitUntil(store().then(() => undefined, () => undefined));
  return forBrowser(hit);
}
/** 浏览器自己不缓存页面（每次都问 Cloudflare），保证后台修改后刷新就能看到。 */
function forBrowser(response: Response) {
  if (!response.headers.has(CACHED_AT)) return response;
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  out.headers.delete(CACHED_AT);
  return out;
}

export default worker;
