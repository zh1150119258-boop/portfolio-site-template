// 配色：后台「网站设置 → 配色」可以改。paper = 浅色背景，ink = 文字，night = 深色模式背景，muted = 次要文字。
import type { SiteSettings } from "./settings";

export const DEFAULT_THEME = { paper: "#f4f3f0", ink: "#111111", night: "#0c0c0c", muted: "#7a7a76" };

const HEX = /^#[0-9a-f]{6}$/i;
/** 后台设置的配色 → CSS 变量（浅色模式和深色模式各一套）。 */
export const themeCss = (settings: SiteSettings) => {
  const pick = (key: keyof typeof DEFAULT_THEME) => {
    const value = settings.theme?.[key];
    return value && HEX.test(value) ? value : DEFAULT_THEME[key];
  };
  const [paper, ink, night, muted] = [pick("paper"), pick("ink"), pick("night"), pick("muted")];
  return `:root{--paper:${paper};--ink:${ink};--muted:${muted};--line:color-mix(in srgb, ${ink} 18%, transparent);color-scheme:light}`
    + `@media (prefers-color-scheme: dark){:root{--paper:${night};--ink:${paper};--muted:${muted};--line:color-mix(in srgb, ${paper} 22%, transparent);color-scheme:dark}}`;
};
