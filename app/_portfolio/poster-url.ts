// 封面图压缩：交给 Cloudflare 图片转换（需要在 Cloudflare 后台为域名开启 Images →「转换」，免费 5000 次/月，超额只停不收费）。
// 浏览器支持就自动给 AVIF / WebP，并缩到够用的宽度；转换失败时自动跳回原图，不会坏图。
// 只处理本站和媒体子域的图片；本地开发（localhost 没有 /cdn-cgi）原样返回。
import { SITE } from "../../site.config";

const OWN_HOSTS = [`${SITE.url.replace(/\/$/, "")}/`, `${SITE.mediaUrl.replace(/\/$/, "")}/`];
const ENABLED = process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_IMAGE_RESIZE !== "off";

/** width 是 CSS 像素宽度乘以屏幕倍数后的大概需要；原图更小时不会放大。 */
export function posterUrl(src: string, width?: number): string;
export function posterUrl(src: string | undefined, width?: number): string | undefined;
export function posterUrl(src: string | undefined, width = 960): string | undefined {
  if (!src || !ENABLED) return src;
  if (src.startsWith("/cdn-cgi/") || /\.svg($|\?)/i.test(src)) return src;
  const options = `width=${width},fit=scale-down,format=auto,quality=80,onerror=redirect`;
  if (src.startsWith("/") && !src.startsWith("//")) return `/cdn-cgi/image/${options}${src}`;
  if (OWN_HOSTS.some((host) => src.startsWith(host))) return `/cdn-cgi/image/${options}/${src}`;
  return src;
}
