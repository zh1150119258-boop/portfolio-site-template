import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checkPreviewToken } from "../../../api/admin/_auth";
import { renderPreview } from "../../../_site/pages";

// 隐藏作品的私密预览：/preview/<作品组>/<口令>，以及 /preview/<作品组>/<口令>/<第几条>。不让搜索引擎收录。
type Params = { params: Promise<{ slug: string[] }> };
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "作品预览", robots: { index: false, follow: false } };

export default async function PreviewPage({ params }: Params) {
  const { slug } = await params;
  const [id, token, item, ...rest] = slug;
  if (!id || !token || rest.length || !(await checkPreviewToken(id, token))) notFound();
  const n = item === undefined ? null : Number(item);
  if (n !== null && !Number.isInteger(n)) notFound();
  return (await renderPreview(id, token, n)) ?? notFound();
}
