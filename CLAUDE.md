# CLAUDE.md

本项目的开发规范**只有一份、且只维护在 [`AGENTS.md`](./AGENTS.md)**。
本文件不含任何规范内容，仅作指针——避免重演「两份指南互相矛盾、其中一份悄悄过期」。

@AGENTS.md

要点速记（细节与例外一律以 AGENTS.md 为准）：

- 改代码后必须跑 `npm run typecheck` 和 `npm run build`。
- 改设置页 UI 前读 `docs/OPTIONS_UI.md`；改埋点必须同步 `docs/ANALYTICS.md`。
- 上架素材 / 设计类工具见 `docs/TOOLING.md`，**不要在 `scripts/` 下重复造轮子**（含已知坑位清单）。
- AI 请求只在 background 发起，content script 只能发消息。
