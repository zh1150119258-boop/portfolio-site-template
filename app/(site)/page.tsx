import Link from "next/link";
import type { WorkGroup } from "../_portfolio/catalog";
import { loadSettings } from "../_portfolio/site-store";
import { getCatalog } from "../_portfolio/works-store";
import { textOf } from "../_site/content";
import { GroupCards } from "../_site/pages";
import { pageMeta } from "../_site/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { settings } = await loadSettings();
  return pageMeta({ path: "/", title: `${textOf(settings, "name")} · ${textOf(settings, "roles")}` });
}

// 首页：一句话标题 + 精选作品（后台「作品与分类」里设为精选；没设精选时显示最新的几组）。
export default async function HomePage() {
  const [{ settings }, catalog] = await Promise.all([loadSettings(), getCatalog()]);
  const bySlug = new Map(catalog.allWorkGroups.map((group) => [group.slug, group]));
  const featured = catalog.featuredGroupSlugs.map((slug) => bySlug.get(slug)).filter((group): group is WorkGroup => Boolean(group));
  const groups = featured.length ? featured : catalog.allWorkGroups.slice(0, 6);
  return (
    <>
      <header className="page-head">
        <h1>{textOf(settings, "heroLine")}</h1>
        <p>{[textOf(settings, "roles"), textOf(settings, "basedIn")].filter(Boolean).join(" · ")}</p>
      </header>
      <div className="section-title"><span>{textOf(settings, "featuredTitle")}</span><Link href="/work">{textOf(settings, "workIndex")} →</Link></div>
      {groups.length ? <GroupCards groups={groups} trailOf={catalog.trailOfGroup} /> : <p className="empty">还没有作品。登录 /admin 后台上传第一组视频吧。</p>}
    </>
  );
}
