import { SITE } from "../site.config";

const SITE_HOST = new URL(SITE.url).hostname.replace(/^www\./, "");

// 网站自己的访问计数：页面加载和站内切换页面时，浏览器发一条记录到 /api/hit，这里写进 Cloudflare Analytics Engine。
// 每条记录：页面、来源网站、渠道（含微信等 App 内打开）、地区、设备、系统、浏览器、是否新访问。不记录 IP 或任何个人信息。
type Dataset = { writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void };

const BOTS = /bot|spider|crawl|slurp|curl|wget|python|headless|lighthouse|preview|monitor|http-client|facebookexternalhit/i;

// App 内打开时一般没有来源网址，只能从浏览器标识里认出是哪个 App
const IN_APP: [RegExp, string, string][] = [
  [/MicroMessenger/i, "微信", "微信"], [/\bQQ\//i, "QQ", "微信 / QQ"], [/Weibo/i, "微博", "微博"], [/xhsdiscover|XiaoHongShu/i, "小红书", "小红书"],
  [/aweme|BytedanceWebview|musical_ly|TikTok/i, "抖音 / TikTok", "抖音 / TikTok"], [/Instagram/i, "Instagram", "Instagram"], [/FBAN|FBAV/i, "Facebook", "Facebook"],
  [/LinkedInApp/i, "LinkedIn", "LinkedIn"], [/DingTalk/i, "钉钉", "钉钉"], [/Lark|Feishu/i, "飞书", "飞书"],
];
const SITES: [RegExp, string][] = [
  [/google\.|bing\.com|baidu\.com|sogou|so\.com|yandex|duckduckgo/, "搜索引擎"], [/xiaohongshu|xhslink/, "小红书"], [/weixin|wechat|qq\.com/, "微信 / QQ"],
  [/douyin|tiktok/, "抖音 / TikTok"], [/weibo/, "微博"], [/instagram/, "Instagram"], [/facebook|fb\.com/, "Facebook"], [/linkedin/, "LinkedIn"],
  [/^t\.co$|twitter|x\.com/, "X / Twitter"], [/behance|zcool/, "Behance / 站酷"],
];

const parseAgent = (ua: string) => {
  const app = IN_APP.find(([re]) => re.test(ua));
  const device = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "tablet" : /Mobi|iPhone|Android/i.test(ua) ? "mobile" : "desktop";
  const os = /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Windows/i.test(ua) ? "Windows" : /CrOS/i.test(ua) ? "ChromeOS" : /Linux/i.test(ua) ? "Linux" : "其他";
  const browser = app ? `${app[1]}（App 内）` : /Edg\//i.test(ua) ? "Edge" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /SamsungBrowser/i.test(ua) ? "三星浏览器" : /UCBrowser/i.test(ua) ? "UC 浏览器" : /QQBrowser/i.test(ua) ? "QQ 浏览器" : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "其他";
  return { device, os, browser, appChannel: app?.[2] };
};

export async function recordHit(request: Request, dataset: Dataset | undefined) {
  // X-Hit 说明这条记录有没有写入（排查用）
  const reply = (state: string) => new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Hit": state } });
  const ua = request.headers.get("user-agent") ?? "";
  if (!dataset) return reply("no-dataset");
  if (request.method !== "POST" || BOTS.test(ua)) return reply("skipped");
  const body = (await request.json().catch(() => null)) as { p?: string; r?: string; n?: boolean } | null;
  const path = String(body?.p ?? "").split(/[?#]/)[0].slice(0, 200);
  if (!path.startsWith("/") || path.startsWith("/admin") || path.startsWith("/api")) return reply("skipped");
  let refHost = "";
  try { refHost = body?.r ? new URL(body.r).hostname.replace(/^www\./, "") : ""; } catch { refHost = ""; }
  const self = refHost === SITE_HOST || refHost.endsWith(`.${SITE_HOST}`);
  const agent = parseAgent(ua);
  // 渠道：外部网站 → 按网站归类；没有来源但在某个 App 里打开 → 那个 App；都没有 → 直接访问。站内跳转只记页面，不算渠道
  const channel = self ? "站内" : refHost ? SITES.find(([re]) => re.test(refHost))?.[1] ?? "其他网站" : agent.appChannel ?? "直接访问";
  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? "XX";
  dataset.writeDataPoint({
    blobs: [path, self ? "" : refHost, channel, country, agent.device, agent.os, agent.browser, body?.n ? "1" : "0"],
    doubles: [1],
    indexes: [path.slice(0, 96)],
  });
  return reply("recorded");
}
