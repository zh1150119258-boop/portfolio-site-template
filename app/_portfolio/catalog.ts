// 作品目录：分类树 → 作品组 → 每条视频。数据来自 R2 里的 admin/works.json（后台编辑），
// 还没有这份文件时用打包进来的 content/works.json（初始的空分类）。
import works from "../../content/works.json";
import { makeArchiveGroup, makeSocialGroup } from "./media";

type SourceGroup = {
  id: string;
  no: string;
  title: string;
  cn: string;
  year: string;
  en?: string;
  files?: string[];
  clips: string[];
  previews: string[];
  streams: string[];
  posters: string[];
};

/** 外语名称（未填写时用中文）。 */
export type LocalNames = Partial<Record<"en", string>>;

export type WorkGroup = {
  slug: string;
  names?: LocalNames;
  no: string;
  title: string;
  subtitle: string;
  /** 抖音 / 视频号 等平台标记，仅社交类有。 */
  platform?: string;
  year: string;
  clips: string[];
  previews: string[];
  streams: string[];
  posters: string[];
  filmLabels: string[];
  /** Films whose 原画 button stays hidden (same exception as the home page player). */
  smoothOnly: boolean[];
  /** 后台填写的项目说明（中文 / 英文），详情页显示。 */
  details?: WorkDetails;
  detailsEn?: WorkDetails;
  homeTitle?: { zh?: string } & LocalNames;
  /** 在网站上公开的时间（ISO）：定时发布的时间，或后台上传的时间；内置作品没有记录 */
  publishedAt?: string;
};

/** 作品组的项目说明：背景、我的职责、客户与合作方。都可以不填，不编造。 */
export type WorkDetails = { background?: string; role?: string; client?: string };

const toGroup = (group: SourceGroup, platform?: string): WorkGroup => {
  const labels = group.files ?? group.clips.map((_, index) => String(index + 1).padStart(2, "0"));
  return {
    slug: group.id,
    no: group.no,
    // 作品组标题用中文名；社交类本身就是中文标题。
    title: group.cn,
    subtitle: "",
    platform,
    year: group.year,
    clips: group.clips,
    previews: group.previews,
    streams: group.streams,
    posters: group.posters,
    filmLabels: labels,
    smoothOnly: labels.map(() => false),
  };
};

/**
 * 作品分类树：作品 → 分类 → （子分类，可以多层）→ 作品组 → 视频。
 * 有 children 的节点是列表页；有 group 的节点是作品组页；两者都没有的是“待补充”占位页。
 * 网址按 slug 逐级拼接，例如 /work/film/brand/spring-campaign。
 */
export type WorkNode = {
  slug: string;
  no: string;
  name: string;
  names?: LocalNames;
  /** 列表页标题下的说明。 */
  note?: string;
  /** 尚无作品时显示的说明。 */
  empty?: string;
  children?: WorkNode[];
  group?: WorkGroup;
};

// ---------- 由 content/works.json 生成 ----------
/** 所有作品组都能设置的后台选项。order / covers 里的编号是作品组原有的第几条（从 1 开始）。 */
export type GroupExtras = {
  /** 隐藏：网站上不显示（后台上传的作品默认先隐藏，预览后再发布） */
  hidden?: boolean;
  /** 定时发布：隐藏的作品到这个时间（ISO）自动公开 */
  publishAt?: string;
  details?: WorkDetails;
  detailsEn?: WorkDetails;
  /** 组内显示顺序；不在列表里的条目不显示。没有时按原顺序全部显示 */
  order?: number[];
  /** 首页显示的名字（不填就用作品组名） */
  homeTitle?: { zh?: string } & LocalNames;
  /** 自定义封面（R2 上的图片，经本站 /media/ 读取） */
  covers?: Record<string, { src: string; size: [number, number] }>;
};
export type GroupDef = GroupExtras & (
  | { kind: "builtin"; name?: string; year?: string; names?: LocalNames }
  | { kind: "archive"; name: string; year: string; count: number; mediaBase: string; posterBase?: string; names?: LocalNames;
      /** 后台上传：processing = 正在转码（网站上暂不显示）；sizes = 每张封面的宽高 */
      status?: "processing" | "ready"; sizes?: ([number, number] | null)[]; uploadedAt?: string; error?: string }
  | { kind: "social"; name: string; year?: string; files: string[]; mediaId?: string; platform?: string; version?: string; names?: LocalNames }
);

export type TreeEntry = { group: string } | { slug: string; name: string; note?: string; empty?: string; names?: LocalNames; children?: TreeEntry[] };
export type WorksConfig = { featured: string[]; featureTitle?: { zh?: string } & LocalNames; groups: Record<string, GroupDef>; tree: { name: string; note?: string; children: TreeEntry[] }; trash?: { group: string; deletedAt: string }[] };

const bundledConfig = works as WorksConfig;

/** 写在代码里的作品组（模板里没有；需要时可以在这里登记，按 id 索引）。 */
export const builtinGroups: Record<string, SourceGroup> = {};

/** 后台上传的作品组：封面存在 R2，尺寸随数据一起保存（posterSizes 里没有）。 */
const runtimeSizes: Record<string, [number, number]> = {};

/** 套用后台选项：自定义封面 → 组内顺序 / 隐藏条目。 */
const applyExtras = (group: WorkGroup, def: GroupExtras, numbered: boolean): WorkGroup => {
  const posters = [...group.posters];
  Object.entries(def.covers ?? {}).forEach(([key, cover]) => {
    const index = Number(key) - 1;
    if (index >= 0 && index < posters.length) { posters[index] = cover.src; runtimeSizes[cover.src] = cover.size; }
  });
  const result = { ...group, posters, details: def.details, detailsEn: def.detailsEn, homeTitle: def.homeTitle };
  if (!def.order) return result;
  const picks = def.order.map((n) => n - 1).filter((index, at, list) => index >= 0 && index < posters.length && list.indexOf(index) === at);
  const pick = <T,>(list: T[]) => picks.map((index) => list[index]);
  return {
    ...result,
    clips: pick(result.clips), previews: pick(result.previews), streams: pick(result.streams), posters: pick(result.posters), smoothOnly: pick(result.smoothOnly),
    // 按编号命名的作品组重新编号（01、02…），按文件名命名的保留原名
    filmLabels: numbered ? picks.map((_, index) => String(index + 1).padStart(2, "0")) : pick(result.filmLabels),
  };
};

/** 隐藏且还没到定时发布时间的作品组不显示。 */
export const isHiddenNow = (def: GroupExtras | undefined, now = Date.now()) => Boolean(def?.hidden) && !(def?.publishAt && Date.parse(def.publishAt) <= now);
/** 下一个定时发布的时间（用来让缓存的目录到点失效）。 */
export const nextPublishAt = (config: WorksConfig, now = Date.now()) => Math.min(Infinity, ...Object.values(config.groups).map((def) => (def.hidden && def.publishAt ? Date.parse(def.publishAt) : NaN)).filter((time) => time > now));

const buildGroup = (config: WorksConfig, id: string, no: string, reveal?: string): WorkGroup | null => {
  const def: GroupDef = config.groups[id] ?? { kind: "builtin" };
  const group = buildGroupBody(def, id, no, reveal);
  const publishedAt = def.publishAt ?? (def.kind === "archive" ? def.uploadedAt : undefined);
  return group && publishedAt ? { ...group, publishedAt } : group;
};

const buildGroupBody = (def: GroupDef, id: string, no: string, reveal?: string): WorkGroup | null => {
  if (id !== reveal && isHiddenNow(def)) return null;
  if (def.kind === "builtin") {
    const source = builtinGroups[id];
    if (!source) return null;
    const group = toGroup({ ...source, no, cn: def.name ?? source.cn, year: def.year ?? source.year });
    return applyExtras({ ...group, names: def.names }, def, !source.files);
  }
  if (def.kind === "archive") {
    // 后台上传但还在转码的作品组暂不显示
    if (def.status === "processing") return null;
    const source = makeArchiveGroup(id, no, def.name, def.name, def.year, def.count, def.mediaBase, def.posterBase ?? `/posters/${def.mediaBase}`);
    def.sizes?.forEach((size, index) => { if (size) runtimeSizes[source.posters[index]] = size; });
    return applyExtras({ ...toGroup(source), names: def.names }, def, true);
  }
  const source = makeSocialGroup(id, no, def.name, def.names?.en ?? "", def.files, def.version ?? "", def.mediaId ?? id);
  return applyExtras({ ...toGroup({ ...source, year: def.year ?? source.year }, def.platform), names: def.names }, def, false);
};

const pad = (index: number) => String(index + 1).padStart(2, "0");

const buildChildren = (config: WorksConfig, entries: TreeEntry[], reveal?: string): WorkNode[] =>
  entries.flatMap((entry, index): WorkNode[] => {
    const no = pad(index);
    if ("group" in entry) {
      const work = buildGroup(config, entry.group, no, reveal);
      return work ? [{ slug: work.slug, no, name: work.title, names: work.names, group: work }] : [];
    }
    return [{ slug: entry.slug, no, name: entry.name, names: entry.names, note: entry.note, empty: entry.empty, children: entry.children ? buildChildren(config, entry.children, reveal) : undefined }];
  });

export type NodeTrail = WorkNode[];

const walk = (trail: NodeTrail, visit: (trail: NodeTrail) => void) => {
  visit(trail);
  trail[trail.length - 1].children?.forEach((child) => walk([...trail, child], visit));
};

/** 由一份作品数据生成完整目录（每次请求用 R2 里的最新数据，见 works-store.ts）。reveal：私密预览时把这个隐藏的作品组也显示出来。 */
export function createCatalog(config: WorksConfig, reveal?: string) {
  const workTree: WorkNode = { slug: "", no: "", name: config.tree.name, note: config.tree.note, children: buildChildren(config, config.tree.children, reveal) };
  const allTrails: NodeTrail[] = [];
  walk([workTree], (trail) => allTrails.push(trail));
  const allGroupTrails = allTrails.filter((trail) => trail[trail.length - 1].group);
  return {
    workTree,
    allTrails,
    allGroupTrails,
    allWorkGroups: allGroupTrails.map((trail) => trail[trail.length - 1].group as WorkGroup),
    /** 首页精选作品组（顺序即显示顺序）。 */
    featuredGroupSlugs: config.featured,
    featureTitle: config.featureTitle,
    /** 按网址片段找到节点，返回从根到该节点的路径；找不到返回 null。 */
    resolvePath(segments: string[]): NodeTrail | null {
      const trail: NodeTrail = [workTree];
      for (const segment of segments) {
        const next = trail[trail.length - 1].children?.find((child) => child.slug === segment);
        if (!next) return null;
        trail.push(next);
      }
      return trail;
    },
    trailOfGroup: (slug: string) => allGroupTrails.find((trail) => trail[trail.length - 1].group?.slug === slug) ?? null,
  };
}
export type Catalog = ReturnType<typeof createCatalog>;

export const bundledWorksConfig = bundledConfig;

export const trailHref = (trail: NodeTrail) => `/work${trail.slice(1).map((node) => `/${node.slug}`).join("")}`;

/** 节点下的全部作品组（含子分类）。 */
export const groupsUnder = (node: WorkNode): WorkGroup[] => node.group ? [node.group] : (node.children ?? []).flatMap(groupsUnder);

/** 封面宽高比（转码时记录的尺寸；不知道时按 3:4）。 */
export const posterRatio = (src: string) => {
  const size = runtimeSizes[src];
  return size ? size[0] / size[1] : 3 / 4;
};
