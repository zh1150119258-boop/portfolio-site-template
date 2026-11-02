// 后台：访问统计（Cloudflare Web Analytics，网站页面里已经带着它的统计脚本）。
// 需要一个只读令牌 CF_ANALYTICS_TOKEN（权限：Account Analytics 读取），没有时返回 setup: true，后台显示设置说明。
import { env } from "cloudflare:workers";
import { json, requireAdmin } from "../_auth";

import { SITE } from "../../../../site.config";

const vars = env as unknown as { CF_ANALYTICS_TOKEN?: string; CF_ACCOUNT_ID?: string };
const ACCOUNT = vars.CF_ACCOUNT_ID ?? "";
const HOST = new URL(SITE.url).hostname;
const HOSTS = [HOST, `www.${HOST}`];

// days 从上一个周期开始取，用来和本周期对比；hours 用来画「一天中什么时间访问」
const QUERY = `query ($account: String!, $since: Date!, $prevSince: Date!, $hosts: [String!]) {
  viewer { accounts(filter: { accountTag: $account }) {
    days: rumPageloadEventsAdaptiveGroups(filter: { date_geq: $prevSince, requestHost_in: $hosts }, limit: 200, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    hours: rumPageloadEventsAdaptiveGroups(filter: { date_geq: $since, requestHost_in: $hosts }, limit: 5000, orderBy: [datetimeHour_ASC]) { count dimensions { datetimeHour } }
    pages: rumPageloadEventsAdaptiveGroups(filter: { date_geq: $since, requestHost_in: $hosts }, limit: 15, orderBy: [count_DESC]) { count dimensions { requestPath } }
    countries: rumPageloadEventsAdaptiveGroups(filter: { date_geq: $since, requestHost_in: $hosts }, limit: 10, orderBy: [count_DESC]) { count dimensions { countryName } }
    referers: rumPageloadEventsAdaptiveGroups(filter: { date_geq: $since, requestHost_in: $hosts }, limit: 10, orderBy: [count_DESC]) { count dimensions { refererHost } }
    devices: rumPageloadEventsAdaptiveGroups(filter: { date_geq: $since, requestHost_in: $hosts }, limit: 5, orderBy: [count_DESC]) { count dimensions { deviceType } }
    systems: rumPageloadEventsAdaptiveGroups(filter: { date_geq: $since, requestHost_in: $hosts }, limit: 10, orderBy: [count_DESC]) { count dimensions { userAgentOS } }
    browsers: rumPageloadEventsAdaptiveGroups(filter: { date_geq: $since, requestHost_in: $hosts }, limit: 10, orderBy: [count_DESC]) { count dimensions { userAgentBrowser } }
  } }
}`;

// ---------- 网站自己的计数（Analytics Engine，见 worker/hits.ts）：不抽样，能认出微信等 App ----------
const DATASET = "site_views";
async function sql(token: string, query: string) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: `${query} FORMAT JSON` });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 200));
  return (JSON.parse(text) as { data: Record<string, string | number>[] }).data;
}
async function ownStats(token: string, days: number) {
  // /_selftest 是部署后检查用的测试记录，不计入
  const within = (n: number) => `timestamp > NOW() - INTERVAL '${n}' DAY AND blob1 != '/_selftest'`;
  const dim = (blob: string, extra = "", limit = 15) => sql(token, `SELECT ${blob} AS name, SUM(_sample_interval) AS count FROM ${DATASET} WHERE ${within(days)} ${extra} GROUP BY name ORDER BY count DESC LIMIT ${limit}`)
    .then((rows) => rows.map((row) => ({ name: String(row.name), count: Number(row.count) })));
  const [daily, hours, pages, referers, channels, countries, devices, systems, browsers] = await Promise.all([
    // 北京时间的日期
    sql(token, `SELECT toStartOfInterval(timestamp + INTERVAL '8' HOUR, INTERVAL '1' DAY) AS d, SUM(_sample_interval) AS views, SUM(IF(blob8 = '1', _sample_interval, 0)) AS visits FROM ${DATASET} WHERE ${within(days * 2)} GROUP BY d ORDER BY d`),
    sql(token, `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS h, SUM(_sample_interval) AS views FROM ${DATASET} WHERE ${within(days)} GROUP BY h ORDER BY h`),
    dim("blob1"), dim("blob2", "AND blob2 != ''"), dim("blob3", "AND blob3 != '站内'"), dim("blob4"), dim("blob5", "", 5), dim("blob6", "", 10), dim("blob7", "", 10),
  ]);
  return {
    source: "self", days,
    daily: daily.map((row) => ({ date: String(row.d).slice(0, 10), views: Number(row.views), visits: Number(row.visits) })),
    hours: hours.map((row) => ({ at: `${String(row.h).replace(" ", "T").slice(0, 19)}Z`, views: Number(row.views) })),
    pages, referers, channels, countries, devices, systems, browsers,
  };
}

export async function GET(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  // 粘贴时可能带上了 Cloudflare 页面里的示例命令，这里只取令牌本身
  const token = vars.CF_ANALYTICS_TOKEN?.match(/[A-Za-z0-9_-]{30,}/)?.[0];
  if (!token || !ACCOUNT) return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? json(demoStats()) : json({ setup: true });
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  // 优先用网站自己的计数；还没有数据或查询出错时退回 Cloudflare 网站统计
  if (new URL(request.url).searchParams.get("source") !== "cloudflare") {
    const own = await ownStats(token, days).catch((error: Error) => ({ error: error.message }));
    if (!("error" in own) && own.daily.length) return json(own);
  }
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const prevSince = new Date(Date.now() - (2 * days - 1) * 86_400_000).toISOString().slice(0, 10);
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { account: ACCOUNT, since, prevSince, hosts: HOSTS } }),
  });
  const result = (await response.json().catch(() => null)) as { data?: { viewer: { accounts: Record<string, { count: number; sum?: { visits: number }; dimensions: Record<string, string> }[]>[] } }; errors?: { message: string }[] } | null;
  const account = result?.data?.viewer.accounts[0];
  if (!response.ok || !account) return json({ errors: [`读取统计失败：${result?.errors?.map((error) => error.message).join("；") ?? response.status}`] }, 502);
  const rows = (key: string, dim: string) => account[key].map((row) => ({ name: row.dimensions[dim] || "（直接访问）", count: row.count }));
  return json({
    source: "cloudflare",
    days,
    since,
    daily: account.days.map((row) => ({ date: row.dimensions.date, views: row.count, visits: row.sum?.visits ?? 0 })),
    hours: account.hours.map((row) => ({ at: row.dimensions.datetimeHour, views: row.count })),
    pages: rows("pages", "requestPath"),
    countries: rows("countries", "countryName"),
    referers: rows("referers", "refererHost"),
    devices: rows("devices", "deviceType"),
    systems: rows("systems", "userAgentOS"),
    browsers: rows("browsers", "userAgentBrowser"),
  });
}

/** 仅本地预览：没有令牌时给后台看板一份示例数据，方便调整版式。 */
function demoStats() {
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const daily = Array.from({ length: 60 }, (_, i) => 59 - i).filter((offset) => offset % 7 !== 3).map((offset) => ({ date: day(offset), views: Math.round(20 + 15 * Math.sin(offset / 4) + (60 - offset) / 2), visits: Math.round(9 + 6 * Math.sin(offset / 4) + (60 - offset) / 5) }));
  const hours = Array.from({ length: 24 * 30 }, (_, i) => ({ at: new Date(Date.now() - i * 3_600_000).toISOString().slice(0, 13) + ":00:00Z", views: Math.max(0, Math.round(3 + 3 * Math.sin((i % 24) / 3.8))) }));
  return {
    days: 30, daily, hours,
    pages: [{ name: "/", count: 320 }, { name: "/work/film", count: 140 }, { name: "/film/sample/1", count: 90 }, { name: "/about", count: 70 }, { name: "/contact", count: 20 }],
    referers: [{ name: "", count: 260 }, { name: "example.com", count: 210 }, { name: "www.xiaohongshu.com", count: 80 }, { name: "www.google.com", count: 40 }, { name: "www.instagram.com", count: 20 }, { name: "example.org", count: 10 }],
    devices: [{ name: "mobile", count: 380 }, { name: "desktop", count: 220 }, { name: "tablet", count: 20 }],
    systems: [{ name: "iOS", count: 300 }, { name: "MacOSX", count: 150 }, { name: "Android", count: 90 }, { name: "Windows", count: 70 }],
    browsers: [{ name: "MobileSafari", count: 200 }, { name: "WeChat", count: 120 }, { name: "Chrome", count: 160 }, { name: "ChromeMobile", count: 80 }],
    countries: [{ name: "CN", count: 420 }, { name: "HK", count: 80 }, { name: "US", count: 60 }, { name: "JP", count: 40 }, { name: "VN", count: 20 }],
  };
}
