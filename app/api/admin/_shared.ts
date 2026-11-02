// 后台接口共用的小工具（服务端）。
import { builtinGroups, type WorksConfig } from "../../_portfolio/catalog";
import { makeArchiveGroup, makeSocialGroup } from "../../_portfolio/media";

/** 原有作品组的摘要，管理页用来显示名称、条数和封面。 */
export const builtinInfo = () => Object.fromEntries(Object.values(builtinGroups).map((group) => [group.id, { name: group.cn, year: group.year, count: group.posters.length, poster: group.posters[0], files: group.files ?? null }]));

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 后台上传作品组的存储位置。原画 / 流畅 / 预览走媒体子域，封面经由本站 /media/ 读取（能用 Cloudflare 图片压缩，也方便后台截图）。 */
export const uploadedPaths = (id: string) => {
  const mediaBase = `brand/${id}`;
  return {
    mediaBase,
    posterBase: `/media/posters/${mediaBase}`,
    sourcePrefix: `uploads/${id}/`,
    prefixes: [`${mediaBase}/`, `previews/${mediaBase}/`, `streams-balanced/${mediaBase}/`, `posters/${mediaBase}/`, `uploads/${id}/`],
  };
};

/** 按 media.ts 的规则列出一个作品组每条视频的四个版本地址。 */
export const archiveUrls = (id: string, def: { name: string; year: string; count: number; mediaBase: string; posterBase?: string }) => {
  const source = makeArchiveGroup(id, "01", def.name, def.name, def.year, def.count, def.mediaBase, def.posterBase ?? `/posters/${def.mediaBase}`);
  return source.posters.map((poster, index) => ({ poster, preview: source.previews[index], stream: source.streams[index], original: source.clips[index] }));
};

export const usedGroupIds = (config: WorksConfig) => {
  const used = new Set<string>();
  const walk = (entries: WorksConfig["tree"]["children"]) => entries.forEach((entry) => ("group" in entry ? used.add(entry.group) : walk(entry.children ?? [])));
  walk(config.tree.children);
  return used;
};

export async function readJson<T>(request: Request): Promise<T | null> {
  try { return (await request.json()) as T; } catch { return null; }
}

/** 每个作品组按原有顺序的全部条目（封面 / 预览 / 流畅），后台用来排序、预览和换封面。编号从 1 开始。 */
export const rawClips = (config: WorksConfig) => {
  const out: Record<string, { n: number; label: string; poster: string; preview: string; stream: string; original: string }[]> = {};
  const add = (id: string, group: { posters: string[]; previews: string[]; streams: string[]; clips: string[]; files?: string[] }) => {
    out[id] = group.posters.map((poster, index) => ({ n: index + 1, label: group.files?.[index] ?? String(index + 1).padStart(2, "0"), poster, preview: group.previews[index], stream: group.streams[index], original: group.clips[index] }));
  };
  Object.values(builtinGroups).forEach((group) => add(group.id, group));
  Object.entries(config.groups).forEach(([id, def]) => {
    if (def.kind === "archive" && def.count > 0) add(id, makeArchiveGroup(id, "01", def.name, def.name, def.year, def.count, def.mediaBase, def.posterBase ?? `/posters/${def.mediaBase}`));
    if (def.kind === "social") add(id, makeSocialGroup(id, "01", def.name, "", def.files, def.version ?? "", def.mediaId ?? id));
  });
  return out;
};

/** 媒体地址 → R2 里的路径（https://media…/<key>、/api/xxx-media?path=<key>、/media/<key>）。只认媒体文件夹，不会读到 admin/。 */
export const mediaKeyOf = (src: string) => {
  const url = new URL(src, "https://site.invalid");
  const key = url.searchParams.get("path") ?? url.searchParams.get("key") ?? decodeURIComponent(url.pathname.replace(/^\/(media\/)?/, ""));
  return /^(brand|previews|streams-balanced|posters|social|uploads)\//.test(key) && !key.includes("..") ? key : null;
};
