// 后台：修改登录密码（需要已登录，并再输入一次当前密码）。改完后所有设备需要用新密码重新登录。
import { checkPassword, json, requireAdmin, sessionCookie, setPassword } from "../_auth";
import { readJson } from "../_shared";

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const body = await readJson<{ current?: string; next?: string }>(request);
  if (!body?.current || !(await checkPassword(body.current))) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return json({ errors: ["当前密码不对。"] }, 403);
  }
  const next = body.next ?? "";
  if (next.length < 8) return json({ errors: ["新密码至少 8 位。"] }, 400);
  await setPassword(next);
  // 当前设备直接换成新的登录状态，不用重新登录
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": await sessionCookie(), "Cache-Control": "no-store" } });
}
