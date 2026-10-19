# AIction 文档

本目录包含项目的详细文档资源。

## 目录结构

```
docs/
├── README.md          # 本文档索引
├── WIKI.md            # 详细架构文档
├── ANALYTICS.md       # 数据埋点总览（长期维护，改埋点必须同步）
├── OPTIONS_UI.md      # 设置页 UI 设计规范（长期维护，改设置页 UI 必读）
├── PRIVACY_POLICY.md  # 隐私政策
└── images/            # 文档图片资源
```

## 文档说明

### [WIKI.md](./WIKI.md)

详细架构文档，包含：
- 项目架构概览
- 目录结构详解
- 核心模块分析
- 关键代码解读
- 技术亮点和设计模式
- 开发者指南
- 代码示例和流程图

### [ANALYTICS.md](./ANALYTICS.md)

数据埋点（PostHog）长期维护文档，包含：
- 采集机制（SDK / background HTTP 两条通道、匿名 ID、遥测开关、隐私边界）
- 现存事件清单（事件名 / 属性 / 触发位置 / 用途）
- 属性规范（禁用自由文本、命名约定）
- 建议新增埋点（P0–P3，含激活漏斗与用户自定义 Actions）
- 埋点维护流程与变更记录

**新增 / 修改埋点后必须同步更新此文档。**

### [images/](./images/)

存放文档中使用的图片资源，包括：
- 架构图
- 流程图
- UI 截图（设置页改造前/后原型见 `images/options-ui/`）
- 组件示例

### [OPTIONS_UI.md](./OPTIONS_UI.md)

设置页 UI 设计规范（长期维护），包含：
- 现状问题清单（版面 / 层级 / 一致性 / 交互）
- 设计决策：蓝色唯一主色、全宽行式版面、**即时保存 vs 草稿保存的判定标准**、卡片级保存条、分区切换 + 滚动归零 + hash 深链
- 各分区规格（哪张卡有保存条、哪些操作即时生效）
- 组件层与 token 规划、实现细则（草稿钩子、与 `shared/ui` 的边界、埋点注意事项）
- 分阶段实施计划与「新增设置项检查清单」

**改动 `src/entrypoints/options/` 下任何 UI 之前必读。**

## 相关文档

项目根目录还有以下文档：
- [README.md](../README.md) — 项目介绍（英文）
- [README.zh-CN.md](../README.zh-CN.md) — 项目介绍（中文）
- [CLAUDE.md](../CLAUDE.md) — Claude 开发指南
- [AGENTS.md](../AGENTS.md) — 项目代理说明