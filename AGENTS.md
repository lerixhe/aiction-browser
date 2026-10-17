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

### JSX “幽灵报错”：少一个 `}` 的定位方法（灵动岛重构期间沉淀，适用于任意 JSX 浮层）

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

Shared logic in `src/shared/*`: `types.ts`, `selection.ts`, `prompt.ts`, `messaging.ts`, `storage.ts`, `constants.ts`, `defaults.ts`, `errors.ts`, `analytics.ts`, `model-provider.ts`, `models-dev.ts`, `model-params.ts`（模型参数→请求参组装/上下文裁剪）, `openrouter.ts`（OpenRouter 模型数据源，智能填充参数用，与 models.dev 同样的 24h 缓存策略）。

Shared UI in `src/shared/ui/`: `tokens.ts`, `styles.ts`, `theme.ts`, `icons.tsx`, `iconify.tsx`, `markdown.tsx`, `toggle-switch.tsx`, `avatar.ts`, `bundled-icons.ts`, `icon-library.ts`.

Content script hooks in `src/entrypoints/content/hooks/`: `useChatState.ts`, `useSelectionDetection.ts`, `useToolbarState.ts`, `useSpeechPlayer.ts`.

Content script components in `src/entrypoints/content/components/`: `SelectionToolbar.tsx`（划词工具栏，通过 `onRectChange` 上报落位）, `floating.ts`（悬浮面板公共锚定/安全区逻辑）, `ChatSession.tsx`（单个对话会话实例：App/PdfViewer 每次触发以递增 id 作为 key 独立创建，关闭即销毁）, `ChatPanel.tsx`（悬浮对话窗内容件，由 ChatSession 渲染）, `SpeechWidget.tsx`（悬浮朗读控件：未悬停时小圆球 ⇄ 悬停/点击展开控制条）, `SpeechPlayer.tsx`（TTS 内容件：`TtsControlBar` / `TtsCircleContent` / `TtsCountdownRing`）, `ToolbarActionMenu.tsx`.

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
- Preserve `{selection}` placeholder validation for custom actions before saving (legacy `{text}` templates are auto-migrated on read).
- Conversation is intentionally per-page in-memory only; refresh/close clears it.

## Selection UI Pitfalls
- WXT content-script UI runs inside Shadow DOM. Do not rely on `document.activeElement` alone; use deep active-element traversal through nested `shadowRoot` boundaries.
- Use `event.composedPath()` instead of `event.target` for extension UI event filtering so Shadow DOM retargeting doesn't bypass root checks.
- Text selection inside toolbar/chat inputs must never update page selection context, toolbar anchor, or toolbar visibility.
- Do not let transient page-selection loss during focus transfer into extension inputs hide the toolbar. Preserve that state during extension-internal interaction.
- When debugging selection bugs, reload the extension and refresh the target tab before assuming logic is wrong. Stale injected code is a common cause.

## Floating Panels (悬浮面板：对话窗 / 朗读控件)

灵动岛方案已移除。触发动作后划词工具栏**保持可见、选区不清空**
（`SelectionToolbar.handleActionClick` 不再 `removeAllRanges`；copy 快捷动作除外），
用户可在工具栏上连续触发不同动作；工具栏在新选区/点击页面空白/copy 时自然关闭。
所有面板统一锚定在触发时刻快照的工具栏落位矩形上（页面滚动时随文档一起滚动，
不跟随此后的工具栏拖拽）；**朗读控件是唯一例外**——它固定在视口顶部中间，
不依赖锚点（见下方朗读控件条目）。

- **公共定位**：`components/floating.ts`。`SelectionToolbar` 通过 `onRectChange`
  上报自身落位（文档坐标矩形 `AnchorRect`）；App 在触发动作时快照一份传给面板。
  `placeNearAnchor()`：下方放不下自动翻转到上方，两边都放不下收敛回视口，
  水平方向钳制在文档安全区内。`fallbackAnchor()` 用选区锚点兜底。
- **卡片态（收缩态）与聊天态**：对话窗有两种形态（`ChatPanel` 内部 `mode`），新触发默认
  进入**卡片态**——同一锚点、同一宽度，高度随内容自适应（`maxHeight` 钳制，落位计算用
  `CARD_ASSUME_HEIGHT` 假设高度，避免误判为「下方放不下」而错误翻转到上方），内容区只渲染
  assistant 消息（隐藏用户气泡）、无输入区（头部专门有一个形态切换按钮承载展开入口）；卡片态的 assistant
  内容**去掉气泡框直铺铺满面板**（`MessageBubble` 的 `variant="card"`：透明背景、无边框
  圆角阴影、`maxWidth` 100%，多条间用 hairline 分隔），展开为聊天态后回到常规气泡样式。
- **形态切换按钮（头部单按钮两态）**：卡片态 =「追问」（对话气泡图标 + 文案），聊天态 =「收起」
  （人字箭头 + 文案），两态**同族同形**（同高度/同圆角/同图标尺寸/同 hover，仅图标与文案变），
  点击展开为完整**聊天态**（消息 + 输入区）并自动聚焦输入框，或在聊天态点击回卡片态并 blur
  输入框（防止残留焦点落入已隐藏的 textarea）。两态共用 `handleToggleMode`，`aria-expanded`
  随态切换；`aria-label` / `title` 用描述性长文案 `chat.expandChat` / `chat.collapsePanel`，
  可见文案用短文案 `chat.expandChat` / `chat.collapseShort`（「收起」/「Collapse」，两态宽度才接近）。
  卡片态高度比聊天态矮一个底部栏，`CARD_ASSUME_HEIGHT` 据此取 170。
- **头部控件统一样式族**：`ChatPanel.tsx` 模块级 `headerControlStyle(theme, {withLabel, hovered,
  focused, active})` 是形态切换 / 钉住 / 关闭三个按钮的唯一样式来源（高 24、`uiRadius.pill`——
  icon-only 呈正圆、带文案呈胶囊、图标统一 12、hover = surfaceMuted、focus ring 统一）。
  `active` 用于开关已开启态（目前只有钉住）：主色 12% 淡底（`${theme.accent.primary}1F`）。
  新增头部按钮时直接调它，不要再手写一份 style。
  形态切换与钉住都带可见文案（`chat.expandChat` / `chat.collapseShort` / `chat.pinShort`），
  关闭按钮保持纯图标（× 语义自明）；钉住是切换型按钮，可见文案**不随态变**（恒为「钉住」/
  "Pin"，避免「钉住/取消钉住」宽度跳变），开关状态靠 `active` 淡底 + 填色图标 + `aria-pressed` 表达，
  描述性长文案留在 `aria-label` / `title`（`chat.pinPanel` / `chat.unpinPanel`）。
- **输入区（composer）统一样式族**：`ChatPanel.tsx` 的 `composerStyle` /
  `composerSendButtonStyle` 是底部输入区的唯一样式来源。一层描边同时包住 textarea 与 28px
  圆形发送按钮（不再是「并排的输入框 + 文字按钮」），聚焦时描边转主色 + 一圈柔光；
  按钮三态：空输入静默（无底、淡箭头、不可点）→ 有内容点亮主色（箭头反色）→ 生成中
  换成停止按钮（输入槽底上的反色圆 + 描边 + 实心方块，hover 加深描边）。输入框自增高
  （`COMPOSER_INPUT_MIN/MAX_HEIGHT`，24→132，超出内部滚动），滚动条与 placeholder 取色
  均随主题（不写死灰度）。`Enter` 发送 / `Shift+Enter` 换行、IME 组合判定不变。
- 两态共用同一会话实例：`useChatState`
  的 messages/流式跨态持续进行，卡片态下流式生成照常渲染。
- **对话会话 `ChatSession.tsx` / 内容件 `ChatPanel.tsx`**：触发 AI 动作后弹出新的
  会话实例。**多实例并存**（`hooks/useChatSessions.ts`，App / PdfViewer 共用）：
  每次触发均**追加**全新实例（递增 id 作 React key，挂载即发送动作解析出的首个
  prompt），不替换既有实例；单个实例关闭（× / 点外 / Esc）只销毁自身（卸载时中断
  流式并清理节流定时器）。Esc 由 hook 统一监听（逐面板监听会一次按键连环关闭所有
  面板），每按一次销毁最新创建的一个；IME 组合中的 Esc 属输入法行为，忽略。
  `useChatState` 由 ChatSession 内部调用，每实例持有独立的 messages / abort / 节流
  定时器。防抖：存在解析 prompt 相同的未关闭会话（同动作同选区重复点击）时忽略
  本次触发，相应会话被关闭后才能重新触发；其余动作不受已开会话（含钉住的）阻断。
- **对话窗头部交互**：头部左侧为模型胶囊（芯片图标 + 模型名内联显示，可拖拽），
  右侧为图钉钉住按钮、× 关闭；钉住（顶针图标填色 + 45° 旋转变实心）后点击窗外
  不再关闭（Esc / × 仍可关闭），且在新触发时**继续驻留与其他实例并存**（钉住状态
  由父级持有：ChatPanel 受控 props → ChatSession → useChatSessions 回写）。
  头部整条为拖拽手柄（按钮除外），按住空白处可拖动整个对话窗：拖过一次后位置
  归用户接管（`draggedRef`），resize 时只收敛回视口而不再按锚点重算。
- **拖拽边界（`floating.ts` 的 `clampPanelDragPos` / `fitPanelInViewport`）**：
  钳制必须用**面板实测尺寸**（`panelSizeRef` 由 ResizeObserver 维护），
  不能用 `PANEL_MAX_HEIGHT`——卡片态实际高度远小于展开态，按 640 算会把矮卡片
  硬顶在视口上部、拖不到下方（历史 bug）。边界是**单一套软边界**：
  只保证「最小可抓取区」留在视口内——垂直 `DRAG_HEADER_KEEP` = 44（头部手柄在
  视口内），水平 `DRAG_KEEP_VISIBLE_X` = 200（头部中央手柄仍在视口内），
  上缘不允许拖出视口，下/左/右允许溢出。
  为什么不用「放得下就要求整块可见」：对话窗展开后高度接近视口高度，
  整块可见会把垂直可拖范围压到几十像素（视口 700 → 只能拖 44px），观感就是拖不动。
  为什么不做「不限范围」：面板能被拖出视口而彻底抓不回来（= 悬浮窗丢失），
  只能刷新页面自救。
  水平基准取**视口**而非文档宽度：面板随文档滚动，横向滚出视口同样抓不回来。
- **拖拽后的位置权归用户**：`draggedRef` 一旦置位，视口 resize 只跑软边界
  （`clampPanelDragPos`，防拖丢），不再用 `fitPanelInViewport` 硬拽回视口；
  ResizeObserver 也跳过。`fitPanelInViewport` 只在**未拖拽**时生效（自动落位的
  面板长高后顶出视口时拉回来），否则一开 DevTools 就会把用户拖到边缘的面板
  硬拽回视口，观感同样是「拖不出去」。
- **朗读控件 `SpeechWidget.tsx`**：触发朗读后在**视口顶部中间**以小圆球态浮现
  （`TOP_INSET = EDGE_INSET + 4`，水平为视口中心，视口过窄时钳到左侧），
  接收 `player` 一个 prop（不再吃工具栏锚点）。鼠标移入自动展开为控制条，
  移出 300ms（或触发后 4s 一直未交互）自动收起回 32px 小圆球，
  触摸屏点击圆球同样展开；morph 时用 left/top 与宽高一起过渡，
  以 placement 的 `{cx, cy}` 为中心——不靠 `transform` 补偿（否则与入场 keyframes
  的 transform 打架）。
- **朗读岛固定视口顶部**：容器用 `position: fixed` + 视口坐标落位
  （`placement = {cx, cy}` 保存视口坐标，渲染时按当前尺寸反推 left/top），
  所以视觉上恒定贴在视口顶部中间，且滚动由合成线程同步、零 JS 开销（只监听 resize
  重算水平中心）。不用「absolute + 文档坐标」是因为岛不锚在选区/工具栏上，
  若随文档滚动就等于把控件丢了；也不用滚动监听重算（每帧 setState 不划算）。
- **朗读退场**：finished 且处于圆球态闲置 5s（未悬停、未展开）自动 `stop()` 卸载；
  倒计时圆环 `TtsCountdownRing` 与退场计时器同帧启停（悬停/展开暂停，移开重计），
  时长常量为 `TTS_DISMISS_MS`（SpeechPlayer 与 SpeechWidget 各定义一次，需同步改）。
- **收起抑制**：拖动进度条通过 `HoldContext`（hold/release 配对）抑制自动收起
  （release 后补发被抑制的收起）；焦点在文本输入类控件（textarea/input/select/
  contentEditable）时鼠标滑出不收起。
- 划词工具栏与各面板互不抑制（面板开着时划词工具栏照常出现）。
- 悬浮面板的锚点是触发时刻快照的工具栏落位——不要依赖 `toolbarAnchor` 的实时值。
- 对话窗「点外关闭」必须忽略扩展 UI 内部的点击（composedPath 里有
  `[data-aiction-root="true"]` 祖先即忽略）：面板开着时还在点工具栏换动作是常态。

### 不变量
- 面板定位是 absolute + 文档坐标（不是 fixed），随页面滚动；重新定位只发生在
  anchor/resize 变化时。**朗读控件是唯一例外**：它不锚工具栏，用 fixed + 视口
  坐标固定在视口顶部中间（滚动不重算，仅 resize 重算）。
- 面板的点外关闭监听必须用 `event.composedPath()` 穿透 Shadow DOM；
  层级：工具栏 `uiLayer.overlay` > 面板 `uiLayer.panel`。
- 输入框 Enter 发送必须检查 `event.nativeEvent.isComposing`（IME 组合确认不是发送）。
- 对话为单轮场景内存态：关闭面板 = 该会话实例整体销毁；新动作触发总是追加全新实例
  （多实例并存，不复用旧 messages；钉住的实例不计入替换，而是驻留并存）；同一动作
  同一选区重复点击被防抖抑制（存在 initialPrompt 相同的未关闭会话）。
- 对话面板（ChatPanel）自身只管点外关闭与钉住；Esc 键统一在 useChatSessions 监听，
  面板内不再另加 Esc 监听（避免多实例时一次按键连环关闭）。
- copy 快捷动作仍会关闭工具栏（复制后选区即被消费，属预期行为）。

### 待优化清单
- [ ] 无障碍：状态变化无 `aria-live` 播报；面板/圆球无键盘入口（Tab 不可达）
- [ ] 代码打磨：消息区滚动条颜色 hardcoded 未适配 dark 模式；朗读控件收起动画与
      小圆球悬停展开手感需实测微调；对话窗已支持拖拽（头部手柄），暂不支持 resize

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
