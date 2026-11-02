// 作品数据的读写（服务端）。线上以 R2 里的 admin/works.json 为准，后台保存后几秒内全站生效、无需重新部署；
// R2 里还没有这份文件时（例如第一次上线、或本地预览）回退到打包时的 content/works.json。
import { env } from "cloudflare:workers";
import { bundledWorksConfig, createCatalog, nextPublishAt, type Catalog, type WorksConfig } from "./catalog";

export const WORKS_KEY = "admin/works.json";
export const BACKUP_PREFIX = "admin/backups/";

type Bucket = R2Bucket;
export const mediaBucket = (): Bucket | null => ((env as unknown as { MEDIA_BUCKET?: Bucket }).MEDIA_BUCKET ?? null);

// 同一个 Worker 实例里短暂缓存，避免每次请求都读 R2；后台保存时会清掉
const CACHE_MS = 5_000;
let cached: { at: number; config: WorksConfig; version: string; catalog: Catalog; expires: number } | null = null;

export async function loadWorks(): Promise<{ config: WorksConfig; version: string; fromBucket: boolean }> {
  const bucket = mediaBucket();
  const object = bucket ? await bucket.get(WORKS_KEY).catch(() => null) : null;
  if (!object) return { config: structuredClone(bundledWorksConfig), version: "bundled", fromBucket: false };
  return { config: (await object.json()) as WorksConfig, version: object.etag, fromBucket: true };
}

export async function getCatalog(): Promise<Catalog> {
  if (cached && Date.now() - cached.at < CACHE_MS && Date.now() < cached.expires) return cached.catalog;
  const { config, version } = await loadWorks();
  // 有定时发布的作品时，到点后重新生成目录
  if (cached && cached.version === version && Date.now() < cached.expires) {
    cached.at = Date.now();
    return cached.catalog;
  }
  const catalog = createCatalog(config);
  cached = { at: Date.now(), config, version, catalog, expires: nextPublishAt(config) };
  return catalog;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/** 保存作品数据。base 是读取时的版本号；文件在此期间被别处改过就拒绝，避免覆盖。返回新版本号。 */
export async function saveWorks(config: WorksConfig, base: string): Promise<{ ok: true; version: string } | { ok: false; conflict: true }> {
  const bucket = mediaBucket();
  if (!bucket) throw new Error("R2 binding MEDIA_BUCKET is unavailable");
  const current = await bucket.head(WORKS_KEY);
  const currentVersion = current?.etag ?? "bundled";
  if (currentVersion !== base) return { ok: false, conflict: true };
  if (current) {
    const previous = await bucket.get(WORKS_KEY);
    if (previous) await bucket.put(`${BACKUP_PREFIX}works-${stamp()}.json`, await previous.arrayBuffer(), { httpMetadata: { contentType: "application/json" } });
  }
  const body = `${JSON.stringify(config, null, 2)}\n`;
  const written = await bucket.put(WORKS_KEY, body, {
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
    ...(current ? { onlyIf: { etagMatches: current.etag } } : {}),
  });
  if (!written) return { ok: false, conflict: true };
  cached = null;
  return { ok: true, version: written.etag };
}

export async function listBackups(): Promise<string[]> {
  const bucket = mediaBucket();
  if (!bucket) return [];
  const listed = await bucket.list({ prefix: BACKUP_PREFIX, limit: 1000 });
  return listed.objects.map((object) => object.key.slice(BACKUP_PREFIX.length)).filter((name) => name.startsWith("works-")).sort().reverse();
}

export async function readBackup(name: string): Promise<WorksConfig | null> {
  const bucket = mediaBucket();
  if (!bucket || !/^works-[\d-]+\.json$/.test(name)) return null;
  const object = await bucket.get(`${BACKUP_PREFIX}${name}`);
  return object ? ((await object.json()) as WorksConfig) : null;
}

/** 读取最新数据 → 修改 → 保存；期间被别处改过就重读重试（转码回调和后台操作可能同时发生）。 */
export async function updateWorks(mutate: (config: WorksConfig) => void | string): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { config, version } = await loadWorks();
    const problem = mutate(config);
    if (typeof problem === "string") return { ok: false, error: problem };
    const result = await saveWorks(config, version);
    if (result.ok) return result;
  }
  return { ok: false, error: "数据正在被频繁修改，请稍后再试" };
}

/** 私密预览用：把指定的隐藏作品组也放进目录（不缓存）。 */
export async function getPreviewCatalog(reveal: string): Promise<Catalog> {
  return createCatalog((await loadWorks()).config, reveal);
}
