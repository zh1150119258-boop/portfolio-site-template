// 后台：上传网站用的图片（目前用于分享卡片），浏览器里已缩放成 JPEG。存到 R2，经本站 /media/posters/ 读取。
import { mediaBucket } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const bucket = mediaBucket();
  if (!bucket) return json({ errors: ["存储不可用"] }, 503);
  const data = await request.arrayBuffer();
  const bytes = new Uint8Array(data.slice(0, 3));
  if (data.byteLength < 1000 || data.byteLength > 5 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ errors: ["需要 5MB 以内的 JPEG 图片"] }, 400);
  // kind：share = 分享卡片图，preloader = 加载页图片
  const kind = new URL(request.url).searchParams.get("kind") === "preloader" ? "preloader" : "share";
  const key = `posters/site/${kind}/${Date.now()}/clip-01.jpg`;
  await bucket.put(key, data, { httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" } });
  return json({ ok: true, src: `/media/${key}` });
}
