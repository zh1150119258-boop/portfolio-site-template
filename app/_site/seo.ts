// 搜索引擎与分享卡片用的页面信息（服务端）：正规网址（canonical）、描述、分享图、身份说明、视频说明卡。
// 只用网站上已有的文字（作品名、分类、年份、后台填写的项目说明），不编造内容。
import type { Metadata } from "next";
import type { VideoObject, WithContext } from "schema-dts";
import { SITE } from "../../site.config";
import { loadSettings } from "../_portfolio/site-store";
import { textOf } from "./content";

export const ORIGIN = SITE.url.replace(/\/$/, "");

export async function siteDescription() {
  const { settings } = await loadSettings();
  return settings.seo?.description?.zh?.trim() || SITE.description;
}

/** 搜索结果里那行描述：去掉换行，太长就截断。 */
export const clip = (text: string, max = 150) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

type PageSeo = { path: string; title: string; description?: string; image?: string; noindex?: boolean };

/** 每个页面的 metadata：每页自己的 canonical（不要全站指向首页），后台的分享描述和分享图。 */
export async function pageMeta({ path, title, description, image, noindex }: PageSeo): Promise<Metadata> {
  const { settings } = await loadSettings();
  const desc = clip(description || settings.seo?.description?.zh?.trim() || SITE.description);
  const shareImage = image || settings.seo?.image;
  const images = shareImage ? [{ url: shareImage }] : undefined;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title, description: desc, url: path, type: "website", siteName: textOf(settings, "name"), locale: "zh_CN", ...(images ? { images } : {}) },
    twitter: { card: images ? "summary_large_image" : "summary", title, description: desc, ...(shareImage ? { images: [shareImage] } : {}) },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** 全站的身份说明（结构化数据）：告诉搜索引擎这是谁的作品集网站。 */
export const siteJsonLd = () =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: SITE.name, ...(SITE.alternateName ? { alternateName: SITE.alternateName } : {}), inLanguage: "zh-CN", publisher: { "@id": `${ORIGIN}/#person` } },
      {
        "@type": "Person",
        "@id": `${ORIGIN}/#person`,
        name: SITE.name,
        ...(SITE.alternateName ? { alternateName: SITE.alternateName } : {}),
        url: `${ORIGIN}/`,
        ...(SITE.knowsAbout.length ? { knowsAbout: SITE.knowsAbout } : {}),
        ...(SITE.basedIn ? { homeLocation: { "@type": "Place", name: SITE.basedIn } } : {}),
      },
    ],
  }).replace(/</g, "\\u003c");

/** 站内相对地址（封面、视频）换成完整网址，搜索引擎只认完整网址。 */
export const absoluteUrl = (url: string) => new URL(url, `${ORIGIN}/`).toString();

/** 只认 4 位年份；年份不明时不写，不编造。 */
const yearOnly = (year: string) => (/^\d{4}$/.test(year.trim()) ? year.trim() : undefined);

/**
 * 视频在本站公开的时间。Google 要求 uploadDate 是带时区的完整时间（例如 2026-10-23T00:00:00+08:00），
 * 只写日期或不带时区会在 Search Console 里报「无效」。
 * 有记录（定时发布 / 后台上传时间）且合法就用记录，否则用 site.config.ts 里的网站上线日期。
 */
export function videoPublishDate(publishedAt?: string) {
  const time = publishedAt ? Date.parse(publishedAt) : NaN;
  if (!Number.isFinite(time) || time > Date.now()) return SITE.launchDate;
  const hours = SITE.timezoneHours;
  const sign = hours >= 0 ? "+" : "-";
  const offset = `${sign}${String(Math.abs(Math.trunc(hours))).padStart(2, "0")}:${String(Math.round((Math.abs(hours) % 1) * 60)).padStart(2, "0")}`;
  return `${new Date(time + hours * 3600_000).toISOString().slice(0, 19)}${offset}`;
}

export type FilmSeo = { path: string; name: string; description: string; poster: string; stream: string; year: string; publishedAt?: string };

/** 作品详情页的视频说明卡（VideoObject）：作品名、说明、封面、流畅版视频地址、年份、作者。 */
export const filmJsonLd = ({ path, name, description, poster, stream, year, publishedAt }: FilmSeo) => {
  const created = yearOnly(year);
  const data: WithContext<VideoObject> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name,
    description: clip(description, 500),
    thumbnailUrl: [absoluteUrl(poster)],
    contentUrl: absoluteUrl(stream),
    url: absoluteUrl(path),
    inLanguage: "zh-CN",
    // uploadDate = 在本站公开的时间（Google 必填，须带时区）；dateCreated = 作品年份
    uploadDate: videoPublishDate(publishedAt),
    ...(created ? { dateCreated: created } : {}),
    creator: { "@id": `${ORIGIN}/#person` },
    author: { "@id": `${ORIGIN}/#person` },
    isPartOf: { "@id": `${ORIGIN}/#website` },
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
};
