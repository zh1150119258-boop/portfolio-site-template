// 作品数据校验：本地管理页和线上后台共用。
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Json = Record<string, unknown>;
type Entry = { group?: string; slug?: string; name?: string; children?: Entry[] };
type Config = { featured: string[]; groups: Record<string, Json>; tree: { name: string; children: Entry[] } };

/** 检查配置：分类网址名合法且同级不重复、每个作品组只出现一次、引用的作品组都存在、精选都在分类里。 */
export function validateWorks(config: Config, builtin: Set<string>): string[] {
  const errors: string[] = [];
  const used = new Set<string>();
  const walk = (entries: Entry[], where: string) => {
    const slugs = new Set<string>();
    entries.forEach((entry) => {
      if (entry.group) {
        if (!builtin.has(entry.group) && !config.groups[entry.group]) errors.push(`${where}：找不到作品组「${entry.group}」`);
        if (used.has(entry.group)) errors.push(`作品组「${entry.group}」被放进了两个地方`);
        if (slugs.has(entry.group)) errors.push(`${where}：网址名「${entry.group}」重复`);
        used.add(entry.group);
        slugs.add(entry.group);
        return;
      }
      const label = entry.name || "(未命名)";
      if (!entry.name?.trim()) errors.push(`${where}：有分类没有名称`);
      if (!entry.slug || !SLUG.test(entry.slug)) errors.push(`${where} / ${label}：网址名只能用小写字母、数字和连字符`);
      else if (slugs.has(entry.slug)) errors.push(`${where}：网址名「${entry.slug}」重复`);
      if (entry.slug) slugs.add(entry.slug);
      if (entry.children) walk(entry.children, `${where} / ${label}`);
    });
  };
  walk(config.tree.children, "作品");
  Object.entries(config.groups).forEach(([id, def]) => {
    if (!SLUG.test(id)) errors.push(`作品组编号「${id}」只能用小写字母、数字和连字符`);
    if (def.kind === "archive" && !(Number(def.count) > 0)) errors.push(`作品组「${id}」的视频数量要大于 0`);
    if (def.kind === "social" && !(Array.isArray(def.files) && def.files.length)) errors.push(`作品组「${id}」至少要有一个文件名`);
  });
  config.featured.forEach((id) => { if (!used.has(id)) errors.push(`首页精选「${id}」不在任何分类里`); });
  return errors;
}
