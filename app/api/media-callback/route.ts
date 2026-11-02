// GitHub Actions 转码完成后调用这里（不经过后台登录，用共享密钥 MEDIA_CALLBACK_SECRET 校验）。
// 成功：记录条数和封面尺寸，状态改为「已就绪」，作品出现在网站上；失败：记录错误，后台里能看到。
import { env } from "cloudflare:workers";
import { loadWorks, updateWorks } from "../../_portfolio/works-store";
import { sendAdminMail } from "../admin/_auth";

// 线上用 wrangler secret 设置；本地预览固定用 local-dev-only 方便演示
const secret = () => (env as unknown as { MEDIA_CALLBACK_SECRET?: string }).MEDIA_CALLBACK_SECRET
  ?? ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? "local-dev-only" : undefined);

const sameSecret = async (a: string, b: string) => {
  const [x, y] = await Promise.all([a, b].map((value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
  const left = new Uint8Array(x); const right = new Uint8Array(y);
  return left.every((byte, index) => byte === right[index]);
};

export async function POST(request: Request) {
  const expected = secret();
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !given || !(await sameSecret(given, expected))) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => null)) as { group?: string; ok?: boolean; count?: number; clips?: number[]; sizes?: [number, number][]; error?: string } | null;
  if (!body?.group) return new Response("Bad request", { status: 400 });
  let name = body.group;
  let appended = 0;
  const result = await updateWorks((config) => {
    const def = config.groups[body.group!];
    if (!def || def.kind !== "archive") return "unknown group";
    name = def.name;
    if (!body.ok || !body.count) {
      (def as { error?: string }).error = body.error ?? "转码失败";
      return;
    }
    // clips：这次处理的条目编号（追加视频时只有新的几条）；旧版回调没有这个字段，视为 1…count
    const clips = body.clips?.length ? body.clips : Array.from({ length: body.count }, (_, index) => index + 1);
    const sizes = [...(def.sizes ?? [])];
    clips.forEach((n, index) => { sizes[n - 1] = body.sizes?.[index] ?? sizes[n - 1] ?? null; });
    const wasReady = def.status === "ready";
    def.count = Math.max(wasReady ? def.count : 0, ...clips);
    def.sizes = Array.from({ length: def.count }, (_, index) => sizes[index] ?? null);
    def.status = "ready";
    if (def.order) clips.forEach((n) => { if (!def.order!.includes(n)) def.order!.push(n); });
    if (wasReady) appended = clips.length;
    delete (def as { error?: string }).error;
    delete (def as { appending?: number[] }).appending;
  });
  if (result.ok) {
    const site = new URL(request.url).origin;
    const subject = body.ok ? `「${name}」转码完成` : `「${name}」转码失败`;
    const text = body.ok
      ? `${appended ? `追加的 ${appended} 条视频` : `${body.count} 条视频`}已经处理好。${(await isHidden(body.group)) ? "作品目前是隐藏状态，在后台预览满意后点「发布」就会出现在网站上。" : "已经出现在网站上。"}\n\n后台：${site}/admin\n`
      : `${body.error ?? "转码失败"}\n\n可以在后台作品详情里点「重新转码」。\n后台：${site}/admin\n`;
    await sendAdminMail(subject, text).catch(() => undefined);
  }
  return result.ok ? Response.json({ ok: true }) : Response.json({ ok: false, error: result.error }, { status: 409 });
}

async function isHidden(group: string) {
  return Boolean((await loadWorks()).config.groups[group]?.hidden);
}
