import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { filmMetadata, renderFilm } from "../../../_site/pages";

// 单条作品播放页：/film/<作品组>/<第几条>
type Params = { params: Promise<{ slug: string[] }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return filmMetadata(slug);
}

export default async function FilmPage({ params }: Params) {
  const { slug } = await params;
  return (await renderFilm(slug)) ?? notFound();
}
