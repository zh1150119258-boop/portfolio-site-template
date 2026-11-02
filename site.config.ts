// ============================================================
// 网站基本信息：新建网站时先改这一个文件（其余要改的地方见 CLAUDE.md「第一次设置」）。
// 这里只放可以公开的信息。密码、令牌、密钥一律不要写在这里。
// ============================================================

export const SITE = {
  /** 网站正式网址（不带结尾的 /），例如 https://example.com */
  url: "https://example.com",
  /** 视频所在的 R2 自定义域名（不带结尾的 /），例如 https://media.example.com */
  mediaUrl: "https://media.example.com",
  /** 网站名字 / 作者名字（页面标题、分享卡片、结构化数据都用它） */
  name: "你的名字",
  /** 外文名（可选，搜索引擎会把它当作别名） */
  alternateName: "Your Name",
  /** 一句话身份，例如「摄影 / 剪辑 / 影像创作」 */
  roles: "摄影 / 剪辑 / 影像创作",
  /** 所在城市（可选） */
  basedIn: "",
  /** 默认的网站描述（搜索结果、分享卡片），后台「网站设置 → 分享卡片」可以改 */
  description: "个人作品集：摄影、剪辑与影像创作。",
  /** 擅长方向（结构化数据用，可留空） */
  knowsAbout: ["摄影", "视频剪辑", "影像创作"],
  /** 网站正式上线日期（带时区）。没有单独发布时间记录的作品，用这一天作为视频的 uploadDate。 */
  launchDate: "2026-01-01T00:00:00+08:00",
  /** 时区偏移（小时），用于把发布时间写成带时区的完整时间。北京时间 = 8 */
  timezoneHours: 8,
};

/** 后台登录验证码、转码完成提醒发到的邮箱（必须先在 Cloudflare「电子邮件路由」里验证过，并与 wrangler.deploy.jsonc 的 destination_address 一致） */
export const ADMIN_EMAIL = "you@example.com";
/** 发件地址：用自己域名下的任意地址即可（需要开启 Cloudflare 电子邮件路由） */
export const MAIL_FROM = `admin@${new URL(SITE.url).hostname}`;
