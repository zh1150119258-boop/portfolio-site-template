// 后台：彻底删除一个后台上传的作品组（R2 里的原片、流畅、预览、封面都删掉，不能恢复）。
// 只能删「未放入分类」里的、由后台上传的作品组；原有作品不允许在这里删除文件。
import { mediaBucket, updateWorks } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";
import { readJson, uploadedPaths, usedGroupIds } from "../_shared";

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const bucket = mediaBucket();
  if (!bucket) return json({ errors: ["存储不可用"] }, 503);
  const body = await readJson<{ groupId: string; confirm: string }>(request);
  const id = body?.groupId ?? "";
  if (!id || body?.confirm !== id) return json({ errors: ["请输入作品组编号确认删除"] }, 400);
  const paths = uploadedPaths(id);

  const removed = await updateWorks((config) => {
    const def = config.groups[id];
    if (!def || def.kind !== "archive" || def.mediaBase !== paths.mediaBase) return "只能彻底删除后台上传的作品组";
    if (usedGroupIds(config).has(id)) return "请先把这个作品组从分类里移出";
    delete config.groups[id];
    config.featured = config.featured.filter((item) => item !== id);
  });
  if (!removed.ok) return json({ errors: [removed.error] }, 409);

  let count = 0;
  for (const prefix of paths.prefixes) {
    let cursor: string | undefined;
    do {
      const listed = await bucket.list({ prefix, cursor, limit: 1000 });
      const keys = listed.objects.map((object) => object.key);
      if (keys.length) await bucket.delete(keys);
      count += keys.length;
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }
  return json({ ok: true, deleted: count });
}
