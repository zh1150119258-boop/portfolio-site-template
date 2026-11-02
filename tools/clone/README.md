# 复刻工具

参考网站复刻用的检测 / 录制 / 对比脚本，用法见 `.claude/skills/clone-website/SKILL.md`。

- `technology-fingerprint.mjs`：检测参考站技术栈
- `interaction-capture.mjs`：按计划在多个时间点截取交互过程
- `fidelity-compare.mjs`：参考站与本地页面同步操作、逐像素和元素对比
- `visual-diff.mjs`：两张截图生成差异图
- `examples/`：计划和对比清单的写法；`fixtures/`：自带的测试页面（`pnpm clone:capture tools/clone/examples/interaction.plan.json` 可以直接试跑）

来源：改编自 MIT 协议的网站复刻工作台（原始版权声明见 `LICENSE`）。
