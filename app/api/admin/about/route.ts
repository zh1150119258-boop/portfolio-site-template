// 后台：读取 / 保存关于页内容（个人介绍、擅长方向、工作履历）。
import { defaultAbout, loadAbout, saveAbout, type AboutContent, type AboutLocale } from "../../../_portfolio/about-store";
import { json, requireAdmin } from "../_auth";
import { readJson } from "../_shared";

const cleanLocale = (value: Partial<AboutLocale> | undefined): AboutLocale | null => {
  if (!value) return null;
  const lines = (list: unknown) => (Array.isArray(list) ? list.map((item) => String(item).trim()).filter(Boolean) : []);
  return {
    statement: lines(value.statement).slice(0, 6),
    intro: String(value.intro ?? "").trim(),
    body: lines(value.body),
    focus: lines(value.focus),
    experience: (Array.isArray(value.experience) ? value.experience : [])
      .map((row) => [0, 1, 2].map((index) => String(row?.[index] ?? "").trim()) as [string, string, string])
      .filter((row) => row.some(Boolean)),
  };
};

export async function GET(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const { content, version } = await loadAbout();
  return json({ content, version, defaults: defaultAbout() });
}

export async function POST(request: Request) {
  const who = await requireAdmin(request);
  if (who instanceof Response) return who;
  const body = await readJson<{ content: AboutContent; base: string }>(request);
  const zh = cleanLocale(body?.content?.zh);
  if (!body || !zh || !zh.intro || !zh.statement.length) return json({ errors: ["中文的主张句和简介不能为空"] }, 400);
  const content: AboutContent = { zh };
  if (!(await saveAbout(content, body.base))) return json({ errors: ["关于页内容在别处被修改过，请刷新后台后再改。"] }, 409);
  return json({ ok: true, version: (await loadAbout()).version });
}
