---
name: cloudflare-portfolio-site
description: 用 Cloudflare Worker + R2 + GitHub Actions 搭建或维护以视频/图片为主的作品集网站（第一次设置、部署、后台上传转码、视频大小控制、改设计、SEO、提速、重建）时使用。
---

# Cloudflare + R2 作品集网站：搭建与维护流程

这份流程配合本仓库的代码使用。有疑问时先读对应代码，照着现有做法改，不要另起一套。

## 0. 工作方式（必须遵守）

- 用中文沟通，界面文字也以中文为主。网站主人多半不懂技术：需要他本人操作时，一步一步说清在哪个网站、点哪个按钮、看到什么算成功。
- **绝不把密钥、密码、令牌写进代码、文档、聊天或提交记录。** 只写名称；值存在 GitHub Secrets 或 Cloudflare 后台。需要主人生成令牌时，让他自己粘贴进 GitHub / Cloudflare，不要让他发给你。
- 部署上线、删除 R2 文件、改 DNS 等不可撤销的操作，先问主人同意。
- 改代码走分支 + PR；主人同意后再合并；合并后手动触发部署（deploy 工作流只能手动运行）。
- 动手前先查清已有成果和未提交改动，保留可回滚版本（Cloudflare Worker 每次部署都有版本可回滚；后台数据每次保存都有备份）。
- **不虚构作品信息、履历或数据。** 主人没提供的内容就留空或问他。
- 长期有用的事实（域名、存储桶名、做过的决定）记到项目记忆或 `docs/` 里。

## 1. 架构

```
访客 → 自己的域名 → Cloudflare Worker（网页、封面、页面缓存、统一域名）
     → media.<域名> → R2 存储桶（视频直读，不经 Worker）
后台 /admin → 浏览器分块上传原片到 R2 → 触发 GitHub Actions 用 FFmpeg 转码 → 传回 R2 → 回调网站「已就绪」→ 邮件提醒
```

| 部分 | 选型 | 代码位置 |
|---|---|---|
| 网站 | vinext（Cloudflare 的 Next.js 兼容框架）+ React，部署为一个 Worker | `app/`、`worker/index.ts` |
| 基本信息 | 名字、域名、媒体域名、管理员邮箱 | `site.config.ts` |
| 媒体 | R2 + 自定义域名公开访问；视频不打包进 Worker | `app/_portfolio/media.ts` |
| 数据 | 分类/作品/设置/关于页存成 R2 里的 JSON（`admin/*.json`），后台改完 1 分钟内生效，不用重新部署；每次保存留备份 | `app/_portfolio/*-store.ts` |
| 转码 | GitHub Actions + FFmpeg（私有仓库每月 2000 分钟免费） | `.github/workflows/process-media.yml`、`scripts/ci-process-group.sh` |
| 部署 | GitHub Actions 手动触发 `wrangler deploy`（避免在本机登录 Cloudflare 命令行，代理软件常导致失败） | `.github/workflows/deploy.yml`、`wrangler.deploy.jsonc` |
| 后台 | 单页后台；登录用邮箱验证码（Cloudflare 邮件路由发到固定邮箱）+ 备用密码；登录凭证用服务器密钥签名 | `public/admin/index.html`、`app/api/admin/` |
| 页面缓存 | 边缘缓存 1 天、超过 60 秒后台重新生成（先快后新），按部署版本区分 | `worker/index.ts` |
| 访问统计 | 网站自己的计数（Analytics Engine）+ 后台看板 | `worker/hits.ts`、`app/api/admin/stats` |

## 2. 第一次设置清单

### 代码里要改的（没有密钥）
1. `site.config.ts`：网址、媒体网址、名字、身份、描述、管理员邮箱、上线日期。
2. `wrangler.deploy.jsonc`：Worker 名、`GITHUB_REPO`、`send_email` 的邮箱、R2 存储桶名、域名路由。
3. 本地 `pnpm install && pnpm dev` 预览，桌面和手机尺寸都截图给主人看。

### Cloudflare（主人本人操作，你一步步带）
1. 注册 Cloudflare，把域名接入（改域名服务器）。
2. R2：开通（需要绑卡，有免费额度），建存储桶，在存储桶「设置 → 自定义域」绑定 `media.<域名>`；再建 R2 API 令牌（对象读写，只限这个存储桶），记下 Access Key ID、Secret、端点地址。
3. 电子邮件路由（Email Routing）：开启，并把管理员邮箱加为「目标地址」完成验证。
4. Analytics Engine：在 Workers 里开通（免费额度够用）。
5. Images → 转换（Transformations）：为域名开启（免费 5000 次/月，超额只停不收费）。
6. 缓存 → Crawler Hints：开启（可选）。
7. 建 API 令牌：模板「编辑 Cloudflare Workers」，用于部署。另建一个只读令牌（Account Analytics 读取）用于后台访问统计（可选）。
8. 记下 Cloudflare 账号 ID（首页右侧，不是密钥）。

### GitHub（仓库 → Settings → Secrets and variables → Actions）

**Secrets（保密）**

| 名称 | 用途 |
|---|---|
| CLOUDFLARE_API_TOKEN | 部署 |
| R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_ENDPOINT、R2_BUCKET | 转码时读写 R2（R2_ENDPOINT 形如 `https://<账号ID>.r2.cloudflarestorage.com`） |
| MEDIA_CALLBACK_SECRET | 转码完成回调校验（随机长字符串，可以让主人用密码管理器生成） |
| WORKER_GITHUB_TOKEN | 网站触发转码（Fine-grained token：只选本仓库，权限只给 Actions 读写） |
| ADMIN_PASSWORD | 后台备用密码，同时是签名密钥（至少 16 位随机） |
| CF_ANALYTICS_TOKEN | 读访问统计（可选） |

**Variables（不保密）**

| 名称 | 例子 |
|---|---|
| CLOUDFLARE_ACCOUNT_ID | Cloudflare 账号 ID |
| SITE_URL | `https://example.com`（Lighthouse 自动打分用，可选） |

部署工作流在 `wrangler deploy` 之后用 `wrangler secret bulk` 把后台需要的密钥写进 Worker（写临时文件、用完删除、日志只打印名称）。

### 第一次上线验收
跑 `deploy` → 打开首页、`/work`、`/about`、`/contact`、`/sitemap.xml`、`/robots.txt` → `/admin` 用邮箱验证码登录 → 上传一条测试短片，看 GitHub Actions 转码完成、收到邮件、作品出现 → 后台填关于页、联系方式、分享卡片。

## 3. 视频版本与播放规则

### 每条视频四个版本（`scripts/ci-process-group.sh`）

| 版本 | R2 路径 | 规格 | 用途 |
|---|---|---|---|
| 封面 | `posters/<文件夹>/clip-NN.jpg` | 长边 1080，取第 1 秒（短片取 10% 处） | 列表、详情首屏、加载失败兜底 |
| 预览 | `previews/<文件夹>/clip-NN.mp4` | 长边 540，约 700k，无声 | 列表里悬停 / 滑到中间时静音循环 |
| 流畅 | `streams-balanced/<文件夹>/clip-NN.mp4` | 长边 1440，H.264 CRF 20，maxrate 5.5M，AAC 128k | **默认完整播放** |
| 原画 | `<文件夹>/clip-NN.mp4` | H.264/HEVC 原样封装，其他格式转高质量 H.264 | **用户点「原画」才切换** |

可选升级：如果原片很大（例如 4K 高码率），可以加一档「高清」（长边 2160，CRF 18，maxrate 16M）代替原画作为点击切换的版本，原画只私下保存、不上网页。

### 原则
- 全部 H.264 + `yuv420p` + `+faststart`；只缩小不放大，保持横竖画幅。
- R2 路径固定；文件内容变了就换新文件夹（例如新的作品组），不在原地覆盖。
- 每个对象带正确的 `Content-Type` 和 `public, max-age=31536000, immutable`；网页和接口不用长期缓存。
- 用 R2 自定义域名，不用 `r2.dev`；不要压缩或整体缓冲视频，否则拖动进度条（Range）失效。
- HDR/广色域、隔行扫描的原片先告诉主人，不要默默转换。

### 网页上的加载策略（`app/_site/preview-card.tsx`、`film-player.tsx`）
- 打开页面只加载封面；预览视频接近可视区或鼠标悬停才加载，离开就卸载。
- 播放页先显示封面，点播放才加载流畅版；切换画质保留进度；原画失败退回流畅版；流畅也失败就回到封面并提示。
- 打开页面时绝不请求原画。
- 还没绑定媒体子域时，可以临时把 `site.config.ts` 的 `mediaUrl` 设成 `"/media"`，视频经 Worker 读 R2（支持拖动），绑定后改回来。

### 验证（用实测，不靠猜）
- 桌面和手机分开测：首次无缓存、再次打开、预览进出可视区、流畅播放和拖动、点原画、失败回退。
- 检查 Range（206）、Content-Type、`CF-Cache-Status`。
- 国内访问：Cloudflare 免费版不能保证三大运营商线路；在移动/联通/电信、微信内置浏览器、iPhone Safari、安卓分别实测。

## 4. 改设计（视觉和交互）

模板自带的是中性简洁的版式，主人多半会想要自己的风格：
1. 先问主人喜欢的参考网站或截图，以及想要的感觉（极简、杂志感、暗色、大图……）。
2. 只换视觉和交互，不改数据结构和后台接口：页面在 `app/(site)/`，组件在 `app/_site/`，样式在 `app/globals.css`。
3. 有参考站时：桌面（1440×900）和手机（390×844）截图对比、点过每个状态（加载、悬停、播放、返回、深色模式），说明差异再修。参考站的素材和文字不能直接上线（版权），只参考版式和交互，内容全部用主人自己的。
4. 每改完一页本地预览截图给主人确认，再继续下一页；全部确认后再部署。
5. 视觉和播放性能一起考虑：大的开场动画、首屏多个视频都会拖慢手机速度。

## 5. SEO

已内置（`app/_site/seo.ts`、`app/sitemap.ts`、`app/robots.ts`）：
- 每页独立 canonical（不要全站指向首页）、描述、分享图（后台「网站设置 → 分享卡片」）。
- 动态网站地图，含视频信息；视频详情页带 VideoObject 结构化数据。
- **uploadDate 必须是带时区的完整时间**（例如 `2026-10-23T00:00:00+08:00`），只写日期或不带时区，Search Console 会报「无效」。后台上传 / 定时发布的作品用真实公开时间；没有记录的用 `site.config.ts` 的 `launchDate`。作品年份单独作为 dateCreated。
- 上线后：Google Search Console 用「网域」方式验证（DNS 里的 Google 验证记录不要删），提交 `/sitemap.xml`；Bing 可以从 Search Console 导入。约两周后看收录。

## 6. 日常维护

- 内容（上传、说明、封面、分类、精选、隐藏/定时发布、私密预览链接、关于页、网站设置）：都在 `/admin` 后台完成，不用部署。
- 代码改动：分支 → PR → 主人同意 → 合并 → 手动跑 `deploy` → 看 lighthouse 结果。
- 出问题：Cloudflare → Workers → 你的 Worker → Deployments 回滚；后台数据用「历史版本」恢复。
- 清理 R2 旧文件：后台「空间与清理」只列出确定没用到的文件，删除前列清单给主人确认。
- 定期看 Search Console 收录和后台访问统计。

## 7. 重建 / 搬家

R2 数据（视频 + `admin/` 下的 JSON）要整体迁移；所有 Secrets 重新填；账号 ID、存储桶名、域名变了要同步改 `site.config.ts` 和 `wrangler.deploy.jsonc`；Search Console 的 DNS 验证记录重新做。
