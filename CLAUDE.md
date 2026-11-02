# 作品集网站模板：给 Claude 的工作说明

这是一个作品集网站的「底座」：跑在 Cloudflare Worker + R2 上，自带在线后台、视频自动转码、播放规则、部署和 SEO。
**网站长什么样不是模板定的。** 现在的页面只是能打开的占位版式，要按网站主人自己的想法重新设计。
网站主人通常不懂技术，你要用中文、一步一步带他完成。

**先读 `.claude/skills/cloudflare-portfolio-site/SKILL.md`**：完整的搭建、维护流程和必须遵守的规则（不写密钥、不可撤销的操作先问、不编造作品信息）。

## 接手时先判断进度

1. `site.config.ts` 里还是 `example.com` / `你的名字` → 还没设置，从「第一次设置」开始。
2. 已经改过但还没部署 → 继续 SKILL.md 第 2 节没完成的部分。
3. 已经上线 → 日常维护（大部分内容在 `/admin` 后台改，不用动代码）。

## 第一次设置（顺序）

1. **先聊想法，不急着动手。** 问主人：
   - 想做什么样的网站：作品集、个人主页、工作室官网……给谁看（客户、招聘方、粉丝）？
   - 主要放什么：视频、照片、设计稿、文字，还是混合？大概有多少作品、怎么分类？
   - 喜欢什么感觉：极简、杂志感、暗色、活泼……有没有喜欢的参考网站或截图？
   - 需要哪些页面：作品、关于、联系，还是还要别的（服务介绍、博客、简历下载……）？
   把答案整理成一页「网站方案」给主人确认，再开始做。
2. 再问基本信息：名字、域名（有没有买）、一句话身份、管理员邮箱、GitHub 用户名。改 `site.config.ts` 和 `wrangler.deploy.jsonc`（标了「改」的地方）。
3. 按方案设计页面（SKILL.md 第 4 节）：页面、组件、样式都可以整个换掉，分类层级、精选也可以按需要改。底座部分（后台接口、R2 数据、转码、播放规则、部署、SEO）尽量沿用，需要改时先读懂再改。主人只放照片的话，可以不用视频那部分，或按需要加图片相册。
   每做完一页，`pnpm dev` 本地预览，截图桌面和手机效果给主人确认。
4. 带主人完成 Cloudflare 和 GitHub 设置（SKILL.md 第 2 节），令牌由主人自己粘贴到 GitHub Secrets。
5. 主人同意后，让他在 GitHub「Actions → deploy → Run workflow」部署，按清单验收。

## 代码地图

| 想改什么 | 文件 |
|---|---|
| 名字、域名、描述、管理员邮箱 | `site.config.ts` |
| Cloudflare 资源名、域名路由 | `wrangler.deploy.jsonc` |
| 页面版式 | `app/(site)/*/page.tsx`、`app/_site/pages.tsx` |
| 样式、配色兜底 | `app/globals.css`、`app/_site/theme.ts` |
| 默认文字（占位） | `app/_site/content.ts` |
| 卡片预览、播放器 | `app/_site/preview-card.tsx`、`app/_site/film-player.tsx` |
| 作品数据结构 | `app/_portfolio/catalog.ts`、`content/works.json`（初始分类） |
| 后台页面 / 接口 | `public/admin/index.html`、`app/api/admin/` |
| 转码规格 | `scripts/ci-process-group.sh` |
| 域名统一、页面缓存、媒体读取 | `worker/index.ts` |
| SEO | `app/_site/seo.ts`、`app/sitemap.ts`、`app/robots.ts` |

## 本地预览小技巧

- `pnpm dev` 时后台 `/admin` 不需要登录，数据存在本机模拟的存储桶（`.wrangler/state`），不会碰线上。
- 本地没有 GitHub 转码，可以用 `scripts/ci-process-group.sh` 在本机转好，再通过 `/api/admin/dev-put` 写入模拟存储桶、用 `/api/media-callback`（本地口令 `local-dev-only`）标记完成。
- 改完跑 `pnpm typecheck`、`pnpm lint`、`pnpm build`。
