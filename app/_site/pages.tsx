// 各页面的内容（服务端）。数据每次从 R2 的最新作品数据生成，后台修改后无需重新部署。
import type { Metadata } from "next";
import Link from "next/link";
import { groupsUnder, posterRatio, trailHref, type Catalog, type NodeTrail, type WorkGroup, type WorkNode } from "../_portfolio/catalog";
import { posterUrl } from "../_portfolio/poster-url";
import { getCatalog, getPreviewCatalog } from "../_portfolio/works-store";
import { FilmPlayer } from "./film-player";
import { PreviewCard } from "./preview-card";
import { filmJsonLd, pageMeta } from "./seo";

const filmHref = (group: WorkGroup, index: number, token?: string) => (token ? `/preview/${group.slug}/${token}/${index + 1}` : `/film/${group.slug}/${index + 1}`);

/** 面包屑：作品 / 分类 / … */
export function Crumbs({ trail }: { trail: NodeTrail }) {
  return (
    <nav className="crumbs" aria-label="位置">
      {trail.map((node, index) => (index === trail.length - 1
        ? <span key={node.slug || "root"}>{node.name}</span>
        : index === 0 ? <Link key="root" href="/work">{node.name}</Link> : <span key={node.slug}><Link href={trailHref(trail.slice(0, index + 1))}>{node.name}</Link></span>))}
    </nav>
  );
}

/** 一组作品的卡片网格（每条视频一张）。 */
export function GroupGrid({ group, token }: { group: WorkGroup; token?: string }) {
  return (
    <div className="grid">
      {group.posters.map((poster, index) => (
        <PreviewCard key={`${group.slug}-${index}`} href={filmHref(group, index, token)} poster={posterUrl(poster, 720)} preview={group.previews[index]} ratio={posterRatio(poster)}
          title={group.posters.length > 1 ? `${group.title} ${group.filmLabels[index]}` : group.title} note={index === 0 ? group.year : undefined} eager={index < 3} />
      ))}
    </div>
  );
}

/** 分类下的作品组卡片（每组用第一条的封面和预览）。 */
export function GroupCards({ groups, trailOf }: { groups: WorkGroup[]; trailOf: (slug: string) => NodeTrail | null }) {
  return (
    <div className="grid">
      {groups.map((group, index) => {
        const trail = trailOf(group.slug);
        return trail ? (
          <PreviewCard key={group.slug} href={trailHref(trail)} poster={posterUrl(group.posters[0], 720)} preview={group.previews[0]} ratio={posterRatio(group.posters[0])}
            title={group.title} note={[group.year, group.posters.length > 1 ? `${group.posters.length} 条` : ""].filter(Boolean).join(" · ")} eager={index < 3} />
        ) : null;
      })}
    </div>
  );
}

const nodeCount = (node: WorkNode) => groupsUnder(node).length;

/** /work/... 的标题与描述 */
export async function workMetadata(path: string[]): Promise<Metadata> {
  const trail = (await getCatalog()).resolvePath(path);
  const node = trail?.at(-1);
  if (!trail || !node) return { title: "找不到页面", robots: { index: false } };
  return pageMeta({ path: trailHref(trail), title: node.name, description: node.group?.details?.background || node.note });
}

/** /work/... 页面：分类 → 子分类列表；作品组 → 视频网格。 */
export async function renderWork(path: string[]) {
  const catalog = await getCatalog();
  const trail = catalog.resolvePath(path);
  const node = trail?.at(-1);
  if (!trail || !node) return null;
  if (node.group) return <GroupPage trail={trail} group={node.group} />;
  const children = node.children ?? [];
  const groupChildren = children.filter((child) => child.group).map((child) => child.group as WorkGroup);
  const categories = children.filter((child) => !child.group);
  return (
    <>
      <header className="page-head">
        {trail.length > 1 ? <Crumbs trail={trail} /> : null}
        <h1>{node.name}</h1>
        {node.note ? <p>{node.note}</p> : null}
      </header>
      {categories.length ? (
        <div className="list">
          {categories.map((child) => (
            <Link key={child.slug} href={trailHref([...trail, child])}>
              <span className="no">{child.no}</span>
              <span className="name">{child.name}</span>
              <span className="count">{nodeCount(child) ? `${nodeCount(child)} 组` : "待补充"}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {groupChildren.length ? <div style={{ marginTop: categories.length ? 48 : 0 }}><GroupCards groups={groupChildren} trailOf={catalog.trailOfGroup} /></div> : null}
      {!children.length ? <p className="empty">{node.empty || "作品整理中，敬请期待。"}</p> : null}
    </>
  );
}

function GroupPage({ trail, group, token }: { trail: NodeTrail; group: WorkGroup; token?: string }) {
  return (
    <>
      <header className="page-head">
        <Crumbs trail={trail} />
        <h1>{group.title}</h1>
        <p>{[group.year, `${group.posters.length} 条`].filter(Boolean).join(" · ")}</p>
      </header>
      <GroupGrid group={group} token={token} />
      <Details group={group} />
    </>
  );
}

/** 项目说明：背景、我的职责、客户与合作方。后台没填的不显示，不编造。 */
function Details({ group }: { group: WorkGroup }) {
  const rows = ([["项目背景", group.details?.background], ["我的职责", group.details?.role], ["客户与合作", group.details?.client]] as const).filter(([, value]) => value?.trim());
  if (!rows.length) return null;
  return <dl className="details" style={{ marginTop: 48 }}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

type FilmFound = { catalog: Catalog; trail: NodeTrail; group: WorkGroup; index: number };
const findFilm = (catalog: Catalog, slug: string, item: string | undefined): FilmFound | null => {
  const trail = catalog.trailOfGroup(slug);
  const group = trail?.at(-1)?.group;
  const index = item === undefined ? 0 : Number(item) - 1;
  if (!trail || !group || !Number.isInteger(index) || index < 0 || index >= group.posters.length) return null;
  return { catalog, trail, group, index };
};
const filmTitle = (group: WorkGroup, index: number) => (group.posters.length > 1 ? `${group.title} ${group.filmLabels[index]}` : group.title);

export async function filmMetadata(slug: string[]): Promise<Metadata> {
  const found = slug.length <= 2 ? findFilm(await getCatalog(), slug[0], slug[1]) : null;
  if (!found) return { title: "找不到页面", robots: { index: false } };
  const { group, index } = found;
  return pageMeta({ path: filmHref(group, index), title: filmTitle(group, index), description: group.details?.background || [group.title, group.year].filter(Boolean).join(" · "), image: group.posters[index] });
}

/** /film/<作品组>/<第几条>：单条作品的播放页。 */
export async function renderFilm(slug: string[], token?: string, catalogOverride?: Catalog) {
  if (slug.length > 2) return null;
  const found = findFilm(catalogOverride ?? (await getCatalog()), slug[0], slug[1]);
  if (!found) return null;
  const { trail, group, index } = found;
  const title = filmTitle(group, index);
  const count = group.posters.length;
  const jsonLd = token ? null : filmJsonLd({
    path: filmHref(group, index), name: title, description: group.details?.background || [title, group.year].filter(Boolean).join(" · "),
    poster: group.posters[index], stream: group.streams[index], year: group.year, publishedAt: group.publishedAt,
  });
  return (
    <article className="film">
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}
      <Crumbs trail={trail} />
      <FilmPlayer key={`${group.slug}-${index}`} poster={posterUrl(group.posters[index], 1600)} stream={group.streams[index]} original={group.clips[index]} ratio={posterRatio(group.posters[index])} title={title} allowOriginal={!group.smoothOnly[index]} />
      <div className="film-bar">
        <h1>{title}</h1>
        <span style={{ color: "var(--muted)" }}>{[group.year, count > 1 ? `${index + 1} / ${count}` : ""].filter(Boolean).join(" · ")}</span>
      </div>
      {count > 1 ? (
        <nav className="film-nav" aria-label="上一条 / 下一条">
          {index > 0 ? <Link href={filmHref(group, index - 1, token)}>← 上一条</Link> : <span />}
          <Link href={token ? `/preview/${group.slug}/${token}` : trailHref(trail)}>全部 {count} 条</Link>
          {index < count - 1 ? <Link href={filmHref(group, index + 1, token)}>下一条 →</Link> : <span />}
        </nav>
      ) : null}
      <Details group={group} />
    </article>
  );
}

/** 私密预览（隐藏作品）：/preview/<作品组>/<口令>[/<第几条>]。 */
export async function renderPreview(id: string, token: string, n: number | null) {
  const catalog = await getPreviewCatalog(id);
  const trail = catalog.trailOfGroup(id);
  const group = trail?.at(-1)?.group;
  if (!trail || !group) return null;
  if (n !== null) return renderFilm([id, String(n)], token, catalog);
  return <GroupPage trail={trail} group={group} token={token} />;
}
