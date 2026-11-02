// 后台：保存自定义封面图片（浏览器里已经截好或缩放成 JPEG）。只存文件、返回地址；
// 写进作品数据由后台页面完成（和其他修改一样点「保存」后生效）。旧封面文件保留，换回来不会丢。
import { mediaBucket } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";
import { SLUG } from "../_shared";

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const url = new URL(request.url);
  const id = url.searchParams.get("groupId") ?? "";
  const clip = Number(url.searchParams.get("clip"));
  const bucket = mediaBucket();
  if (!SLUG.test(id) || !Number.isInteger(clip) || clip < 1 || clip > 999 || !bucket) return json({ errors: ["参数不对"] }, 400);
  const data = await request.arrayBuffer();
  const bytes = new Uint8Array(data.slice(0, 3));
  if (data.byteLength < 1000 || data.byteLength > 5 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ errors: ["封面需要是 5MB 以内的 JPEG 图片"] }, 400);
  const key = `posters/custom/${id}/${Date.now()}/clip-${String(clip).padStart(2, "0")}.jpg`;
  await bucket.put(key, data, { httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" } });
  return json({ ok: true, src: `/media/${key}` });
}
