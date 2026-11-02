// 仅本地预览：把文件写进模拟存储桶，用来在本机演示「GitHub 转码完成后上传结果」这一步。线上直接返回 404。
import { mediaBucket } from "../../../_portfolio/works-store";

export async function PUT(request: Request) {
  if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return new Response("Not found", { status: 404 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!/^(brand|previews\/brand|streams-balanced\/brand|posters\/brand)\/[a-z0-9-]+\/clip-\d{2}\.(mp4|jpg)$/.test(key)) return new Response("Bad key", { status: 400 });
  await mediaBucket()!.put(key, await request.arrayBuffer(), { httpMetadata: { contentType: key.endsWith(".jpg") ? "image/jpeg" : "video/mp4" } });
  return Response.json({ ok: true, key });
}

/** 仅本地：清空模拟存储桶里的作品数据和备份，让本地预览回到读取 content/works.json。 */
export async function DELETE() {
  if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return new Response("Not found", { status: 404 });
  const bucket = mediaBucket()!;
  const listed = await bucket.list({ prefix: "admin/" });
  const keys = listed.objects.map((object) => object.key);
  if (keys.length) await bucket.delete(keys);
  return Response.json({ ok: true, deleted: keys });
}
