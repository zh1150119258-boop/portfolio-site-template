// /robots.txt：允许搜索引擎收录，不收录后台和私密预览，并告诉它网站地图在哪里。
import type { MetadataRoute } from "next";
import { ORIGIN } from "./_site/seo";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/preview/", "/api/"] }], sitemap: `${ORIGIN}/sitemap.xml` };
}
