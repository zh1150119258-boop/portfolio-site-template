// 后台：R2 空间用量与清理。GET 列出各文件夹大小和可以清理的几类文件；POST 删除其中一类（需要输入「删除」确认，不能恢复）。
// 只会列出确定没被网站用到的文件，网站正在使用的视频、封面和数据文件都不会出现在清理列表里。
import { type WorksConfig } from "../../../_portfolio/catalog";
import { loadWorks, mediaBucket } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";
import { mediaKeyOf, rawClips, readJson } from "../_shared";

type Item = { key: string; size: number };
type Category = { id: string; title: string; note: string; items: Item[] };

async function listAll(bucket: R2Bucket): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ cursor, limit: 1000 });
    listed.objects.forEach((object) => items.push({ key: object.key, size: object.size }));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return items;
}

function categorize(items: Item[], config: WorksConfig): Category[] {
  // 网站上所有作品组（含隐藏的）用到的文件夹
  const usedDirs = new Set(Object.values(rawClips(config)).flat().flatMap((clip) => [clip.poster, clip.preview, clip.stream, clip.original]).map((src) => mediaKeyOf(src)?.replace(/\/[^/]+$/, "")).filter(Boolean));
  const usedCovers = new Set(Object.values(config.groups).flatMap((def) => Object.values(def.covers ?? {}).map((cover) => cover.src.replace(/^\/media\//, ""))));
  const pick = (test: (key: string) => boolean) => items.filter((item) => test(item.key));
  return [
    { id: "removed-groups", title: "已删除作品的残留文件", note: "作品组已经不在后台数据里，但还留着视频或封面。", items: pick((key) => {
      const upload = /^uploads\/([a-z0-9-]+)\//.exec(key)?.[1];
      if (upload) return !config.groups[upload];
      return /^(?:previews\/|streams-balanced\/|posters\/)?brand\/[a-z0-9-]+\/clip-\d+\.(?:mp4|jpg)$/.test(key) && !usedDirs.has(key.replace(/\/[^/]+$/, ""));
    }) },
    { id: "old-covers", title: "换下来的旧封面", note: "在后台换过封面后，原来上传的自定义封面图。", items: pick((key) => key.startsWith("posters/custom/") && !usedCovers.has(key)) },
    { id: "upload-sources", title: "已转码作品的上传原片", note: "转码完成后原画已经另外保存，这些是上传时的原始文件。删掉后这些作品不能再点「重新转码」。", items: pick((key) => { const id = /^uploads\/([a-z0-9-]+)\//.exec(key)?.[1]; const def = id ? config.groups[id] : undefined; return def?.kind === "archive" && def.status === "ready" && !(def as { appending?: number }).appending; }) },
  ];
}

export async function GET(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const bucket = mediaBucket();
  if (!bucket) return json({ errors: ["存储不可用"] }, 503);
  const [items, { config }] = await Promise.all([listAll(bucket), loadWorks()]);
  const folders = new Map<string, { size: number; count: number }>();
  for (const item of items) {
    const parts = item.key.split("/");
    const folder = parts.length > 1 ? (["previews", "streams-balanced", "posters", "social"].includes(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0]) : "（根目录）";
    const entry = folders.get(folder) ?? { size: 0, count: 0 };
    entry.size += item.size; entry.count += 1;
    folders.set(folder, entry);
  }
  return json({
    total: { size: items.reduce((sum, item) => sum + item.size, 0), count: items.length },
    folders: [...folders].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.size - a.size),
    categories: categorize(items, config).map(({ items: list, ...rest }) => ({ ...rest, count: list.length, size: list.reduce((sum, item) => sum + item.size, 0), sample: list.slice(0, 8).map((item) => item.key) })),
  });
}

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const bucket = mediaBucket();
  if (!bucket) return json({ errors: ["存储不可用"] }, 503);
  const body = await readJson<{ category: string; confirm: string }>(request);
  if (body?.confirm !== "删除") return json({ errors: ["请输入「删除」确认"] }, 400);
  const [items, { config }] = await Promise.all([listAll(bucket), loadWorks()]);
  const category = categorize(items, config).find((item) => item.id === body.category);
  if (!category) return json({ errors: ["找不到这一类文件"] }, 404);
  for (let index = 0; index < category.items.length; index += 1000) await bucket.delete(category.items.slice(index, index + 1000).map((item) => item.key));
  return json({ ok: true, deleted: category.items.length, size: category.items.reduce((sum, item) => sum + item.size, 0) });
}
