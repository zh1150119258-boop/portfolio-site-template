// 后台：检查一个作品组的封面 / 预览 / 流畅 / 原画是否都已就位（只读，每个文件只取 1 个字节）。
import { json, requireAdmin } from "../_auth";
import { archiveUrls, readJson } from "../_shared";

const probe = async (url: string, origin: string) => {
  const target = url.startsWith("/") ? `${origin}${url}` : url;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(target, { headers: { Range: "bytes=0-0" } });
      response.body?.cancel().catch(() => undefined);
      return response.status;
    } catch { /* 再试一次 */ }
  }
  return 0;
};

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const body = await readJson<{ id: string; def: { kind: string; name: string; year: string; count: number; mediaBase: string; posterBase?: string } }>(request);
  if (!body?.def || body.def.kind !== "archive") return json({ errors: ["线上后台只能检查按编号存放的作品组"] }, 400);
  const origin = new URL(request.url).origin;
  const items = archiveUrls(body.id, body.def);
  const results = await Promise.all(items.map(async (item) => ({
    ...item,
    status: Object.fromEntries(await Promise.all((["poster", "preview", "stream", "original"] as const).map(async (key) => [key, await probe(item[key], origin)]))),
  })));
  return json({ results });
}
