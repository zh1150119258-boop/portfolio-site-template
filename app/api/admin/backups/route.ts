// 后台：历史版本列表。
import { listBackups } from "../../../_portfolio/works-store";
import { json, requireAdmin } from "../_auth";

export async function GET(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  return json({ backups: await listBackups() });
}
