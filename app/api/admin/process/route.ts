// 后台：原片上传完后登记作品组（状态「转码中」，网站暂不显示），并通知 GitHub Actions 开始转码。
// 转码完成后 GitHub 会调用 /api/media-callback，把状态改成「已就绪」，作品自动出现在网站上。
import { env } from "cloudflare:workers";
import type { TreeEntry, WorksConfig } from "../../../_portfolio/catalog";
import { mediaBucket, updateWorks } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";
import { builtinInfo, readJson, SLUG, uploadedPaths } from "../_shared";

const vars = env as unknown as { GITHUB_REPO?: string; GITHUB_TOKEN?: string; GITHUB_REF?: string };

// append：给已有的后台上传作品组追加视频（sources 只含新的几条）；publish：转码完成后直接公开（默认先隐藏）
type Body = { groupId: string; name: string; year?: string; en?: string; category: string[]; sources: string[]; retry?: boolean; append?: boolean; publish?: boolean };

type CategoryEntry = Extract<TreeEntry, { slug: string }>;
const findCategory = (config: WorksConfig, path: string[]): TreeEntry[] | null => {
  let entries: TreeEntry[] = config.tree.children;
  for (const slug of path) {
    const node = entries.find((entry): entry is CategoryEntry => !("group" in entry) && entry.slug === slug);
    if (!node) return null;
    node.children ??= [];
    entries = node.children;
  }
  return entries;
};

async function dispatch(id: string, sources: string[], origin: string) {
  if (!vars.GITHUB_REPO || !vars.GITHUB_TOKEN) return "转码服务还没有配置（GITHUB_REPO / GITHUB_TOKEN），视频已上传，配置好后在后台点「重新转码」即可。";
  const { mediaBase } = uploadedPaths(id);
  const response = await fetch(`https://api.github.com/repos/${vars.GITHUB_REPO}/actions/workflows/process-media.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${vars.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "portfolio-admin", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: vars.GITHUB_REF ?? "main", inputs: { group: id, media_base: mediaBase, sources: JSON.stringify(sources), callback_url: `${origin}/api/media-callback` } }),
  });
  return response.ok ? null : `通知转码服务失败（GitHub 返回 ${response.status}），可以稍后在后台点「重新转码」。`;
}

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const body = await readJson<Body>(request);
  if (!body || !SLUG.test(body.groupId ?? "") || (!body.retry && !body.sources?.length)) return json({ errors: ["参数不对"] }, 400);
  const id = body.groupId;
  if (builtinInfo()[id]) return json({ errors: ["编号和已有作品重复"] }, 400);
  let sources = (body.sources ?? []).filter((key) => key.startsWith(`uploads/${id}/`));
  if (body.append) {
    if (!sources.length) return json({ errors: ["没有收到新视频"] }, 400);
    const saved = await updateWorks((config) => {
      const def = config.groups[id];
      if (!def || def.kind !== "archive" || def.mediaBase !== uploadedPaths(id).mediaBase) return "只能给后台上传的作品组追加视频";
      (def as { appending?: number }).appending = sources.length;
    });
    if (!saved.ok) return json({ errors: [saved.error] }, 409);
    return json({ ok: true, warning: await dispatch(id, sources, new URL(request.url).origin) });
  }
  if (body.retry) {
    // 重新转码：以 R2 里已上传的原片为准
    const listed = await mediaBucket()?.list({ prefix: `uploads/${id}/` });
    sources = (listed?.objects ?? []).map((object) => object.key).sort();
    if (!sources.length) return json({ errors: ["没有找到这个作品组上传的原片"] }, 404);
  }
  const { mediaBase, posterBase } = uploadedPaths(id);

  if (!body.retry) {
    const saved = await updateWorks((config) => {
      if (config.groups[id]) return "这个编号已经被用了";
      const list = findCategory(config, body.category ?? []);
      if (!list) return "找不到要放入的分类";
      config.groups[id] = {
        kind: "archive", name: body.name?.trim() || id, year: body.year?.trim() || String(new Date().getFullYear()), count: sources.length,
        mediaBase, posterBase, status: "processing", uploadedAt: new Date().toISOString(), ...(body.en ? { names: { en: body.en } } : {}), ...(body.publish ? {} : { hidden: true }),
      };
      list.push({ group: id });
    });
    if (!saved.ok) return json({ errors: [saved.error] }, 409);
  }
  const warning = await dispatch(id, sources, new URL(request.url).origin);
  return json({ ok: true, warning });
}
