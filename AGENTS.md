# AGENTS.md

## Project Summary
Chrome extension (MV3) built with WXT + React + TypeScript. Users select text on any page, trigger AI actions from an inline toolbar, and continue conversation in a floating chat panel. AI backend uses an OpenAI-compatible `/chat/completions` endpoint via Vercel AI SDK. Supports i18n (English/Chinese), multiple AI providers via models.dev integration, and includes a built-in PDF viewer.

## Quick Facts
- Build framework: WXT (v0.20.26)
- TypeScript path alias: `~/*` and `@/*` map to `src/*` (tsconfig `paths`).
- WXT modules: `@wxt-dev/auto-icons` (auto-generates extension icons from `src/assets/icon.png`).
- AI SDK: Vercel AI SDK (`ai` package) for streaming/text generation in background.
- i18n: English/Chinese support via `src/shared/i18n/`.
- Provider logos: loaded from `models.dev` via `src/shared/models-dev.ts`.

## Commands
- `npm run dev`: WXT dev build/watch (Chrome). Use `npm run dev:firefox` for Firefox.
- `npm run typecheck`: TypeScript only, no emit.
- `npm run build`: production extension build. Run this after code changes.
- `npm run zip`: zip the extension bundle.
- `npm run postinstall`: runs `wxt prepare` automatically after `npm install`.

## Workflow Rules
- **代码修改后必须验证**：每次修改代码后，必须主动运行 `npm run typecheck` 和 `npm run build`，确保类型正确且构建成功。不要等待用户手动执行。

## 开发经验教训

### 配置迁移与合并策略
**场景**：当向共享配置（如 `DEFAULT_SETTINGS`、`DEFAULT_QUICK_ACTIONS`）添加新项时，已有用户的配置不会自动更新。

**通用原则**：`normalizeSettings()` 必须合并默认值和已保存的值，而不仅仅是验证已保存的值。

**实现模式**：
```typescript
const items = (() => {
  const savedItems = Array.isArray(saved.items) ? validate(saved.items) : DEFAULT.items
  const savedIds = new Set(savedItems.map(i => i.id))
  const missingDefaults = DEFAULT.items.filter(i => !savedIds.has(i.id))
  return [...savedItems, ...missingDefaults]
})()
```

**检查清单**：
1. 更新类型定义（`types.ts`）
2. 更新默认配置（`defaults.ts`）
3. 更新验证逻辑（`storage.ts`）
4. **更新 `normalizeSettings()` 合并逻辑** ← 容易遗漏
5. 添加 i18n 翻译
6. 运行 `npm run typecheck` 和 `npm run build`

### 灵动岛重构调试经验

**JSX “幽灵报错”：少一个 `}` 的定位方法**
`style={{...}}>` 误写成 `}>`（丢一个 `}`）时，TS 报「JSX element 'div' has no corresponding closing tag」，但报错位置在 JSX 开头且报错行号下的代码看起来完全正常，肉眼数括号几乎无法定位。对象字面量未闭合会让解析器吞掉半个文件。

解法：用 TypeScript Compiler API 打印 parseDiagnostics + AST，检查关键属性的解析范围：
```js
const sf = ts.createSourceFile("x.tsx", src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)
console.log(sf.parseDiagnostics)
// 遍历 AST 看 JsxAttribute/JsxExpression 的 getStart/getEnd 是否异常拖长
```
教训：结构诡异的 JSX 语法报错，直接 dump parse tree 看节点的实际 span，比肉眼检查可靠。

**编译验证二分时，rg 过滤条件要匹配错误码而非文件名**
把待测文件复制到 `/tmp` 做二分时，用 `rg "DynamicIsland"` 过滤 tsc 输出会得到假阴性（/tmp 路径不含该词，错误被静默吞掉，误判为“编译通过”）。过滤应该用错误码（如 `rg "TS17008|TS2657"`）或不过滤。

**edit 工具的多段编辑是原子性的**
一次 edit 调用里多条 edits[]，任一 oldText 匹配失败会导致整个调用回滚。不要假设“前几条已生效”而基于错误状态继续编辑；多段编辑失败后必须重新读文件确认每段的实际状态。另外多段编辑容易连带丢失换行或改错相邻字符（本次 `}}>` 被误改就是多段编辑引入的）。

**useCallback/hook 间依赖注意声明顺序**
后声明的 `const collapse = useCallback(...)` 被先声明的 `scheduleCollapse` 依赖时，依赖数组里的 `collapse` 处于 TDZ，运行时 ReferenceError。被依赖的 callback 必须声明在前。

**组件拆分时 `<style>` 内的全局样式会丢**
原组件根部的 `<style>` 里定义的 `@keyframes`（如 `speech-wave`）在拆分成多个内容件后没有任何组件输出，CSS 动画静默失效（不报错、元素静止）。拆分时列出全局样式清单并指定归属；keyframes 在 shadow root 内全局生效，可提取共享常量在多个组件里重复输出（同名 keyframes 后者覆盖前者，内容相同时无害）。

**收起浮层时要处理残留焦点**
浮层（岛展开层）收起后 DOM 仍在（仅 opacity 0 + pointerEvents none），键盘焦点会残留在隐形输入框里，后续按键全部落入虚空。收起路径必须统一 blur 岛内焦点（容器用 `onFocusCapture` 记录焦点元素，collapse 时 blur）。

## Entry Points (WXT file-based routing)
- `src/entrypoints/background.ts`: Background Service Worker (uses `defineBackground()`).
- `src/entrypoints/content/index.tsx`: Content Script UI (uses `defineContentScript()` + `createShadowRootUi()`).
- `src/entrypoints/options/`: Options Page (HTML entry + React component). Main components:
  - `OptionsPage.tsx`: Main options page layout
  - `ProviderEditor.tsx`: AI provider configuration editor
  - `ProviderList.tsx`: List of configured providers
  - `ProviderSelectModal.tsx`: Modal for selecting providers
  - `ProviderLogo.tsx`: Provider logo display
  - `ModelPicker.tsx`: Model selection component
  - `ModelParamsEditor.tsx`: Model parameters editor
  - `ActionsSection.tsx`: Custom actions configuration
  - `AppearanceSection.tsx`: Theme and appearance settings
  - `BackupSection.tsx`: Settings export/import
  - `AboutSection.tsx`: About section
  - `ConfirmDialog.tsx`: Confirmation dialog
  - `useProviderManager.ts`: Provider management hook
- `src/entrypoints/popup/`: Browser Action Popup (HTML entry + React component).
- `src/entrypoints/pdf-viewer/`: PDF Viewer Page (HTML entry + React component).

## Architecture
Three runtime contexts communicate via `chrome.runtime.onMessage` and `chrome.runtime.connect`:

- **Content script** (`src/entrypoints/content/`): detects selection from range/input/textarea, computes toolbar anchor, renders `SelectionToolbar` and `ChatWindow` (draggable), stores per-page conversation state in React.
- **Background** (`src/entrypoints/background.ts`): registers the message handler, reads settings from `chrome.storage.sync`, calls the API via `streamText()` / `generateText()` from Vercel AI SDK, normalizes responses. Also handles PDF viewer context menu and models.dev data fetching. **Never move API requests into the content script.**
- **Options** (`src/entrypoints/options/`): edits API config, translation language, and custom actions, then validates and persists settings.

### Communication flow
- **Streaming (chat):** Content script opens a `chrome.runtime.connect` port (`AICTION_STREAM`). Background listens on `chrome.runtime.onConnect`, calls `streamText()` with streaming, and `port.postMessage`s events back.
- **Non-streaming (API test, fetch models):** Uses `chrome.runtime.sendMessage` and background responds via `sendResponse`.

Shared logic in `src/shared/*`: `types.ts`, `selection.ts`, `prompt.ts`, `messaging.ts`, `storage.ts`, `constants.ts`, `defaults.ts`, `errors.ts`, `analytics.ts`, `model-provider.ts`, `models-dev.ts`.

Shared UI in `src/shared/ui/`: `tokens.ts`, `styles.ts`, `theme.ts`, `icons.tsx`, `iconify.tsx`, `markdown.tsx`, `toggle-switch.tsx`, `avatar.ts`, `bundled-icons.ts`, `icon-library.ts`.

Content script hooks in `src/entrypoints/content/hooks/`: `useChatState.ts`, `useDraggable.ts`, `useSelectionDetection.ts`, `useToolbarState.ts`.

Content script components in `src/entrypoints/content/components/`: `SelectionToolbar.tsx`, `DynamicIsland.tsx` (通用灵动岛容器), `ChatIslandPanel.tsx` (聊天岛面板 + 胶囊状态), `SpeechPlayer.tsx` (TTS 内容件: `TtsPillContent` / `TtsControlBar` / `TtsMiniBar`), `ToolbarActionMenu.tsx`, `islandMetrics.ts` (共享尺寸常量).

Content script utilities in `src/entrypoints/content/utils/`: `domUtils.ts` (deep active element traversal, extension root checks, selection helpers).

### i18n System
- Translation files in `src/shared/i18n/` (English + Chinese).
- `I18nRoot` wraps the content script React tree; Options and Popup use `useI18n()` hook.
- All user-facing strings go through `t("key")` — never hardcode UI text.

### Models.dev Integration
- `src/shared/models-dev.ts` fetches provider metadata (name, logo, models) from `models.dev`.
- Background caches the data and serves it to Options/Popup via `AICTION_MODELS_DEV_REQUEST` message.
- Provider logos loaded dynamically: `https://models.dev/logos/{providerId}.svg`.
- Used in Options page provider selector and Popup provider dropdown.

### PDF Viewer
- `src/entrypoints/pdf-viewer/` — built-in PDF viewer page.
- Background registers a context menu "Open PDF with AIction" on PDF pages.
- Opens the PDF in a new tab with the extension's viewer, enabling text selection and AI actions on PDF content.

## Invariants
- Keep `data-aiction-root="true"` on the extension UI root. Selection and mousedown handlers depend on ignoring events inside that subtree.
- Keep the background message listener registered at module load time.
- Keep AI requests in the background context; content script should only message background.
- Preserve `{text}` placeholder validation for custom actions before saving.
- Conversation is intentionally per-page in-memory only; refresh/close clears it.

## Selection UI Pitfalls
- WXT content-script UI runs inside Shadow DOM. Do not rely on `document.activeElement` alone; use deep active-element traversal through nested `shadowRoot` boundaries.
- Use `event.composedPath()` instead of `event.target` for extension UI event filtering so Shadow DOM retargeting doesn't bypass root checks.
- Text selection inside toolbar/chat inputs must never update page selection context, toolbar anchor, or toolbar visibility.
- Do not let transient page-selection loss during focus transfer into extension inputs hide the toolbar. Preserve that state during extension-internal interaction.
- When debugging selection bugs, reload the extension and refresh the target tab before assuming logic is wrong. Stale injected code is a common cause.

## Dynamic Island (灵动岛)

聊天与朗读各自一个岛，顶部并排（仿 iOS 双岛）。跨岛状态机在 `useIslandCoordinator.ts`
（App 与 PdfViewer 共用），岛容器 `DynamicIsland.tsx` 是受控的「上报制」组件。

- **聊天岛常驻**：idle 态胶囊 = 笑脸动画 +「询问」（`ChatIdlePill` + `SmileyFace`），hover 直接展开聊天面板；对话进行中胶囊显示任务状态（`ChatPillContent`）
- **朗读岛按需出现**：朗读激活时挂载于右侧（`TtsCircleContent` / `TtsControlBar`）
- 形态固定（无主副互换）：聊天岛只在胶囊 `pill` ⇄ 展开 `expanded` 间切换；朗读岛只在圆球 `circle` ⇄ 展开 `expanded` 间切换。双岛时恒为「聊天胶囊（左） + 朗读圆球（右）」
- 布局：聊天岛锁定左缘（50% - anchor）、朗读岛锁定右缘（50% + anchor）；单岛与展开态回到页面正中。锚点由 `dualAnchorFor(chatPillWidth)` 随聊天胶囊宽度动态推导，使双岛间距恒为 `dualGap`（16px，idle/任务两态一致）；两岛必须传同一个 anchor（App 里算一次同时传两岛）。全岛统一基础高度 32（圆球直径 = 胶囊高度，morph 时高度恒定只变宽度）
- 展开的岛至多一个，滑向页面中央并遮盖另一个岛；hover 任一岛直接展开，移出 300ms 还原
- **朗读退场（吸收动画）**：finished 后闲置 5s（未悬停、未展开）触发 → 聊天岛同帧 `left → center` 右移回中，朗读球播 `island-exit`（塌到右缘后左移 anchor——经 `--island-exit-shift` CSS 变量跟随动态锚点，恰好落到页面中心，被聊天岛 zIndex 更低地吸收）→ 动画完 `stop()` 卸载；退场期间重新发起朗读则取消退场
- **退场倒计时圆环**：等待的 5s 内朗读球边缘显示环形进度（`TtsCountdownRing`，linear 收圈）。计时的唯一事实来源是 coordinator 的 `ttsDismissCounting`（= 退场 setTimeout 的启停条件）：悬停/展开时环与计时器同帧暂停，移开后一起从头重计；时长取 `ISLAND_METRICS.ttsDismissMs`，改一处即可
- 完成态（done/cancelled）闲置 8s 无交互自动清空对话回到笑脸；failed 保留待用户处理
- 流式首个 token 自动展开一次；用户收起后本轮不再自动展开（`markIslandTriggered` 新请求时重置；新任务触发会收起另一岛的展开态，避免反馈被遮挡）
- 划词工具栏与岛互不抑制（聊天面板展开时划词工具栏照常出现）

### 设计要点
- morph 动画：宽高/圆角/left 全 spring 过渡（left 比尺寸略慢产生「滑向目标位」生长感）；三层内容独立固定尺寸居中，opacity/scale 交叉过渡（iOS 手法，morph 中内容不被重排挤压）
- 容器只上报 hover/点击/Esc/点外事件，展开决策集中在 `useIslandCoordinator`（跨岛协调无法在单岛容器内完成）
- 拖进度条等瞬时操作通过 `IslandHoldContext` 的 hold/release 抑制自动收回（release 后补发被抑制的 leave）
- 输入框打字时鼠标滑出不收回（仅文本输入焦点抑制，`isTextEntryElement`；按钮残留焦点不抑制）
- 展开层常挂载（仅 opacity 切换）避免流式更新下 remount 掉帧；收起路径统一 blur 岛内焦点（焦点残留会让按键落入虚空）

### 不变量
- 岛固定顶部中央，聊天岛不做拖拽/resize（身份特征，去掉后大幅简化）
- 展开态点击岛外 = 收起（岛保留、对话保留）；清空对话用面板 × 按钮
- TTS 结束（idle）后朗读岛卸载；退场动画依赖 `ttsExiting` 标记（动画期间 status 仍是 finished，stop 后才真正卸载）
- 内容层 `pointerEvents` 必须按 active 切换；写死 `none` 会让胶囊内按钮永远无法点击
- 输入框 Enter 发送必须检查 `event.nativeEvent.isComposing`（IME 组合确认不是发送）

### 待优化清单
- [ ] compact 单行预览态（三段式的中间层：流式时不用展开也能瞇一眼最新回复）
- [ ] 无障碍：状态变化无 `aria-live` 播报；胶囊无键盘入口（Tab 不可达）
- [ ] 代码打磨：`useTtsStatusIcon` 改纯函数（现为 JSX 内调用的 hook 风格）；`iconBtnStyle` 在控制条/迷你条重复定义可工厂化；消息区滚动条颜色 hardcoded 未适配 dark 模式；`TtsMiniBar` 已无消费者（双岛分离后不再内嵌）可移除
- [ ] 双岛外缘锚点（`ISLAND_METRICS.dualAnchor = 92`，最贴状态 4px）与笑脸动画节奏需实测微调

## Manual Verification
- After `npm run build`, load `.output/chrome-mv3` in `chrome://extensions` as an unpacked extension.
- After reloading the extension, reload the target web page. Existing tabs keep old content-script instances.
- If a content-script change still doesn't appear after extension + page reload, close and reopen the tab.
- For background/service-worker changes, verify from the extension's service worker inspector.

### Extension Testing Lessons
- `npm run build` runs `npm run bundle-icons` first, which invokes `tsx`. In sandboxed environments this can fail with `listen EPERM` while creating a temp IPC pipe. Treat that as an environment/sandbox issue; rerun the build in an unrestricted local shell before assuming the project is broken.
- Chrome content scripts do not run on `data:`, `chrome://`, or extension error pages. Use a real `http://127.0.0.1:<port>` test page, reload the page after reloading the extension, and verify the content script has created the `aiction-ui` shadow host.
- Do not trust the first `chrome-extension://...` DevTools target when testing with remote debugging. Stock Chrome may expose built-in component extensions such as Google Hangouts or Google Network Speech. Confirm the extension identity by reading `chrome.runtime.getManifest()` and expect AIction's service worker to be `background.js`.
- Launching macOS Google Chrome with `--load-extension=.output/chrome-mv3` may fail to load the unpacked extension in some local automation setups, even when DevTools shows unrelated extension targets. If `chrome-extension://<id>/options.html` opens `chrome-error://chromewebdata/` with `ERR_FILE_NOT_FOUND`, the ID is not AIction or the extension did not load.
- For content-script UI smoke tests, a useful fallback is a synthetic page test: open a local HTTP page, stub the minimal `chrome.runtime` / `chrome.storage` APIs, inject the built `.output/chrome-mv3/content-scripts/content.js`, select text, and inspect the Shadow DOM. This verifies the built content bundle behavior, but it does not prove manifest-driven Chrome injection.
- Selection toolbar tests should account for i18n. The quick copy button may have `aria-label="Copy to Clipboard"` or `aria-label="复制到剪贴板"` depending on the resolved UI language.
- When verifying copy behavior, assert both outcomes: clipboard text equals the selected text, and the toolbar closes after the copy quick action.
- Always remove temporary test scripts and stop local test servers / temporary Chrome profiles after browser automation.

## Icon Generation Workflow

WXT reads `src/assets/icon.png` via `@wxt-dev/auto-icons` and copies it to the output. **Source PNG should be >=256px** to avoid upscaling artifacts.

Two files define the icon — keep them in sync:

| File | Role |
|------|------|
| `src/assets/icon.png` | High-res PNG source of truth (256x256, sharp + lanczos3 downscale) |
| `src/shared/ui/icons.tsx` | `BrandIcon` React component (renders `src/assets/icon.png`) |

### Steps to update the icon

1. Replace `src/assets/icon.png` with a new PNG (>=256px, transparent corners).
2. `npm run build` — WXT copies the icon to output.
3. Verify corners are transparent and edges are sharp.

### Notes
- Do **not** use `qlmanage` — it produces blurry low-quality output.
- Use sharp with `density: 600` for crisp edges when generating PNG from SVG.
- The PNG should have transparent corners (use `clipPath` with rounded rect if converting from SVG).

## Icon Caching System

Two-tier architecture for offline icon rendering and fast icon picker.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│ Runtime Loading (iconify.tsx)                        │
│                                                     │
│ 1. addCollection(BUNDLED_TABLER_ICONS)  ← static    │
│    106 icons, zero network, instant                  │
│                                                     │
│ 2. First render: lazy load user icons                │
│    chrome.storage.sync.get("aiction:icons")          │
│    → addIcon() per icon                              │
│                                                     │
│ 3. User picks new icon → fetch SVG → saveUserIcon()  │
│    → addIcon() → persist to storage                  │
└─────────────────────────────────────────────────────┘
```

### Two Storage Tiers

| Tier | Location | Content | Update Trigger |
|------|----------|---------|----------------|
| **Built-in** | `src/shared/ui/bundled-icons.ts` (generated) | 104 default + 2 nav icons (106 total) | Manual: `npm run bundle-icons` |
| **User icons** | `chrome.storage.sync` → `aiction:icons` | User-selected icon SVG data | On icon pick or config import |

### Icon Data Format (IconifyJSON)

```typescript
{
  prefix: "tabler",
  icons: {
    "sparkles": { body: "<path fill='none'.../>" },
    "bulb": { body: "<g fill='none'...>...</g>" }
  },
  width: 24,
  height: 24
}
```

- `body`: SVG inner paths (no outer `<svg>` tag), ~100-400 bytes per icon
- `width/height`: viewport size (Tabler uses 24x24)

### Files

| File | Role |
|------|------|
| `scripts/bundle-icons.ts` | Build script: extracts 106 icons from `@iconify/json` → generates `bundled-icons.ts` |
| `scripts/check-icons.ts` | Utility script: validates icon availability via Iconify API |
| `src/shared/ui/bundled-icons.ts` | **Generated**: exports `BUNDLED_TABLER_ICONS` (IconifyJSON, ~22KB) |
| `src/shared/ui/iconify.tsx` | Calls `addCollection()` at module load; lazy loads user icons on first render |
| `src/shared/storage.ts` | `getUserIcons()`, `saveUserIcon()`, `loadAndRegisterUserIcons()` |
| `src/shared/types.ts` | `UserIconData` interface |

### Commands

- `npm run bundle-icons` — regenerate `bundled-icons.ts` from `@iconify/json` (manual, not auto)
- `npm run build` — runs `bundle-icons` automatically before WXT build

### Icon Selection Flow (OptionsPage)

When user picks an icon:

1. Check if icon is in built-in set (`BUNDLED_TABLER_ICONS.icons`)
2. **If built-in**: copy body from `BUNDLED_TABLER_ICONS` → `saveUserIcon()`
3. **If not built-in**: fetch from `api.iconify.design` → parse SVG body → `saveUserIcon()` + `addIcon()`
4. Save settings with icon name string

**Important**: `handleIconSelect` is async — always `await` it before saving settings.

### Export/Import

**Export** (`handleExportSettings`):
```json
{
  "app": "aiction",
  "version": 1,
  "exportedAt": "...",
  "settings": { ... },
  "userIcons": { "tabler:sparkles": { "body": "...", "width": 24, "height": 24 } }
}
```

**Import** (`confirmImportSettings`):
1. Parse JSON → extract `settings` and `userIcons`
2. `normalizeSettings(settings)` → save
3. For each user icon: `saveUserIcon(name, data)` → persist to `chrome.storage.sync`

### Size Budget

| Item | Size |
|------|------|
| Built-in icons (106) | ~22KB raw / ~8KB gzip |
| Per user icon | ~200B |
| User icons cap (50) | ~10KB (well under `chrome.storage.sync` 100KB limit) |

### Dependencies

- `@iconify/json` (devDependency) — full Tabler icon set JSON for build script
- `@iconify/react` (dependency) — `addCollection()`, `addIcon()`, `Icon` component
- `tsx` (devDependency) — runs `scripts/bundle-icons.ts`

## Reference Projects

`reference/` contains two similar Chrome extension projects for reference. See `reference/README.md`.

When unsure about implementation patterns (component structure, messaging, UI approach, etc.), check these projects first.
