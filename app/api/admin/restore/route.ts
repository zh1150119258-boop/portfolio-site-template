// 后台：恢复到某个历史版本（恢复前的当前版本也会先备份）。
import { loadWorks, readBackup, saveWorks } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";
import { readJson } from "../_shared";

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const body = await readJson<{ name: string }>(request);
  const backup = body?.name ? await readBackup(body.name) : null;
  if (!backup) return json({ errors: ["找不到这个备份"] }, 404);
  const { version } = await loadWorks();
  const result = await saveWorks(backup, version);
  if (!result.ok) return json({ errors: ["恢复时数据正好被修改了，请刷新后再试"] }, 409);
  return json({ ok: true, version: result.version });
}
