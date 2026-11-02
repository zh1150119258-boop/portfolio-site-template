// 关于页内容（个人介绍、擅长方向、工作履历）。线上以 R2 里的 admin/about.json 为准，后台可直接修改；
// 没有这份文件时用代码里的默认文案（content.ts 的 ABOUT，只是占位）。
import { ABOUT, type Locale } from "../_site/content";
import { mediaBucket } from "./works-store";

export const ABOUT_KEY = "admin/about.json";
export type AboutLocale = { statement: string[]; intro: string; body: string[]; focus: string[]; experience: [string, string, string][] };
export type AboutContent = { zh: AboutLocale };

export const defaultAbout = (): AboutContent => ({
  zh: { statement: [...ABOUT.statement], intro: ABOUT.intro, body: [...ABOUT.body], focus: [...ABOUT.focus], experience: ABOUT.experience.map(([y, c, r]) => [y, c, r]) },
});

let cached: { at: number; content: AboutContent; version: string } | null = null;

export async function loadAbout(): Promise<{ content: AboutContent; version: string }> {
  if (cached && Date.now() - cached.at < 5_000) return cached;
  const object = await mediaBucket()?.get(ABOUT_KEY).catch(() => null);
  const result = object ? { content: { ...defaultAbout(), ...((await object.json()) as AboutContent) }, version: object.etag } : { content: defaultAbout(), version: "default" };
  cached = { at: Date.now(), ...result };
  return result;
}

export async function saveAbout(content: AboutContent, base: string): Promise<boolean> {
  const bucket = mediaBucket();
  if (!bucket) throw new Error("R2 binding MEDIA_BUCKET is unavailable");
  const current = await bucket.head(ABOUT_KEY);
  if ((current?.etag ?? "default") !== base) return false;
  if (current) {
    const previous = await bucket.get(ABOUT_KEY);
    if (previous) await bucket.put(`admin/backups/about-${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}.json`, await previous.arrayBuffer(), { httpMetadata: { contentType: "application/json" } });
  }
  await bucket.put(ABOUT_KEY, `${JSON.stringify(content, null, 2)}\n`, { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
  cached = null;
  return true;
}

/** 某个语言的关于页内容（目前只有中文）。 */
export const aboutFor = (content: AboutContent, locale: Locale): AboutLocale => content[locale] ?? content.zh;
