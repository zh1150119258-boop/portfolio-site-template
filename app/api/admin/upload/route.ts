// 后台：把原片分块上传进 R2（uploads/<作品组>/NN.<扩展名>）。
// Worker 单次请求有大小上限，所以浏览器把文件切成 16MB 一块逐块上传；断了可以只重传失败的那一块。
import { mediaBucket } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";
import { readJson, SLUG } from "../_shared";

const KEY = /^uploads\/[a-z0-9]+(?:-[a-z0-9]+)*\/\d{2}\.(mp4|mov|m4v)$/;
const EXT = /\.(mp4|mov|m4v)$/i;

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const bucket = mediaBucket();
  if (!bucket) return json({ errors: ["存储不可用"] }, 503);
  const body = await readJson<{ action: string; groupId?: string; index?: number; filename?: string; key?: string; uploadId?: string; parts?: { partNumber: number; etag: string }[] }>(request);
  if (!body) return json({ errors: ["数据格式不对"] }, 400);

  if (body.action === "create") {
    const ext = EXT.exec(body.filename ?? "")?.[1]?.toLowerCase();
    if (!body.groupId || !SLUG.test(body.groupId) || !ext || !Number.isInteger(body.index) || body.index! < 1 || body.index! > 99) {
      return json({ errors: ["只支持 mp4 / mov / m4v 视频，一组最多 99 条"] }, 400);
    }
    const key = `uploads/${body.groupId}/${String(body.index).padStart(2, "0")}.${ext}`;
    const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: ext === "mov" ? "video/quicktime" : "video/mp4" } });
    return json({ key, uploadId: upload.uploadId });
  }
  if (!body.key || !KEY.test(body.key) || !body.uploadId) return json({ errors: ["上传参数不对"] }, 400);
  const upload = bucket.resumeMultipartUpload(body.key, body.uploadId);
  if (body.action === "complete") {
    if (!body.parts?.length) return json({ errors: ["没有收到任何分块"] }, 400);
    const object = await upload.complete(body.parts);
    return json({ ok: true, key: object.key, size: object.size });
  }
  if (body.action === "abort") {
    await upload.abort();
    return json({ ok: true });
  }
  return json({ errors: ["未知操作"] }, 400);
}

export async function PUT(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const bucket = mediaBucket();
  if (!bucket) return json({ errors: ["存储不可用"] }, 503);
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const uploadId = url.searchParams.get("uploadId") ?? "";
  const part = Number(url.searchParams.get("part"));
  if (!KEY.test(key) || !uploadId || !Number.isInteger(part) || part < 1 || part > 10000) return json({ errors: ["上传参数不对"] }, 400);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > 20 * 1024 * 1024) return json({ errors: ["分块大小不对"] }, 400);
  const uploaded = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(part, data);
  return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
}
