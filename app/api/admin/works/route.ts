// 后台：读取 / 保存作品数据（分类、作品组、精选）。
import type { WorksConfig } from "../../../_portfolio/catalog";
import { validateWorks } from "../../../_portfolio/works-validate";
import { loadWorks, saveWorks } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";
import { builtinInfo, rawClips, readJson } from "../_shared";

export async function GET(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const { config, version } = await loadWorks();
  return json({ config, version, builtin: builtinInfo(), clips: rawClips(config), user: who });
}

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const body = await readJson<{ config: WorksConfig; base: string }>(request);
  if (!body?.config) return json({ errors: ["数据格式不对"] }, 400);
  const errors = validateWorks(body.config as never, new Set(Object.keys(builtinInfo())));
  if (errors.length) return json({ errors }, 400);
  const result = await saveWorks(body.config, body.base);
  if (!result.ok) return json({ errors: ["作品数据在你打开这个页面之后已经被修改过（可能是另一个标签页、另一台设备或转码完成）。为了不覆盖那些修改，这次没有保存。请点「放弃修改」重新载入最新内容后再改。"] }, 409);
  return json({ ok: true, version: result.version, backup: "已自动备份" });
}
