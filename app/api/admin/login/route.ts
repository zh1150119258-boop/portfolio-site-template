// 后台密码登录 / 退出。密码错误时故意等待 1.5 秒，防止反复猜测。
import { checkPassword, clearSessionCookie, json, passwordLoginEnabled, sessionCookie } from "../_auth";
import { readJson } from "../_shared";

export async function POST(request: Request) {
  if (!passwordLoginEnabled()) return json({ errors: ["后台密码还没有设置。"] }, 503);
  const body = await readJson<{ password?: string; logout?: boolean }>(request);
  if (body?.logout) return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } });
  if (!body?.password || !(await checkPassword(body.password))) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return json({ errors: ["密码不对。"] }, 401);
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": await sessionCookie(), "Cache-Control": "no-store" } });
}
