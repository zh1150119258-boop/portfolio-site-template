// 网站地图（/sitemap.xml）：给搜索引擎看的全站目录。每次访问按后台最新作品生成，
// 列出所有分类、作品组、作品详情（含视频信息）。隐藏 / 未到发布时间的作品不会出现。
import type { MetadataRoute } from "next";
import { trailHref, type WorkGroup } from "./_portfolio/catalog";
import { getCatalog } from "./_portfolio/works-store";
import { absoluteUrl, ORIGIN, videoPublishDate } from "./_site/seo";

export const dynamic = "force-dynamic";

type Video = NonNullable<MetadataRoute.Sitemap[number]["videos"]>[number];

/** 视频信息：作品名、封面、流畅版地址、说明（后台填写的背景；没填就用作品名和年份）。 */
const videoEntry = (group: WorkGroup, index: number): Video => {
  const title = group.posters.length > 1 ? `${group.title} ${group.filmLabels[index]}` : group.title;
  const description = ((group.details?.background ?? "").trim() || [title, group.year].filter(Boolean).join(" · ")).slice(0, 2000);
  return {
    title,
    thumbnail_loc: absoluteUrl(group.posters[index]),
    description,
    content_loc: absoluteUrl(group.streams[index]),
    publication_date: videoPublishDate(group.publishedAt),
  };
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getCatalog();
  const entries: MetadataRoute.Sitemap = [
    { url: `${ORIGIN}/`, priority: 1 },
    { url: `${ORIGIN}/work`, priority: 0.8 },
    { url: `${ORIGIN}/about`, priority: 0.8 },
    { url: `${ORIGIN}/contact`, priority: 0.6 },
  ];
  for (const trail of catalog.allTrails.slice(1)) {
    entries.push({ url: `${ORIGIN}${trailHref(trail)}`, priority: trail.length <= 2 ? 0.8 : 0.6 });
    const group = trail.at(-1)?.group;
    group?.posters.forEach((_, index) => entries.push({
      url: `${ORIGIN}/film/${group.slug}/${index + 1}`,
      priority: 0.5,
      ...(group.streams[index] && group.posters[index] ? { videos: [videoEntry(group, index)] } : {}),
    }));
  }
  return entries;
}
