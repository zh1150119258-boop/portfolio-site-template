import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderWork, workMetadata } from "../../../_site/pages";

// 作品各级页面：/work → 分类 → 子分类 → 作品组，层级来自后台「作品与分类」。
type Params = { params: Promise<{ path?: string[] }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { path = [] } = await params;
  return workMetadata(path);
}

export default async function WorkPage({ params }: Params) {
  const { path = [] } = await params;
  return (await renderWork(path)) ?? notFound();
}
