# AIction 文档

本目录包含项目的详细文档资源。

## 目录结构

```
docs/
├── README.md          # 本文档索引
├── WIKI.md            # 详细架构文档
├── ANALYTICS.md       # 数据埋点总览（长期维护，改埋点必须同步）
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
- UI 截图
- 组件示例

## 相关文档

项目根目录还有以下文档：
- [README.md](../README.md) — 项目介绍（英文）
- [README.zh-CN.md](../README.zh-CN.md) — 项目介绍（中文）
- [CLAUDE.md](../CLAUDE.md) — Claude 开发指南
- [AGENTS.md](../AGENTS.md) — 项目代理说明