# Aiction

> **[English](./README.md)** | 中文

轻量级 Chrome 扩展（MV3），为网页选中内容提供 AI 辅助。

在任意页面选择文本，通过内联工具栏触发 AI 动作，并在浮动聊天面板中继续对话。支持任何 OpenAI 兼容的 `/chat/completions` 端点。

## 功能特性

- **内联 AI 工具栏** — 选择文本后立即通过环形展开菜单或胶囊工具栏触发 AI 动作
- **浮动聊天面板** — 在可拖拽、可调整大小的面板中继续对话，支持流式响应
- **自定义动作** — 创建自己的提示词模板，使用 `{text}` 占位符
- **多模型支持** — 连接 OpenAI、DeepSeek 或任何 OpenAI 兼容的 API
- **思维过程展示** — 查看模型思考过程（支持 DeepSeek 等模型的 `reasoning_content`）
- **深色模式** — 自动/浅色/深色主题，遵循 Apple 设计规范的设计令牌
- **备份与恢复** — 以 JSON 格式导入/导出配置

## 截图

### 动作按钮演示

![动作按钮演示](./docs/images/动作按钮演示.gif)

## 安装

### 从源码安装（开发模式）

```bash
# 克隆仓库
git clone <repo-url>
cd aiction

# 安装依赖
npm install

# 启动开发构建（监听文件变化）
npm run dev

# 构建生产版本
npm run build
```

### 加载未打包扩展

1. 运行 `npm run build`
2. 打开 `chrome://extensions`
3. 开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择 `build/chrome-mv3-prod` 目录

## 快速上手

1. **配置 API** — 右键点击扩展图标 → 选项，或从 `chrome://extensions` 打开选项页
2. **添加模型服务** — 输入 API Base URL、API Key 和模型名称
3. **测试连接** — 点击"测试连接"验证配置是否正确
4. **选择文本** — 在网页上高亮选中文本
5. **触发 AI** — 点击出现的工具栏按钮，选择一个动作
6. **开始对话** — 在浮动面板中继续交流

## 配置

### 模型服务

| 字段 | 说明 | 示例 |
|------|------|------|
| API Base URL | OpenAI 兼容端点 | `https://api.openai.com/v1` |
| API Key | API 密钥 | `sk-...` |
| Model | 模型标识符 | `gpt-4o-mini` |

### 模型参数

| 参数 | 默认值 | 范围 |
|------|--------|------|
| Max Tokens | 1024 | 1 - 32768 |
| Temperature | 0.3 | 0 - 2 |
| Top P | 0.9 | 0 - 1 |
| Presence Penalty | 0 | -2 - 2 |
| Frequency Penalty | 0 | -2 - 2 |

### 自定义动作

在选项页创建自定义提示词模板，使用 `{text}` 作为选中文本的占位符。

**内置动作：**

| 动作 | 模板 |
|------|------|
| 解释 | `帮我解释选中内容「{text}」` |
| 翻译 | `请将以下内容翻译为简体中文：\n{text}` |

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                  Chrome 扩展 (MV3)                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 内容脚本      │  │ 后台服务      │  │ 选项页        │  │
│  │ Content      │  │ Background   │  │ Options      │  │
│  │ Script       │  │ Service      │  │ Page         │  │
│  │              │  │ Worker       │  │              │  │
│  │ • 文本选择    │  │ • AI API     │  │ • 设置        │  │
│  │ • 工具栏      │  │ • 流式传输    │  │ • 模型        │  │
│  │ • 聊天面板    │  │ • 存储        │  │ • 动作        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                 │                             │
│         └──── chrome.runtime.onMessage ────┘            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              共享模块 (src/shared)                │    │
│  │  types • storage • messaging • prompt • tokens  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 技术栈

- **构建工具**：[WXT](https://wxt.dev/)
- **UI**：React 18 + TypeScript
- **Manifest**：Chrome Manifest V3
- **设计系统**：遵循 Apple HIG 的自定义设计令牌

### 目录结构

```
aiction/
├── background.ts          # 后台入口（薄包装层）
├── options.tsx            # 选项页入口（薄包装层）
├── popup.tsx              # 浏览器动作弹窗
├── contents/
│   └── main.tsx           # 内容脚本入口（WXT defineContentScript）
├── src/
│   ├── background/        # 后台服务工作线程逻辑
│   ├── contents/          # 内容脚本 UI
│   │   ├── components/    # React 组件
│   │   ├── hooks/         # 自定义 React Hooks
│   │   └── utils/         # DOM 工具函数
│   ├── options/           # 选项页组件
│   └── shared/            # 共享模块
│       ├── types.ts       # TypeScript 类型定义
│       ├── storage.ts     # Chrome 存储封装
│       ├── messaging.ts   # 消息传递 (streamChat)
│       ├── prompt.ts      # 提示词构建
│       └── ui/            # 设计令牌与主题
├── WIKI.md                # 详细架构文档
└── package.json
```

## 开发

### 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发构建，监听文件变化 |
| `npm run build` | 生产扩展构建 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run package` | 打包扩展 |

### 路径别名

TypeScript 路径别名：`~/*` 映射到 `src/*`

```typescript
import { useUiTheme } from "~/shared/ui/theme"
```

### 修改后操作步骤

1. 运行 `npm run build`
2. 打开 `chrome://extensions`
3. 点击扩展的刷新按钮
4. **刷新目标网页**（已打开的标签页保留旧的内容脚本实例）


## 贡献

1. Fork 本仓库
2. 创建功能分支
3. 进行修改
4. 运行 `npm run typecheck` 和 `npm run build`
5. 在 Chrome 中测试
6. 提交 Pull Request
