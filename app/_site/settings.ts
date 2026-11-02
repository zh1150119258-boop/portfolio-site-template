// 网站设置（后台「网站设置」里修改，存在 R2 的 admin/site.json）：界面文案、联系方式、配色、分享卡片。
// 服务端读取（见 _portfolio/site-store.ts）；没有设置的项一律用 content.ts 里的默认值。
import type { Locale } from "./content";

export type SiteContact = { emails: string[]; line: string; whatsapp: { label: string; href: string }; wechat: string };
export type SiteTheme = { paper?: string; ink?: string; night?: string; muted?: string };
export type SiteSettings = {
  /** 界面文字的替换：按语言、按 content.ts 里 UI_TEXT 的键 */
  text?: Partial<Record<Locale, Record<string, string>>>;
  contact?: SiteContact;
  theme?: SiteTheme;
  seo?: { description?: Partial<Record<Locale, string>>; image?: string };
};
