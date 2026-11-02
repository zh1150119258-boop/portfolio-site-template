// 后台：同源读取视频（支持拖动进度），用来在浏览器里截取一帧做封面。媒体域名没有跨域头，直接读会无法截图。
import { mediaBucket } from "../../../_portfolio/works-store";
import { requireAdmin } from "../_auth";
import { mediaKeyOf } from "../_shared";

export async function GET(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const key = mediaKeyOf(new URL(request.url).searchParams.get("src") ?? "");
  const bucket = mediaBucket();
  if (!key || !bucket) return new Response("Not found", { status: 404 });
  const head = await bucket.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get("range") ?? "");
  const headers = new Headers({ "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
  if (!match) {
    const object = await bucket.get(key);
    headers.set("Content-Length", String(head.size));
    return new Response(object!.body, { headers });
  }
  const start = Number(match[1]);
  const end = Math.min(match[2] ? Number(match[2]) : start + 4 * 1024 * 1024 - 1, head.size - 1);
  if (start >= head.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
  const object = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
  headers.set("Content-Range", `bytes ${start}-${end}/${head.size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(object!.body, { status: 206, headers });
}
