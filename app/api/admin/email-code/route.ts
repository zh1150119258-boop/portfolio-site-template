// 后台邮箱验证码登录：{ send: true } 发验证码到管理员邮箱；{ code } 校验后登录。
import { checkLoginCode, emailLoginEnabled, json, sendLoginCode, sessionCookie } from "../_auth";
import { readJson } from "../_shared";

export async function POST(request: Request) {
  if (!emailLoginEnabled()) return json({ errors: ["邮箱登录还没有配置。"] }, 503);
  const body = await readJson<{ send?: boolean; code?: string }>(request);
  if (body?.send) {
    const error = await sendLoginCode().catch((reason) => `邮件发送失败：${(reason as Error).message}`);
    return error ? json({ errors: [error] }, 429) : json({ ok: true });
  }
  if (!body?.code || !(await checkLoginCode(body.code))) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return json({ errors: ["验证码不对或已过期。"] }, 401);
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": await sessionCookie(), "Cache-Control": "no-store" } });
}
