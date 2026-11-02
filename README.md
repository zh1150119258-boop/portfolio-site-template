# 作品集网站模板

> **English:** A Claude Code–guided starter for video-first portfolio sites on Cloudflare Workers + R2: online admin (`/admin`) with chunked uploads, automatic FFmpeg transcoding via GitHub Actions (poster / preview / 1440p stream / original), playback rules tuned for mobile, edge page caching, SEO (sitemap with video entries, VideoObject), and a reference-site cloning toolkit (tech fingerprint, interaction capture, pixel diff). The page design is intentionally a neutral placeholder: Claude interviews the site owner first and designs the pages to their taste. Docs are in Chinese; open the repo in Claude Code and ask in any language. MIT licensed.

一套做个人作品集网站的「底座」（特别适合视频、剪辑、影像作品），由 Claude 带你一步步搭好。

**网站长什么样由你决定。** Claude 会先问你的想法和喜欢的风格，再为你设计页面；仓库里自带的页面只是能打开的占位版式。

**你会得到：**
- 一个有自己域名、按你的想法设计的网站：电脑和手机都能看。
- 一个在线后台（你的域名/admin）：上传视频后自动生成封面、预览和不同清晰度；改分类、写项目说明、换封面、隐藏 / 定时发布、生成私密预览链接、改关于页和联系方式、看访问统计。改完 1 分钟内生效，不用找人改代码。
- 视频播放体验：列表里只显示封面和几百 KB 的小预览，点开才播放流畅版，想看清楚可以切「原画」，手机流量友好。
- 搜索引擎友好：自动生成网站地图、视频信息，方便被 Google / Bing 收录。
- 参考网站复刻工具：看中哪个网站的版式和动效，把网址发给 Claude，它会先录下那个网站的样子和交互，再照着做，最后和原网站逐像素对比。内容还是你自己的（别人网站的文字、图片、视频不能直接用）。

费用：Cloudflare 和 GitHub 的免费额度一般够个人作品集使用。需要自己买一个域名（几十元一年起），开通 Cloudflare R2 需要绑一张卡（有免费额度）。

---

## 朋友怎么用（不需要懂技术）

### 准备
1. 一个 GitHub 账号（免费）：https://github.com/signup
2. 一个 Claude 账号，能使用 Claude Code（网页版 https://claude.ai/code 即可）。
3. 想好：网站上显示的名字、一句话介绍、用来登录后台的邮箱。域名可以先不买，Claude 会告诉你什么时候需要。

### 第一步：复制一份到你自己的 GitHub
- 如果这个仓库是公开的，或者你已被加为协作者：打开仓库页面，点右上角绿色的 **「Use this template」→「Create a new repository」**（没有这个按钮就点 **Fork**）。
- 仓库名随便起（例如 `my-portfolio`），建议选 **Private（私有）**，然后点 **Create repository**。

### 第二步：在 Claude 里打开你的仓库
1. 打开 https://claude.ai/code ，按提示连接 GitHub，选中你刚才建的仓库。
2. 对 Claude 说：

   > 我想用这个模板做我的个人作品集网站，请按 CLAUDE.md 一步一步带我设置。我不懂技术，请用中文、告诉我每一步点哪里。

3. Claude 会先问你想做什么样的网站、喜欢什么风格（有参考网站最好），整理成方案给你确认；然后按方案设计页面给你看效果，再带你去 Cloudflare 和 GitHub 网站点几个按钮上线。

### 第三步：上线以后
- 打开 `你的域名/admin`，用邮箱验证码登录，就能上传作品、写介绍了。
- 想改样式、加功能，就回到 Claude 里直接说，比如「首页想要更大的图」「加一个摄影分类」「照着这个网站的首页效果做：网址」。

### 注意
- 密码、令牌（token）这类东西，只粘贴到 GitHub 或 Cloudflare 的设置页面里，**不要发在聊天里**。Claude 也不会找你要。
- 网站上的介绍、履历、作品说明都由你自己填，模板里的文字只是占位。

---

开源协议：MIT（见 [LICENSE](LICENSE)），欢迎复制、修改、分享。复刻工具改编自 MIT 协议的项目，版权声明见 `tools/clone/LICENSE`。

技术说明（给 Claude 和开发者）：见 [CLAUDE.md](CLAUDE.md) 和 [.claude/skills/cloudflare-portfolio-site/SKILL.md](.claude/skills/cloudflare-portfolio-site/SKILL.md)。
