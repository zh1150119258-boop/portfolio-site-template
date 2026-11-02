// 网站设置的读写（服务端）：R2 里的 admin/site.json。没有这份文件时全部用代码默认值。
import type { SiteSettings } from "../_site/settings";
import { mediaBucket } from "./works-store";

export const SITE_KEY = "admin/site.json";
let cached: { at: number; settings: SiteSettings; version: string } | null = null;

export async function loadSettings(): Promise<{ settings: SiteSettings; version: string }> {
  if (cached && Date.now() - cached.at < 5_000) return cached;
  const object = await mediaBucket()?.get(SITE_KEY).catch(() => null);
  const result = object ? { settings: (await object.json()) as SiteSettings, version: object.etag } : { settings: {}, version: "default" };
  cached = { at: Date.now(), ...result };
  return result;
}

export async function saveSettings(settings: SiteSettings, base: string): Promise<boolean> {
  const bucket = mediaBucket();
  if (!bucket) throw new Error("R2 binding MEDIA_BUCKET is unavailable");
  const current = await bucket.head(SITE_KEY);
  if ((current?.etag ?? "default") !== base) return false;
  if (current) {
    const previous = await bucket.get(SITE_KEY);
    if (previous) await bucket.put(`admin/backups/site-${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}.json`, await previous.arrayBuffer(), { httpMetadata: { contentType: "application/json" } });
  }
  await bucket.put(SITE_KEY, `${JSON.stringify(settings, null, 2)}\n`, { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
  cached = null;
  return true;
}
