// 后台：给作品组生成私密预览链接（默认 30 天有效）。拿到链接的人不用登录就能看，到期后自动失效。
import { json, previewToken, requireAdmin } from "../_auth";
import { readJson, SLUG } from "../_shared";

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const body = await readJson<{ groupId: string; days?: number }>(request);
  const days = Math.min(365, Math.max(1, Math.round(body?.days ?? 30)));
  if (!body || !SLUG.test(body.groupId ?? "")) return json({ errors: ["参数不对"] }, 400);
  const url = `${new URL(request.url).origin}/preview/${body.groupId}/${await previewToken(body.groupId, days)}`;
  return json({ ok: true, url, days });
}
