# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (MV3) built with **Plasmo + React + TypeScript**. Users select text on any page, trigger AI actions from an inline toolbar, and chat in a floating panel. Uses an OpenAI-compatible `/chat/completions` endpoint.

## Commands

- `npm run dev` — Plasmo dev build with watch
- `npm run build` — Production extension build (run after code changes)
- `npm run typecheck` — TypeScript type-check only, no emit
- `npm run package` — Package the extension bundle
- No lint or test setup exists. Use `npm run typecheck` and `npm run build` for verification.
- Build may warn about missing `svgo` for `htmlnano minifySvg`; builds still succeed.

## Architecture

Three runtime contexts communicate via `chrome.runtime.onMessage` (one-shot) and `chrome.runtime.connect` Ports (streaming):

1. **Content script** (`contents/aiction.ts` → `src/contents/main.tsx`) — Plasmo content entry is an empty module; the actual UI is a default-exported React component. Detects selection, renders `SelectionToolbar` and `UnifiedPanel`, stores per-page conversation state in memory.
2. **Background service worker** (`background.ts` → `src/background/index.ts`) — Handles all remote AI calls. Reads settings from `chrome.storage.sync`. Never move API requests into the content script.
3. **Options page** (`options.tsx` → `src/options/index.tsx`) — Edits and persists API config, translation language, and custom actions.
4. **Popup** (`popup.tsx`) — Browser action popup for quick service switching and settings link. Direct React component, no thin wrapper.

**Shared logic** (`src/shared/`):
- `types.ts` — Message, settings, and domain types
- `selection.ts` — Selection snapshot extraction and anchor calculation
- `prompt.ts` — Prompt assembly with page context
- `messaging.ts` — Content-to-background request wrapper (`askAi`); uses `chrome.runtime.connect` Ports for streaming
- `storage.ts` — `chrome.storage.sync` settings persistence
- `constants.ts` — Default values and constants
- `defaults.ts` — Default settings and action presets
- `errors.ts` — Error types and handling
- `analytics.ts` — PostHog telemetry (anonymous ID in `chrome.storage.local`)

**Design tokens** (`src/shared/ui/`):
- `tokens.ts` — Theme colors, typography (SF Pro / system fonts), spacing, shadows, motion (Apple HIG-inspired)
- `theme.ts` — `useUiTheme` hook for light/dark mode
- `styles.ts` — Reusable inline style factories (no CSS files; all styling is CSS-in-JS)
- `icons.tsx` — `BrandIcon` SVG component
- `avatar.ts` — Color-hash avatar palette and display text

## Path Alias

`~*` maps to `./src/*` (configured in `tsconfig.json` `paths`).

## Key Invariants

- Keep `data-aiction-root="true"` on the extension UI root — selection/mousedown handlers depend on ignoring events inside that subtree.
- Keep the background message listener registered at module load time.
- Keep AI requests in the background context; content script should only message background.
- Conversation is intentionally per-page in-memory only; refresh clears it.
- Preserve `{text}` placeholder validation for custom actions before saving.

## Shadow DOM & Selection Pitfalls

- Content script UI runs inside Shadow DOM. Do not rely on `document.activeElement` alone — use deep active-element traversal through nested `shadowRoot` boundaries.
- Use `event.composedPath()` instead of `event.target` for extension UI event filtering so Shadow DOM retargeting doesn't bypass root checks.
- Text selection inside toolbar/chat inputs must never update page selection context or toolbar visibility.
- Don't let transient page-selection loss during focus transfer into extension inputs hide the toolbar. Preserve toolbar state during extension-internal interaction.

## Manual Verification

- After `npm run build`, load `build/chrome-mv3-prod` in `chrome://extensions` as unpacked.
- After reloading the extension, also reload the target web page (existing tabs keep old content-script instances).
- If a content-script change doesn't appear after extension + page reload, close and reopen the tab.
- For background changes, verify from the extension's service worker inspector.

## Design System

See `docs/DESIGN.md` (UI/UX spec) and `docs/WIKI.md` (detailed architecture walkthrough) for design standards and conventions.

## UI 模块命名

沟通中使用以下名称指代各 UI 模块（详见 `DESIGN.MD`）：

| 昵称 | 组件 | 解释 |
|------|------|------|
| 触发按钮 | `SelectionToolbar` 核心 | 选中文本后出现的圆形渐变按钮，带发光脉冲 |
| 环形菜单 | `SelectionToolbar` 展开态 | 悬停触发按钮后展开的环形动作列表 |
| 对话窗 | `UnifiedPanel` | 模态浮层聊天窗口，含遮罩 |
| 遮罩层 | `UnifiedPanel` 外层 | 半透明黑色背景遮罩 |
| 选区编辑区 | `UnifiedPanel` 顶部 | 已捕获选中文本的可编辑区域 |
| 消息流 | `UnifiedPanel` 中部 | 消息气泡滚动区域 |
| 思考块 | `UnifiedPanel` 消息内 | AI 推理过程的折叠展示 |
| 输入栏 | `UnifiedPanel` 底部 | 文本输入 + 发送/停止按钮 |
| 设置台 | `OptionsPage` | Chrome 选项页 |
| 主题卡 | `OptionsPage` 子区 | Auto/Light/Dark 切换 |
| 连接卡 | `OptionsPage` 子区 | API 配置 + 测试连接 + 获取模型 |
| 动作卡 | `OptionsPage` 子区 | 自定义动作模板管理 |

## Development Approach

- For product- or architecture-shaping work, ask clarifying questions before editing.
- Prefer structural fixes at the state/source-of-truth layer over incremental condition patches.
- When debugging content-script bugs, reload the extension and refresh the target tab before assuming logic is wrong.

## Icon Generation

Plasmo reads `assets/icon.png` and auto-generates 16/32/48/64/128px icons (source PNG must be ≥256px). Three files define the icon — keep them in sync:

| File | Role |
|------|------|
| `favicon.svg` | SVG source of truth (use `clipPath` for transparent rounded corners) |
| `src/shared/ui/icons.tsx` | `BrandIcon` React component (inline SVG, mirrors `favicon.svg`) |
| `assets/icon.png` | High-res PNG rendered from SVG (256×256, sharp + lanczos3) |

To update: edit `favicon.svg` → mirror in `icons.tsx` → render PNG via sharp at 256×256 → `npm run build`. Always render from SVG (not `qlmanage`), use `density: 600` for crisp edges.
