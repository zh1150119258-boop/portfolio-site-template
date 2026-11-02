import vinext from "vinext";
import { defineConfig } from "vite";

// 本地预览（pnpm dev）用的 Cloudflare 环境：MEDIA_BUCKET 是本机模拟的存储桶（数据在 .wrangler/state，不连线上 R2）。
const localBindingConfig = {
  name: "portfolio-site-local",
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  r2_buckets: [{ binding: "MEDIA_BUCKET", bucket_name: "portfolio-media-local" }],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    plugins: [
      vinext(),
      cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }, config: localBindingConfig }),
    ],
  };
});
