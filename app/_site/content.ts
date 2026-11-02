// 网站上的默认文字。大部分都能在后台「网站设置」「关于页与履历」里改，改了以后以后台为准。
// 这里的文字只是占位，正式上线前请换成你自己的（不要编造经历和作品信息）。
import { SITE } from "../../site.config";
import type { SiteContact, SiteSettings } from "./settings";

export type Locale = "zh";
export const LOCALES: Locale[] = ["zh"];

/** 界面文字的默认值（键 → 文字）。后台「网站设置 → 文案」能改的就是这些。 */
export const UI_TEXT: Record<string, string> = {
  name: SITE.name,
  roles: SITE.roles,
  basedIn: SITE.basedIn,
  heroLine: "用影像记录品牌与生活",
  featuredTitle: "精选作品",
  workIndex: "全部作品",
  aboutTitle: "关于我",
  experienceTitle: "工作履历",
  focusTitle: "擅长方向",
  contactTitle: "联系我",
  contactLine: "欢迎联系合作。",
  sendEmail: "发邮件",
  copyright: `© ${new Date().getFullYear()} ${SITE.name}`,
};

/** 后台里能改的文字（键 → 说明）。 */
export const TEXT_KEYS: [string, string][] = [
  ["name", "名字"], ["roles", "身份"], ["basedIn", "所在城市"], ["heroLine", "首页大标题"],
  ["featuredTitle", "首页精选标题"], ["workIndex", "作品页标题"], ["aboutTitle", "关于页标题"],
  ["focusTitle", "擅长方向标题"], ["experienceTitle", "履历标题"], ["contactTitle", "联系页标题"],
  ["contactLine", "联系页说明"], ["sendEmail", "邮件按钮"], ["copyright", "版权"],
];

/** 联系方式默认值：全部留空，在后台「网站设置 → 联系方式」填写。 */
export const CONTACT: SiteContact = { emails: [], line: "", wechat: "", whatsapp: { label: "", href: "" } };

/** 关于页默认内容（占位），在后台「关于页与履历」填写真实内容。 */
export const ABOUT = {
  statement: ["一句话介绍你自己"],
  intro: "这里写一段简短的个人介绍。请在后台「关于页与履历」里修改。",
  body: [] as string[],
  focus: [] as string[],
  experience: [] as [string, string, string][],
};

/** 读取一条界面文字：后台改过就用后台的，否则用默认值。 */
export const textOf = (settings: SiteSettings, key: string) => settings.text?.zh?.[key]?.trim() || UI_TEXT[key] || "";
/** 当前联系方式。 */
export const contactOf = (settings: SiteSettings): SiteContact => settings.contact ?? CONTACT;
