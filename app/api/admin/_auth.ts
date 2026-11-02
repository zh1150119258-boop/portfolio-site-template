// 后台接口的登录校验，两种方式任选：
// 1. 网站自带登录：邮箱验证码（主要方式，见 email-code 接口）或密码（ADMIN_PASSWORD，备用），登录后发一个签名过的 Cookie，30 天有效；
// 2. Cloudflare Access（ACCESS_TEAM_DOMAIN / ACCESS_AUD）：校验 Access 签发的 JWT。
// 两者都没配置时一律拒绝（宁可用不了，也不让别人能改）。本地预览（vite dev）不校验。
import { env } from "cloudflare:workers";
import { mediaBucket } from "../../_portfolio/works-store";
import { ADMIN_EMAIL, MAIL_FROM, SITE } from "../../../site.config";

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;

const b64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

async function certs(team: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
  const { keys } = (await response.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), keys };
  return keys;
}

async function verifyAccessJwt(token: string, team: string, aud: string): Promise<string | null> {
  const [head, body, signature] = token.split(".");
  if (!head || !body || !signature) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(head))) as { kid?: string; alg?: string };
  if (header.alg !== "RS256") return null;
  const jwk = (await certs(team)).find((key) => key.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(signature), new TextEncoder().encode(`${head}.${body}`));
  if (!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(b64url(body))) as { aud?: string | string[]; exp?: number; iss?: string; email?: string };
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return null;
  if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
  if (claims.iss !== `https://${team}`) return null;
  return claims.email ?? "unknown";
}

const vars = env as unknown as { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; ADMIN_EMAILS?: string; ADMIN_PASSWORD?: string; ADMIN_MAIL?: { send(message: unknown): Promise<void> } };

// ---------- 密码登录 ----------
// 初始密码来自部署时写入的 ADMIN_PASSWORD；在后台「修改密码」后，新密码只以加盐哈希的形式存在 R2（admin/auth.json），
// 哈希再用 ADMIN_PASSWORD 做二次签名（R2 公开可读，没有这个服务器密钥就无法离线猜密码）。
export const SESSION_COOKIE = "site_admin";
const SESSION_DAYS = 30;
const AUTH_KEY = "admin/auth.json";
const enc = new TextEncoder();
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
// 本地预览没有 ADMIN_PASSWORD，用固定值方便测试预览链接
const pepper = () => vars.ADMIN_PASSWORD ?? ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? "local-dev-only" : "");
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}
const sameText = async (a: string, b: string) => {
  const [x, y] = await Promise.all([a, b].map((value) => crypto.subtle.digest("SHA-256", enc.encode(value))));
  const left = new Uint8Array(x); const right = new Uint8Array(y);
  return left.every((byte, index) => byte === right[index]);
};
type AuthRecord = { salt: string; hash: string; iterations: number; changedAt: string };
let recordCache: { at: number; record: AuthRecord | null } | null = null;
async function authRecord(): Promise<AuthRecord | null> {
  if (recordCache && Date.now() - recordCache.at < 10_000) return recordCache.record;
  const object = await mediaBucket()?.get(AUTH_KEY).catch(() => null);
  const record = object ? ((await object.json()) as AuthRecord) : null;
  recordCache = { at: Date.now(), record };
  return record;
}
async function derive(password: string, salt: string, iterations: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations }, base, 256);
  return hmacHex(`pepper:${pepper()}`, hex(bits));
}
// 签名密钥跟随当前密码：改密码后旧的登录状态自动全部失效
const sessionSecret = async () => `session:${pepper()}:${(await authRecord())?.hash ?? "initial"}`;

// ---------- 邮箱验证码登录 ----------
// 验证码只发到 wrangler 配置里固定的邮箱（send_email 绑定的 destination_address），别人无法把验证码发到自己邮箱。
// R2 里只存验证码的签名，10 分钟有效，最多试 5 次，60 秒内不重复发送。
const ADMIN_ADDRESS = ADMIN_EMAIL;
const CODE_KEY = "admin/login-code.json";
type CodeRecord = { hash: string; expires: number; sentAt: number; tries: number };
const codeHash = (code: string, expires: number) => hmacHex(`code:${pepper()}`, `${expires}:${code}`);
const readCode = async () => {
  const object = await mediaBucket()?.get(CODE_KEY).catch(() => null);
  return object ? ((await object.json()) as CodeRecord) : null;
};
const writeCode = (record: CodeRecord | null) => record
  ? mediaBucket()!.put(CODE_KEY, JSON.stringify(record), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } })
  : mediaBucket()!.delete(CODE_KEY);
const base64 = (text: string) => btoa(String.fromCharCode(...enc.encode(text)));
export const emailLoginEnabled = () => Boolean(vars.ADMIN_MAIL && vars.ADMIN_PASSWORD);
export const maskedAdminEmail = () => ADMIN_ADDRESS.replace(/^(.{2}).*(@.*)$/, "$1****$2");
export async function sendLoginCode(): Promise<string | null> {
  const previous = await readCode();
  if (previous && Date.now() - previous.sentAt < 60_000) return "验证码刚发过，请 1 分钟后再试。";
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const expires = Date.now() + 10 * 60_000;
  await sendAdminMail(`作品后台登录验证码 ${code}`, `你的 ${new URL(SITE.url).hostname} 作品后台登录验证码：${code}\n\n10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。\n`);
  await writeCode({ hash: await codeHash(code, expires), expires, sentAt: Date.now(), tries: 0 });
  return null;
}
/** 给管理员邮箱发一封纯文本邮件（登录验证码、转码完成提醒）。没配置邮件时什么都不做。 */
export async function sendAdminMail(subject: string, text: string) {
  if (!vars.ADMIN_MAIL) return;
  const from = MAIL_FROM;
  const raw = [
    `From: ${SITE.name} <${from}>`, `To: ${ADMIN_ADDRESS}`,
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@${from.split("@")[1]}>`, `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    base64(text).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  const { EmailMessage } = await import("cloudflare:email");
  await vars.ADMIN_MAIL.send(new EmailMessage(from, ADMIN_ADDRESS, raw));
}
export async function checkLoginCode(code: string): Promise<boolean> {
  const record = await readCode();
  if (!record || record.expires < Date.now() || record.tries >= 5) return false;
  if (await sameText(await codeHash(code.trim(), record.expires), record.hash)) { await writeCode(null); return true; }
  await writeCode({ ...record, tries: record.tries + 1 });
  return false;
}

// ---------- 隐藏作品的私密预览链接 ----------
// 口令 = 到期时间 + 签名（用服务器密钥签，别人无法伪造或改到期时间）
const previewSig = (id: string, expires: number) => hmacHex(`preview:${pepper()}`, `${id}:${expires}`).then((sig) => sig.slice(0, 32));
export async function previewToken(id: string, days: number) {
  const expires = Date.now() + days * 86_400_000;
  // 不能带「.」，否则网址会被当成静态文件
  return `${expires.toString(36)}-${await previewSig(id, expires)}`;
}
export async function checkPreviewToken(id: string, token: string) {
  const [stamp, sig] = token.split("-");
  const expires = parseInt(stamp ?? "", 36);
  if (!pepper() || !sig || !Number.isFinite(expires) || expires < Date.now()) return false;
  return sameText(sig, await previewSig(id, expires));
}

export const passwordLoginEnabled = () => Boolean(vars.ADMIN_PASSWORD);
export async function checkPassword(password: string) {
  if (!vars.ADMIN_PASSWORD) return false;
  const record = await authRecord();
  if (!record) return sameText(password, vars.ADMIN_PASSWORD);
  return sameText(await derive(password, record.salt, record.iterations), record.hash);
}
export async function setPassword(next: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const iterations = 100_000;
  const record: AuthRecord = { salt, iterations, hash: await derive(next, salt, iterations), changedAt: new Date().toISOString() };
  await mediaBucket()!.put(AUTH_KEY, JSON.stringify(record), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
  recordCache = { at: Date.now(), record };
}
// SameSite=Lax 而不是 Strict：Safari 在「从别的 App 或网站点链接打开后台」时，会不带 Strict 的 Cookie，导致登录后马上又被当成没登录。
// Lax 依然会拦住别的网站发来的提交请求。
export async function sessionCookie() {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  const value = `${expires}.${await hmacHex(await sessionSecret(), String(expires))}`;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`;
}
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
async function sessionValid(request: Request) {
  const cookie = (request.headers.get("cookie") ?? "").split(/;\s*/).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  const [expires, signature] = (cookie?.slice(SESSION_COOKIE.length + 1) ?? "").split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return sameText(signature, await hmacHex(await sessionSecret(), expires));
}

/** 通过返回操作者邮箱，未通过返回 Response（401/403）。 */
export async function requireAdmin(request: Request): Promise<string | Response> {
  if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return "local";
  if (vars.ADMIN_PASSWORD) {
    if (await sessionValid(request)) return "admin";
    if (!vars.ACCESS_TEAM_DOMAIN) return Response.json({ errors: ["请先登录后台。"], login: emailLoginEnabled() ? "email" : "password", email: emailLoginEnabled() ? maskedAdminEmail() : undefined }, { status: 401 });
  }
  const team = vars.ACCESS_TEAM_DOMAIN;
  const aud = vars.ACCESS_AUD;
  if (!team || !aud) return Response.json({ errors: ["后台登录保护还没有配置。"] }, { status: 503 });
  const token = request.headers.get("cf-access-jwt-assertion");
  const email = token ? await verifyAccessJwt(token, team, aud).catch(() => null) : null;
  if (!email) return Response.json({ errors: ["请先登录后台。"] }, { status: 401 });
  const allowed = (vars.ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(email.toLowerCase())) return Response.json({ errors: ["这个邮箱没有后台权限。"] }, { status: 403 });
  return email;
}

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
