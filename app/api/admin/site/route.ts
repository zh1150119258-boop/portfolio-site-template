// 后台：网站设置（界面文案、联系方式、配色、分享卡片）。
import { loadSettings, saveSettings } from "../../../_portfolio/site-store";
import { CONTACT, LOCALES, TEXT_KEYS, UI_TEXT } from "../../../_site/content";
import type { SiteSettings } from "../../../_site/settings";
import { DEFAULT_THEME } from "../../../_site/theme";
import { json, requireAdmin } from "../_auth";
import { readJson } from "../_shared";

export async function GET(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const { settings, version } = await loadSettings();
  const defaults = {
    text: Object.fromEntries(LOCALES.map((locale) => [locale, Object.fromEntries(TEXT_KEYS.map(([key]) => [key, UI_TEXT[key] ?? ""]))])),
    contact: CONTACT,
    theme: DEFAULT_THEME,
  };
  return json({ settings, version, defaults, keys: TEXT_KEYS, fonts: [] });
}

const str = (value: unknown, max = 400) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const HEX = /^#[0-9a-f]{6}$/i;

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const body = await readJson<{ settings: SiteSettings; base: string }>(request);
  if (!body?.settings) return json({ errors: ["数据格式不对"] }, 400);
  const input = body.settings;
  const allowed = new Set(TEXT_KEYS.map(([key]) => key));
  const out: SiteSettings = {};
  for (const locale of LOCALES) {
    const text = Object.fromEntries(Object.entries(input.text?.[locale] ?? {}).filter(([key, value]) => allowed.has(key) && str(value)).map(([key, value]) => [key, str(value)]));
    if (Object.keys(text).length) (out.text ??= {})[locale] = text;
  }
  if (input.contact) {
    const emails = (input.contact.emails ?? []).map((value) => str(value, 120)).filter((value) => /^[^\s@]+@[^\s@]+$/.test(value));
    if (!emails.length) return json({ errors: ["至少要有一个有效的邮箱"] }, 400);
    const href = str(input.contact.whatsapp?.href, 200);
    if (href && !/^https:\/\//.test(href)) return json({ errors: ["WhatsApp 链接要以 https:// 开头"] }, 400);
    out.contact = { emails, line: str(input.contact.line, 80), wechat: str(input.contact.wechat, 80), whatsapp: { label: str(input.contact.whatsapp?.label, 80), href } };
  }
  if (input.theme) {
    const theme = Object.fromEntries(Object.entries(input.theme).filter(([key, value]) => ["paper", "ink", "night", "muted"].includes(key) && HEX.test(String(value))));
    if (Object.keys(theme).length) out.theme = theme;
  }
  const description = Object.fromEntries(LOCALES.map((locale) => [locale, str(input.seo?.description?.[locale], 300)]).filter(([, value]) => value));
  const image = str(input.seo?.image, 300);
  if (Object.keys(description).length || image) out.seo = { ...(Object.keys(description).length ? { description } : {}), ...(image.startsWith("/media/posters/") ? { image } : {}) };
  if (!(await saveSettings(out, body.base))) return json({ errors: ["网站设置在别处被修改过，请刷新后台后再改。"] }, 409);
  return json({ ok: true, version: (await loadSettings()).version });
}
