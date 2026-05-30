# Wiki

## 目录
1. [项目架构概览](#1-项目架构概览)
2. [目录结构详解](#2-目录结构详解)
3. [核心模块分析](#3-核心模块分析)
4. [关键代码解读](#4-关键代码解读)
5. [技术亮点和设计模式](#5-技术亮点和设计模式)
6. [开发者指南](#6-开发者指南)
7. [代码示例和流程图](#7-代码示例和流程图)

---

## 1. 项目架构概览

### 1.1 整体架构设计

这是一个基于 **WXT + React + TypeScript** 的 Chrome MV3 扩展，采用三运行时上下文架构：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension Architecture                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Content Script  │  │   Background    │  │   Options Page  │ │
│  │  (src/contents)  │  │   Service Worker│  │   (src/options) │ │
│  │                  │  │   (src/background)│  │                 │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬────────┘ │
│           │                     │                     │          │
│           │   chrome.runtime    │   chrome.runtime    │          │
│           │      .onMessage     │      .onMessage     │          │
│           └─────────────────────┼─────────────────────┘          │
│                                 │                                │
│                    ┌────────────┴────────────┐                  │
│                    │    Shared Modules       │                  │
│                    │    (src/shared)         │                  │
│                    └─────────────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 运行时上下文说明

| 上下文 | 入口文件 | 主要职责 |
|--------|----------|----------|
| **Content Script** | `contents/main.tsx` → `src/contents/main.tsx` | 检测文本选择、渲染 UI 工具栏和聊天面板、管理页面级对话状态 |
| **Background Service Worker** | `background.ts` → `src/background/index.ts` | 处理所有 AI API 调用、读取/存储设置、管理流式响应 |
| **Options Page** | `options.tsx` → `src/options/index.tsx` | 配置 API 设置、翻译语言、自定义操作、备份与迁移 |

### 1.3 通信机制

扩展使用 Chrome 扩展 API 的两种通信机制：

1. **`chrome.runtime.sendMessage` / `onMessage`**：用于一次性请求-响应模式
   - 测试 API 连接
   - 获取模型列表
   
2. **`chrome.runtime.connect` / `Port`**：用于长连接流式传输
   - AI 对话的流式响应（Server-Sent Events）

```
Content Script                          Background Service Worker
      │                                         │
      │  ┌─────────────────────────────────┐    │
      │  │  chrome.runtime.connect()       │    │
      │  │  port.postMessage({             │    │
      │  │    type: "CHAT_STREAM_START",   │────┼──→  streamOpenAiCompatible()
      │  │    payload: { messages: [...] } │    │         │
      │  │  })                             │    │         │
      │  └─────────────────────────────────┘    │         │
      │                                         │         │
      │  ┌─────────────────────────────────┐    │         │
      │  │  port.onMessage((event) => {    │    │         │
      │  │    // "started"                 │    │         │
      │  │    // "chunk"                   │←───┼─────────┘
      │  │    // "completed"               │    │
      │  │    // "failed"                  │    │
      │  │  })                             │    │
      │  └─────────────────────────────────┘    │
      │                                         │
```

### 1.4 数据流向

```
用户选择文本
    │
    ▼
Content Script 检测选择事件
    │
    ├──→ 显示 SelectionToolbar（触发按钮/环形菜单）
    │
    └──→ 用户点击动作
         │
         ▼
    打开 UnifiedPanel（对话窗）
         │
         ▼
    构建 Prompt（含上下文）
         │
         ▼
    通过 Port 发送消息到 Background
         │
         ▼
    Background 读取 Settings，调用 AI API
         │
         ▼
    流式返回 chunks 到 Content Script
         │
         ▼
    更新对话窗中的消息流
```

---

## 2. 目录结构详解

### 2.1 项目根目录

```
aiction/
├── background.ts              # Background Service Worker 入口（薄包装）
├── options.tsx                # Options Page 入口（薄包装）
├── popup.tsx                  # Popup 窗口入口（模型服务切换）
├── contents/
│   └── main.tsx               # Content Script 入口（WXT defineContentScript）
├── src/                       # 源代码主目录
│   ├── background/            # 后台脚本逻辑
│   ├── contents/              # 内容脚本 UI 和逻辑
│   │   ├── components/        # React 组件
│   │   │   ├── SelectionToolbar.tsx   # 触发按钮定位 + 渲染入口
│   │   │   ├── ExplodedActionMenu.tsx # 环形展开菜单
│   │   │   ├── PillActionMenu.tsx     # 胶囊工具栏菜单
│   │   │   └── UnifiedPanel.tsx       # 对话窗
│   │   ├── hooks/             # 自定义 Hooks
│   │   └── utils/             # DOM 工具函数
│   ├── options/               # 选项页组件
│   │   ├── index.tsx          # 选项页主体
│   │   └── ConfirmDialog.tsx  # 确认对话框
│   └── shared/                # 共享模块
│       ├── types.ts           # TypeScript 类型定义
│       ├── constants.ts       # 常量定义
│       ├── defaults.ts        # 默认值（DEFAULT_ACTIONS, DEFAULT_SETTINGS 等）
│       ├── errors.ts          # 错误处理（AppError, getErrorMessage 等）
│       ├── messaging.ts       # 消息传递封装（streamChat）
│       ├── prompt.ts          # 提示词构建（resolveActionTemplate, buildContextSystemMessage）
│       ├── selection.ts       # 文本选择逻辑
│       ├── storage.ts         # Chrome 存储封装
│       └── ui/                # UI 相关
│           ├── tokens.ts      # 设计令牌（颜色、间距、字体等）
│           ├── theme.ts       # 主题 Hook（useUiThemeName, useUiTheme）
│           ├── styles.ts      # 样式工厂函数（createButtonStyle, createCardStyle 等）
│           └── icons.tsx      # BrandIcon 组件
├── package.json               # 项目配置
├── tsconfig.json              # TypeScript 配置
├── AGENTS.md                  # 项目说明文档
└── CLAUDE.md                  # 开发指南
```

### 2.2 重要配置文件

#### package.json
```json
{
  "name": "aiction",
  "displayName": "AIction",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "typecheck": "tsc --noEmit"
  }
}
```

#### tsconfig.json
- TypeScript 路径别名：`~/*` → `./src/*`
- 目标：ES2022
- JSX：react-jsx

---

## 3. 核心模块分析

### 3.1 Content Script (`src/contents/`)

#### main.tsx - 入口组件

**文件位置**：`src/contents/main.tsx`

**职责**：
- 作为 WXT Content Script 的入口组件（使用 `defineContentScript` 和 `createShadowRootUi`）
- 协调 SelectionToolbar 和 UnifiedPanel 的渲染
- 整合三个核心 Hook：`useToolbarState`、`useChatState`、`useSelectionDetection`

**关键代码结构**：
```typescript
// src/contents/main.tsx:16-163
function App() {
  const extensionRootRef = useRef<HTMLDivElement | null>(null)
  
  // 工具栏状态管理
  const { toolbarVisible, toolbarAnchor, selectionContext, actions, toolbarMode, closeToolbar, openToolbar, toolbarVisibleRef } = useToolbarState()
  
  // 聊天状态管理
  const { messages, requestState, panelOpen, setPanelOpen, capturedText, setCapturedText, setContext, sendPrompt, stopStreaming, resetMessages } = useChatState()
  
  // 选择检测
  useSelectionDetection({
    extensionRootRef,
    onSelectionChange: handleSelectionChange,
    isToolbarVisible: () => toolbarVisibleRef.current
  })
  
  return (
    <div ref={extensionRootRef} data-aiction-root="true" style={{ pointerEvents: "none" }}>
      <SelectionToolbar ... />
      {panelOpen && <UnifiedPanel ... />}
    </div>
  )
}
```

**重要设计决策**：
1. 根元素设置 `data-aiction-root="true"` 作为事件过滤的标记
2. `pointerEvents: "none"` 让扩展 UI 不阻挡页面交互，子组件通过 `pointerEvents: "auto"` 接管事件

#### components/ - UI 组件

##### SelectionToolbar.tsx（触发按钮/环形菜单）

**文件位置**：`src/contents/components/SelectionToolbar.tsx`

**功能**：
- 渐变圆形触发按钮（BrandIcon）
- 根据 `toolbarMode` 渲染两种菜单：`ExplodedActionMenu`（环形展开）或 `PillActionMenu`（胶囊工具栏）
- 基于鼠标位置的智能定位

**定位算法**（`src/contents/components/SelectionToolbar.tsx:57-83`）：
```typescript
const position = useMemo(() => {
  if (!anchor) return { top: 0, left: 0 }
  
  // 基于鼠标位置计算初始位置
  let top = anchor.mouseY - TRIGGER_SIZE - OFFSET_Y
  let left = anchor.mouseX + OFFSET_X
  
  // 边界检测：防止超出视口
  if (left + TRIGGER_SIZE > viewportWidth - uiLayout.edgeInset) {
    left = anchor.mouseX - TRIGGER_SIZE - OFFSET_X
  }
  
  // 限制在视口内
  top = Math.min(Math.max(minTop, top), maxTop)
  left = Math.min(Math.max(minLeft, left), maxLeft)
  
  return { top, left }
}, [anchor])
```

##### UnifiedPanel.tsx（对话窗）

**文件位置**：`src/contents/components/UnifiedPanel.tsx`

**功能**：
- 模态浮层聊天窗口
- 包含：选区编辑区、消息流、思考块、输入栏
- 流式消息实时更新
- 思考过程折叠展示（支持 DeepSeek 等模型的 reasoning_content）

#### hooks/ - 自定义 React Hooks

##### useToolbarState.ts

**文件位置**：`src/contents/hooks/useToolbarState.ts`

**职责**：
- 管理工具栏可见性、位置、选区上下文
- 从 settings 加载自定义 actions
- 监听 storage 变化实时更新

**关键状态**：
```typescript
{
  toolbarVisible: boolean,      // 工具栏是否可见
  toolbarAnchor: SelectionAnchor | null,  // 定位锚点
  selectionContext: SelectionContext | null,  // 选区上下文
  actions: ActionTemplate[],    // 动作模板列表
  toolbarMode: ToolbarMode      // "explode" | "pill"
}
```

##### useChatState.ts

**文件位置**：`src/contents/hooks/useChatState.ts`

**职责**：
- 管理聊天消息列表
- 处理流式请求的生命周期
- 支持停止生成

**消息流处理**（`src/contents/hooks/useChatState.ts:99-156`）：
```typescript
await streamChat(apiMessages, {
  signal: abortController.signal,
  onEvent: (event) => {
    if (event.type === "started") {
      // 开始流式响应
    }
    if (event.type === "chunk") {
      // 累积内容并更新 UI
      streamedContent += event.content
      if (event.reasoning_content) {
        streamedReasoning += event.reasoning_content
      }
    }
    if (event.type === "completed") {
      // 完成，若无内容则显示空消息提示
    }
    if (event.type === "cancelled") {
      // 标记为已取消
    }
    if (event.type === "failed") {
      // 处理错误
    }
  }
})
```

##### useSelectionDetection.ts

**文件位置**：`src/contents/hooks/useSelectionDetection.ts`

**职责**：
- 监听页面上的文本选择事件
- 过滤扩展 UI 内部的选择事件
- 使用 requestAnimationFrame 优化性能

**事件监听**（`src/contents/hooks/useSelectionDetection.ts:160-165`）：
```typescript
document.addEventListener("pointerup", onPointerUp, true)
document.addEventListener("selectionchange", handleSelectionChangeEvent, true)
document.addEventListener("keyup", onKeyUp, true)
document.addEventListener("focusin", onFocusIn, true)
document.addEventListener("pointerdown", onDocumentPointerDown, true)
```

#### utils/domUtils.ts

**文件位置**：`src/contents/utils/domUtils.ts`

**核心功能**：

1. **Shadow DOM 深度活跃元素遍历**（`src/contents/utils/domUtils.ts:6-17`）：
```typescript
export function getDeepActiveElement(root: Document | ShadowRoot = document): Element | null {
  const activeElement = root.activeElement
  if (activeElement instanceof HTMLElement && activeElement.shadowRoot) {
    return getDeepActiveElement(activeElement.shadowRoot) ?? activeElement
  }
  return activeElement
}
```

2. **事件路径过滤**（`src/contents/utils/domUtils.ts:44-50`）：
```typescript
export function isInsideExtensionEvent(event: Event, extensionRoot: HTMLElement | null): boolean {
  const path = typeof event.composedPath === "function" ? event.composedPath() : []
  return path.some((node) => isInsideExtensionRoot(node, extensionRoot))
}
```

---

### 3.2 Background Service Worker (`src/background/`)

#### index.ts - 消息处理器

**文件位置**：`src/background/index.ts`

**主要职责**：

1. **流式 AI 调用**（`src/background/index.ts:83-240`）：
   - 使用 `fetch` 调用 OpenAI 兼容的 `/chat/completions` 端点
   - 处理 SSE（Server-Sent Events）流
   - 支持 `reasoning_content`（DeepSeek 等模型）
   - 处理中断错误（`isAbortError`）并发送 `cancelled` 事件

2. **消息处理器注册**（`src/background/index.ts:242-297`）：
```typescript
export function setupBackgroundMessageHandler(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== MESSAGE_TYPES.STREAM_PORT_NAME) return
    
    let abortController: AbortController | null = null
    
    port.onDisconnect.addListener(() => {
      abortController?.abort()
    })
    
    port.onMessage.addListener((request: ChatStreamRequest) => {
      if (request?.type === MESSAGE_TYPES.CHAT_STREAM_CANCEL) {
        abortController?.abort()
        return
      }
      
      if (request?.type !== MESSAGE_TYPES.CHAT_STREAM_START) return
      
      abortController?.abort()
      abortController = new AbortController()
      
      void streamOpenAiCompatible(request.payload.messages, abortController.signal, (event) => {
        try { port.postMessage(event) } catch { return }
      })
    })
  })
}
```

3. **API 测试连接**（`src/background/index.ts:301-371`）：
   - 先尝试 `/models` 端点
   - 然后发送测试请求验证连通性
   - 返回延迟信息

4. **获取模型列表**（`src/background/index.ts:373-422`）：
   - 调用 `/models` 端点
   - 解析返回的模型 ID 列表

**流式响应处理**（`src/background/index.ts:148-213`）：
```typescript
const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ""

while (true) {
  const { done, value } = await reader.read()
  buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
  
  const events = buffer.split("\n\n")
  buffer = events.pop() || ""
  
  for (const event of events) {
    const lines = event.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
    
    for (const line of lines) {
      const data = line.slice(5).trim()
      if (data === "[DONE]") {
        onEvent({ type: "completed" })
        return
      }
      
      const parsed = JSON.parse(data)
      const { content, reasoning_content } = getStreamChunkContent(parsed)
      
      if (content || reasoning_content) {
        onEvent({
          type: "chunk",
          content,
          ...(reasoning_content ? { reasoning_content } : {})
        })
      }
    }
  }
}
```

---

### 3.3 Options Page (`src/options/`)

#### index.tsx - 配置界面

**文件位置**：`src/options/index.tsx`

**功能模块**：
1. **外观设置**：主题切换（Auto/Light/Dark）、工具栏模式（环形按钮/胶囊工具栏）
2. **AI 大模型配置**：
   - 添加/编辑/删除自定义服务
   - API Base URL、API Key、Model 配置
   - 模型参数调整（maxTokens、temperature、topP 等）
   - 测试连接功能
   - 获取模型列表
3. **动作指令**：自定义动作模板管理
4. **备份与迁移**：导入/导出配置 JSON

**状态管理示例**（`src/options/index.tsx:91-113`）：
```typescript
export default function OptionsPage() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [connectionView, setConnectionView] = useState<"list" | "create" | "edit">("list")
  const [serviceDraft, setServiceDraft] = useState<ModelServiceConfig>(createCustomServiceDraft())
  // ... 更多状态
  
  const saveSettingsNow = (updater: (current: ExtensionSettings) => ExtensionSettings, successMessage?: string) => {
    setSettings((current) => {
      const next = updater(current)
      void saveSettings({ ...next, modelServices: next.modelServices.map(...) })
      return next
    })
  }
}
```

---

### 3.4 Shared Modules (`src/shared/`)

#### types.ts - 类型定义

**文件位置**：`src/shared/types.ts`

**核心类型**：

```typescript
// 扩展设置
export interface ExtensionSettings {
  modelServices: ModelServiceConfig[]  // 模型服务配置列表
  activeModelServiceId: string         // 当前激活的服务 ID
  theme: ThemePreference               // 主题偏好
  toolbarMode: ToolbarMode             // 工具栏模式
  actions: ActionTemplate[]            // 自定义动作模板
}

// 模型服务配置
export interface ModelServiceConfig {
  id: string
  type: ModelServiceType
  name: string
  apiBaseUrl: string
  apiKey: string
  model: string
  modelParams: ModelParams
}

// 选区上下文
export interface SelectionContext {
  text: string              // 选中的文本
  title: string             // 页面标题
  url: string               // 页面 URL
  surround?: string         // 周围段落上下文
  meta?: { description?: string }  // 页面元信息
}

// 聊天消息
export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  reasoning_content?: string  // AI 推理过程（DeepSeek 等）
}

// 流式事件类型
export type ChatStreamEvent =
  | { type: "started" }
  | { type: "chunk"; content: string; reasoning_content?: string }
  | { type: "completed" }
  | { type: "cancelled" }
  | { type: "failed"; error: string }
```

#### constants.ts - 常量定义

**文件位置**：`src/shared/constants.ts`

```typescript
export const MESSAGE_TYPES = {
  CHAT_STREAM_START: "AICTION_CHAT_STREAM_START",
  CHAT_STREAM_CANCEL: "AICTION_CHAT_STREAM_CANCEL",
  STREAM_PORT_NAME: "AICTION_STREAM",
  API_TEST_REQUEST: "AICTION_API_TEST_REQUEST",
  FETCH_MODELS_REQUEST: "AICTION_FETCH_MODELS_REQUEST"
} as const

export const ERROR_MESSAGES = {
  NO_API_KEY: "请先在设置台填写 API Key。",
  REQUEST_FAILED: "请求失败",
  NO_VALID_CONTENT: "AI 未返回有效内容。",
  // ...
} as const
```

#### storage.ts - Chrome 存储封装

**文件位置**：`src/shared/storage.ts`

**核心函数**：

```typescript
// 读取设置（带默认值回退）
export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY)
  const saved = result[SETTINGS_KEY]
  return normalizeSettings(saved)
}

// 保存设置
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings })
}

// 标准化设置（处理缺失字段）
export function normalizeSettings(value: unknown): ExtensionSettings {
  // 验证每个字段，缺失的回退到默认值
}

// 获取当前激活的模型服务
export function getActiveModelService(settings: ExtensionSettings): ModelServiceConfig | null {
  return settings.modelServices.find((service) => service.id === settings.activeModelServiceId) ?? null
}
```

#### messaging.ts - 消息传递封装

**文件位置**：`src/shared/messaging.ts`

**流式聊天封装**（`src/shared/messaging.ts:23-113`）：
```typescript
export async function streamChat(messages: ChatMessage[], options: StreamChatOptions): Promise<void> {
  const request: ChatStreamStartRequest = {
    type: MESSAGE_TYPES.CHAT_STREAM_START,
    payload: { messages }
  }
  
  await new Promise<void>((resolve, reject) => {
    // 建立长连接
    const port = chrome.runtime.connect({ name: MESSAGE_TYPES.STREAM_PORT_NAME })
    
    // 处理消息
    const handleMessage = (message: ChatStreamEvent) => {
      options.onEvent(message)
      if (isTerminalEvent(message)) {
        settle(() => {
          port.disconnect()
          resolve()
        })
      }
    }
    
    // 处理断开连接
    const handleDisconnect = () => {
      settle(() => {
        reject(new Error(chrome.runtime.lastError?.message || ERROR_MESSAGES.STREAM_DISCONNECTED))
      })
    }
    
    // 处理取消请求
    const handleAbort = () => {
      const cancelRequest: ChatStreamCancelRequest = { type: MESSAGE_TYPES.CHAT_STREAM_CANCEL }
      try { port.postMessage(cancelRequest) } catch { settle(resolve) }
    }
    
    port.onMessage.addListener(handleMessage)
    port.onDisconnect.addListener(handleDisconnect)
    options.signal?.addEventListener("abort", handleAbort, { once: true })
    
    // 发送请求
    port.postMessage(request)
  })
}
```

#### selection.ts - 文本选择逻辑

**文件位置**：`src/shared/selection.ts`

**核心功能**：
1. **获取选择快照**（`src/shared/selection.ts:225-232`）：
```typescript
export function getSelectionSnapshot(target: EventTarget | null = null): SelectionSnapshot | null {
  const textControlSnapshot = getTextControlSnapshot(target)
  if (textControlSnapshot) return textControlSnapshot
  return getRangeSelectionSnapshot(target)
}
```

2. **处理 Input/Textarea 选择**（`src/shared/selection.ts:170-198`）
3. **处理 Range 选择**（`src/shared/selection.ts:200-223`）
4. **获取周围上下文**（`src/shared/selection.ts:20-42`）：
```typescript
function getSurroundingBlock(range: Range): string | undefined {
  let node: Node | null = range.commonAncestorContainer
  while (node instanceof Element) {
    if (BLOCK_TAGS.has(node.tagName)) {
      const text = node.textContent?.trim() || ""
      if (text.length > MAX_SURROUND_LENGTH) {
        return text.slice(0, MAX_SURROUND_LENGTH) + "..."
      }
      return text
    }
    node = node.parentElement
  }
}
```

#### prompt.ts - 提示词构建

**文件位置**：`src/shared/prompt.ts`

**核心功能**：

1. **解析动作模板**（`src/shared/prompt.ts:3-10`）：
```typescript
export function resolveActionTemplate(template: string, context: SelectionContext, settings: ExtensionSettings): string {
  return template.replaceAll("{text}", context.text)
}
```

2. **格式化自由输入提示**（`src/shared/prompt.ts:12-14`）：
```typescript
export function formatFreeInputPrompt(input: string, text: string): string {
  return `帮我${input}「${text}」`
}
```

3. **验证占位符**（`src/shared/prompt.ts:98-100`）：
```typescript
export function hasTextPlaceholder(template: string): boolean {
  return template.includes("{text}")
}
```

4. **构建上下文系统消息**（`src/shared/prompt.ts:16-96`）：
   - 角色定义
   - 行为准则
   - 输出格式要求
   - 语言偏好
   - 页面上下文信息（标题、URL、描述）
   - 用户选区内容
   - 所在段落上下文

#### errors.ts - 错误处理

**文件位置**：`src/shared/errors.ts`

```typescript
// 自定义错误类
export class AppError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = "AppError"
  }
}

// 获取错误消息
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return ERROR_MESSAGES.UNKNOWN_ERROR
}

// 格式化 API 错误
export function formatApiError(status: number, body: string): string {
  return `${ERROR_MESSAGES.INVALID_RESPONSE} (${status})：${body || ERROR_MESSAGES.UNKNOWN_ERROR}`
}
```

#### ui/ - UI 相关

##### tokens.ts - 设计令牌

**文件位置**：`src/shared/ui/tokens.ts`

**定义内容**：
- 颜色系统（light/dark 主题）
- 字体系统
- 间距系统（uiSpace）
- 圆角系统（uiRadius）
- 阴影系统（uiShadow）
- 动画系统（uiMotion）
- 层级系统（uiLayer）
- 布局常量（uiLayout）

##### theme.ts - 主题 Hook

**文件位置**：`src/shared/ui/theme.ts`

```typescript
export function useUiThemeName(): UiThemeName {
  // 1. 获取设置中的主题偏好
  // 2. 如果是 "auto"，检测系统主题
  // 3. 监听系统主题变化
  // 4. 监听 storage 变化
  // 5. 返回当前主题名称
}

export function useUiTheme() {
  const themeName = useUiThemeName()
  return uiThemes[themeName]
}
```

---

## 4. 关键代码解读

### 4.1 选择检测和工具栏定位逻辑

**选择检测流程**（`src/contents/hooks/useSelectionDetection.ts`）：

```
用户在页面上选择文本
    │
    ▼
触发 pointerup / selectionchange / keyup 事件
    │
    ▼
检查是否在扩展 UI 内部（isInsideExtensionEvent）
    │
    ├── 是 → 忽略
    │
    └── 否 → 使用 requestAnimationFrame 优化
         │
         ▼
    getSelectionSnapshot() 获取选择快照
         │
         ▼
    计算锚点位置（基于最后一个文本矩形）
         │
         ▼
    触发 onSelectionChange 回调
         │
         ▼
    显示 SelectionToolbar
```

**关键代码**（`src/contents/hooks/useSelectionDetection.ts:30-90`）：
```typescript
const updateSelection = useCallback((event?: Event) => {
  if (rafIdRef.current != null) {
    window.cancelAnimationFrame(rafIdRef.current)
  }
  
  rafIdRef.current = window.requestAnimationFrame(() => {
    rafIdRef.current = null
    
    // 1. 检查扩展 UI 焦点
    if (isExtensionUiFocused(extensionRootRef.current)) return
    
    // 2. 检查扩展 UI 内选择
    if (hasSelectionInsideExtensionUi(extensionRootRef.current)) return
    
    // 3. 捕获鼠标位置
    if (event instanceof MouseEvent) {
      lastMouseRef.current = { x: event.clientX, y: event.clientY }
    }
    
    // 4. 获取选择快照
    const snapshot = getSelectionSnapshot(target)
    if (!snapshot) {
      onSelectionChange(null, null)
      return
    }
    
    // 5. 计算锚点
    let anchor = snapshot.anchor
    if (!anchor && event instanceof MouseEvent) {
      anchor = {
        x: event.clientX,
        y: event.clientY,
        rectRight: event.clientX,
        mouseX: event.clientX,
        mouseY: event.clientY
      }
    }
    
    // 6. 触发回调
    onSelectionChange(snapshot.context, anchor)
  })
}, [extensionRootRef, onSelectionChange])
```

### 4.2 消息传递机制

**内容脚本 → 后台脚本的通信**：

1. **流式请求**（使用 Port 长连接）：
```typescript
// src/shared/messaging.ts
const port = chrome.runtime.connect({ name: MESSAGE_TYPES.STREAM_PORT_NAME })
port.postMessage({
  type: MESSAGE_TYPES.CHAT_STREAM_START,
  payload: { messages }
})
port.onMessage.addListener((event: ChatStreamEvent) => {
  // 处理 "started", "chunk", "completed", "failed" 事件
})
```

2. **一次性请求**（使用 sendMessage）：
```typescript
// src/options/index.tsx
chrome.runtime.sendMessage(
  {
    type: MESSAGE_TYPES.API_TEST_REQUEST,
    payload: { apiBaseUrl, apiKey, model }
  },
  (response: ApiTestResponse | undefined) => {
    // 处理响应
  }
)
```

**后台脚本的消息处理**（`src/background/index.ts`）：

```typescript
// 流式连接处理
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== MESSAGE_TYPES.STREAM_PORT_NAME) return
  
  port.onMessage.addListener((request: ChatStreamRequest) => {
    if (request.type === MESSAGE_TYPES.CHAT_STREAM_CANCEL) {
      abortController?.abort()
      return
    }
    
    if (request.type === MESSAGE_TYPES.CHAT_STREAM_START) {
      void streamOpenAiCompatible(request.payload.messages, abortController.signal, (event) => {
        port.postMessage(event)
      })
    }
  })
})

// API 测试处理
chrome.runtime.onMessage.addListener((request: ApiTestRequest, _sender, sendResponse) => {
  if (request?.type !== MESSAGE_TYPES.API_TEST_REQUEST) return false
  
  // 执行测试
  fetch(`${baseUrl}/chat/completions`, { ... })
    .then((response) => sendResponse({ success: true, latencyMs }))
    .catch((error) => sendResponse({ success: false, error }))
  
  return true // 表示异步响应
})
```

### 4.3 API 调用流程

**完整流程**（`src/background/index.ts:83-240`）：

```
Content Script 发送消息
    │
    ▼
Background 接收消息，创建 AbortController
    │
    ▼
读取 Settings，获取激活的 ModelService
    │
    ▼
验证 API Key、Base URL、Model
    │
    ▼
构建请求体：
{
  model: activeService.model,
  stream: true,
  max_tokens: activeService.modelParams.maxTokens,
  temperature: activeService.modelParams.temperature,
  messages: messages.map(...)
}
    │
    ▼
fetch(`${apiBaseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  },
  body: JSON.stringify(requestBody)
})
    │
    ▼
处理流式响应：
- 使用 TextDecoder 解码
- 按 "\n\n" 分割事件
- 解析 "data:" 行
- 提取 content 和 reasoning_content
- 发送 "chunk" 事件到 Content Script
    │
    ▼
发送 "completed" 或 "failed" 事件
```

### 4.4 状态管理

**对话状态管理**（`src/contents/hooks/useChatState.ts`）：

```typescript
interface ChatRequestState =
  | { status: "idle" }
  | { status: "streaming"; assistantMessageId: string }
  | { status: "cancelled"; assistantMessageId: string }
  | { status: "failed"; assistantMessageId: string; error: string }
```

**状态转换图**：
```
idle ──(sendPrompt)──→ streaming
  │                        │
  │                        ├──(chunk)──→ 更新消息内容
  │                        │
  │                        ├──(completed)──→ idle
  │                        │
  │                        ├──(cancelled)──→ cancelled
  │                        │
  │                        └──(failed)──→ failed
  │
  └──(stopStreaming)──→ cancelled
```

**设置状态管理**：
- 存储位置：`chrome.storage.sync`
- 键名：`aiction:settings`
- 监听变化：`chrome.storage.onChanged`

### 4.5 Shadow DOM 中的事件处理

**问题**：Shadow DOM 会重新定向事件，`event.target` 可能不是真实目标。

**解决方案**（`src/contents/utils/domUtils.ts:44-50`）：
```typescript
export function isInsideExtensionEvent(event: Event, extensionRoot: HTMLElement | null): boolean {
  // 使用 composedPath() 获取完整的事件路径
  const path = typeof event.composedPath === "function" ? event.composedPath() : []
  return path.some((node) => isInsideExtensionRoot(node, extensionRoot))
}
```

**深度活跃元素遍历**（`src/contents/utils/domUtils.ts:6-17`）：
```typescript
export function getDeepActiveElement(root: Document | ShadowRoot = document): Element | null {
  const activeElement = root.activeElement
  if (!activeElement) return null
  
  // 递归遍历 Shadow Root
  if (activeElement instanceof HTMLElement && activeElement.shadowRoot) {
    return getDeepActiveElement(activeElement.shadowRoot) ?? activeElement
  }
  
  return activeElement
}
```

---

## 5. 技术亮点和设计模式

### 5.1 WXT 框架优势

1. **文件系统路由**：
   - `src/entrypoints/content/` 自动成为 Content Script
   - `src/entrypoints/background.ts` 自动成为 Service Worker
   - `src/entrypoints/options/` 自动成为 Options Page

2. **Shadow DOM 封装**：
   - 使用 `createShadowRootUi` 创建 Shadow DOM 隔离样式
   - 避免与页面样式冲突

3. **热重载**：
   - `npm run dev` 支持实时预览

### 5.2 React Hooks 状态管理

**模式**：使用自定义 Hooks 封装复杂逻辑

```typescript
// 分离关注点
useToolbarState()   // 工具栏状态
useChatState()      // 聊天状态
useSelectionDetection()  // 选择检测
```

**优势**：
- 逻辑复用
- 易于测试
- 清晰的状态边界

### 5.3 消息传递模式

**流式传输**：使用 Port 长连接处理 AI 流式响应

```
Content Script ←── Port 长连接 ──→ Background
         │                           │
         │  "started"               │
         │  "chunk" (多次)          │
         │  "completed"             │
         └───────────────────────────┘
```

**一次性请求**：使用 sendMessage 处理简单操作

### 5.4 Shadow DOM 隔离

**关键实践**：
1. 使用 `data-aiction-root="true"` 标记扩展根元素
2. 使用 `event.composedPath()` 过滤事件
3. 使用 `getDeepActiveElement()` 遍历 Shadow Root

### 5.5 类型安全

**TypeScript 优势**：
- 所有消息类型定义明确
- 设置结构有完整类型
- 编译时捕获错误

**示例**（`src/shared/types.ts`）：
```typescript
export type ChatStreamEvent =
  | ChatStreamStartedEvent
  | ChatStreamChunkEvent
  | ChatStreamCompletedEvent
  | ChatStreamCancelledEvent
  | ChatStreamFailedEvent
```

---

## 6. 开发者指南

### 6.1 如何修改和添加新功能

#### 添加新的 AI 动作

1. **编辑默认动作**（`src/shared/defaults.ts`）：
```typescript
export const DEFAULT_ACTIONS: ActionTemplate[] = [
  {
    id: "explain",
    label: "解释",
    template: "帮我解释选中内容「{text}」"
  },
  // 添加新动作
  {
    id: "summarize",
    label: "总结",
    template: "请总结以下内容的要点：\n{text}"
  }
]
```

2. **或者通过 UI 添加**：
   - 打开扩展设置
   - 进入"动作指令"选项卡
   - 点击"新增动作"
   - 填写名称和模板（必须包含 `{text}` 占位符）

#### 修改 UI 样式

1. **修改设计令牌**（`src/shared/ui/tokens.ts`）：
```typescript
export const uiThemes: Record<UiThemeName, UiTheme> = {
  light: {
    bg: {
      page: "#F5F5F7",
      // ...
    }
  }
}
```

2. **修改组件样式**：
   - 使用 `useUiTheme()` Hook 获取当前主题
   - 使用 `createButtonStyle()` 等工厂函数

#### 添加新的消息类型

1. **定义类型**（`src/shared/types.ts`）：
```typescript
export interface NewMessageType {
  type: "AICTION_NEW_TYPE"
  payload: { /* ... */ }
}
```

2. **添加常量**（`src/shared/constants.ts`）：
```typescript
export const MESSAGE_TYPES = {
  // ...
  NEW_TYPE: "AICTION_NEW_TYPE"
} as const
```

3. **处理消息**（`src/background/index.ts`）：
```typescript
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type !== MESSAGE_TYPES.NEW_TYPE) return false
  // 处理逻辑
  return true
})
```

### 6.2 如何调试

#### 调试 Content Script

1. **重新加载扩展**：
   - 修改代码后运行 `npm run build`
   - 在 `chrome://extensions` 点击"重新加载"

2. **刷新目标页面**：
   - Content Script 变更需要刷新页面
   - 如果还不行，关闭并重新打开标签页

3. **查看日志**：
   - 在目标页面的 DevTools Console 中查看

#### 调试 Background Service Worker

1. **打开 Service Worker DevTools**：
   - 在 `chrome://extensions` 找到扩展
   - 点击"Service Worker"链接

2. **查看网络请求**：
   - 在 Network 面板查看 API 调用

3. **断点调试**：
   - 在 Sources 面板设置断点

#### 调试 Options Page

1. **打开选项页 DevTools**：
   - 右键点击选项页 → 检查

2. **查看存储**：
   - Application → Storage → Local Storage
   - Application → Storage → Sync Storage

### 6.3 构建和部署流程

#### 开发流程

```bash
# 1. 启动开发服务器（自动监听文件变化）
npm run dev

# 2. 在 Chrome 中加载未打包的扩展
# chrome://extensions → 加载已解压的扩展程序 → 选择 build/chrome-mv3-dev 目录

# 3. 修改代码，查看自动更新
```

#### 生产构建

```bash
# 1. 类型检查
npm run typecheck

# 2. 构建
npm run build

# 3. 打包
npm run package

# 4. 在 Chrome 中加载 build/chrome-mv3-prod 目录
```

#### 验证步骤

1. **扩展重新加载**：
   - 在 `chrome://extensions` 点击"重新加载"

2. **页面刷新**：
   - 刷新目标网页以加载新的 Content Script

3. **测试功能**：
   - 选择文本，查看工具栏
   - 点击动作，查看对话窗
   - 发送消息，验证 AI 响应

### 6.4 常见问题排查

#### 问题 1：选择文本后工具栏不显示

**可能原因**：
- Content Script 未正确注入
- 选择事件被扩展 UI 过滤
- 扩展上下文已失效

**解决方案**：
1. 重新加载扩展
2. 刷新页面
3. 检查 Console 错误

#### 问题 2：AI 请求失败

**可能原因**：
- API Key 无效
- Base URL 错误
- 模型不存在
- 网络问题

**解决方案**：
1. 在设置中测试连接
2. 检查 Background Service Worker 日志
3. 验证 API 配置

#### 问题 3：流式响应中断

**可能原因**：
- 网络不稳定
- API 限流
- 扩展上下文失效

**解决方案**：
1. 检查网络连接
2. 查看 Background 日志中的错误信息
3. 刷新页面重试

#### 问题 4：样式冲突

**可能原因**：
- 页面 CSS 影响扩展 UI
- Shadow DOM 边界问题

**解决方案**：
1. 检查 Shadow DOM 是否正确隔离
2. 使用更高优先级的 CSS 选择器
3. 避免使用 `!important`

---

## 7. 代码示例和流程图

### 7.1 用户选择文本到 AI 响应的完整流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    完整交互流程                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户操作                Content Script              Background  │
│     │                        │                          │       │
│     │ 1. 选择文本            │                          │       │
│     ├───────────────────────→│                          │       │
│     │                        │                          │       │
│     │                   2. 检测选择                     │       │
│     │                   3. 计算锚点                     │       │
│     │                   4. 显示触发按钮                 │       │
│     │                        │                          │       │
│     │ 5. 悬停触发按钮        │                          │       │
│     ├───────────────────────→│                          │       │
│     │                        │                          │       │
│     │                   6. 展开环形菜单                 │       │
│     │                        │                          │       │
│     │ 7. 点击"解释"动作      │                          │       │
│     ├───────────────────────→│                          │       │
│     │                        │                          │       │
│     │                   8. 打开对话窗                   │       │
│     │                   9. 构建 Prompt                  │       │
│     │                  10. 发送消息                     │       │
│     │                        ├─────────────────────────→│       │
│     │                        │                         │       │
│     │                        │                   11. 读取设置   │
│     │                        │                   12. 调用 API   │
│     │                        │                   13. 流式响应   │
│     │                        │←─────────────────────────┤       │
│     │                        │                          │       │
│     │                  14. 更新消息流                   │       │
│     │                  15. 显示思考块                   │       │
│     │                        │                          │       │
│     │ 16. 输入后续问题       │                          │       │
│     ├───────────────────────→│                          │       │
│     │                        │                          │       │
│     │                  17. 发送后续消息                 │       │
│     │                        ├─────────────────────────→│       │
│     │                        │                          │       │
│     │                  ... 重复 11-15 ...               │       │
│     │                        │                          │       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 消息传递序列图

```
Content Script                    Port                    Background
     │                              │                          │
     │  chrome.runtime.connect()    │                          │
     ├─────────────────────────────→│                          │
     │                              │                          │
     │  port.postMessage({          │                          │
     │    type: "CHAT_STREAM_START",│                          │
     │    payload: { messages }     │                          │
     │  })                          │                          │
     ├─────────────────────────────→│                          │
     │                              │  onConnect listener      │
     │                              ├─────────────────────────→│
     │                              │                          │
     │                              │  streamOpenAiCompatible()│
     │                              │         │                │
     │                              │         │ fetch()        │
     │                              │         │                │
     │  port.onMessage({            │         │                │
     │    type: "started"           │         │                │
     │  })                          │         │                │
     │←─────────────────────────────┤←─────────────────────────┤
     │                              │         │                │
     │  port.onMessage({            │         │                │
     │    type: "chunk",            │         │                │
     │    content: "Hello"          │         │                │
     │  })                          │         │                │
     │←─────────────────────────────┤←─────────────────────────┤
     │                              │         │                │
     │  ... 多次 chunk ...          │         │                │
     │                              │         │                │
     │  port.onMessage({            │         │                │
     │    type: "completed"         │         │                │
     │  })                          │         │                │
     │←─────────────────────────────┤←─────────────────────────┤
     │                              │                          │
     │  port.disconnect()           │                          │
     ├─────────────────────────────→│                          │
     │                              │  onDisconnect listener   │
     │                              ├─────────────────────────→│
     │                              │                          │
```

### 7.3 状态变化图

```
┌─────────────────────────────────────────────────────────────────┐
│                    工具栏状态变化                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│     用户选择文本                                                │
│         │                                                       │
│         ▼                                                       │
│    ┌─────────┐   用户取消选择    ┌─────────┐                   │
│    │ 隐藏    │←─────────────────→│  隐藏   │                   │
│    └────┬────┘                   └────┬────┘                   │
│         │                             │                         │
│         │ 检测到选择                   │                         │
│         ▼                             │                         │
│    ┌─────────┐                        │                         │
│    │  显示   │                        │                         │
│    └────┬────┘                        │                         │
│         │                             │                         │
│         │ 用户悬停/点击                │                         │
│         ▼                             │                         │
│    ┌─────────┐                        │                         │
│    │ 菜单展开 │                        │                         │
│    └────┬────┘                        │                         │
│         │                             │                         │
│         │ 用户点击动作                 │                         │
│         ▼                             │                         │
│    ┌─────────┐                        │                         │
│    │  隐藏   │────────────────────────┘                         │
│    └─────────┘                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    对话窗状态变化                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│     用户点击动作                                                │
│         │                                                       │
│         ▼                                                       │
│    ┌─────────┐   用户关闭      ┌─────────┐                    │
│    │  关闭   │←───────────────→│  关闭   │                    │
│    └────┬────┘                 └────┬────┘                    │
│         │                           │                          │
│         │ 打开对话窗                 │                          │
│         ▼                           │                          │
│    ┌─────────┐                      │                          │
│    │  打开   │                      │                          │
│    └────┬────┘                      │                          │
│         │                           │                          │
│         │ 发送消息                   │                          │
│         ▼                           │                          │
│    ┌─────────┐                      │                          │
│    │ 流式中  │                      │                          │
│    └────┬────┘                      │                          │
│         │                           │                          │
│         ├── 收到 chunk ──→ 更新内容  │                          │
│         │                           │                          │
│         ├── 完成 ──→ 返回打开状态    │                          │
│         │                           │                          │
│         ├── 失败 ──→ 显示错误        │                          │
│         │                           │                          │
│         └── 取消 ──→ 显示已取消      │                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 附录：关键文件索引

| 文件路径 | 行号范围 | 描述 |
|----------|----------|------|
| `src/contents/main.tsx` | 1-167 | Content Script 入口 |
| `src/contents/components/SelectionToolbar.tsx` | 1-175 | 触发按钮定位 + 菜单渲染入口 |
| `src/contents/components/ExplodedActionMenu.tsx` | 1-191 | 环形展开菜单 |
| `src/contents/components/PillActionMenu.tsx` | 1-127 | 胶囊工具栏菜单 |
| `src/contents/components/UnifiedPanel.tsx` | 1-556 | 对话窗 |
| `src/contents/hooks/useToolbarState.ts` | 1-90 | 工具栏状态 Hook |
| `src/contents/hooks/useChatState.ts` | 1-218 | 聊天状态 Hook |
| `src/contents/hooks/useSelectionDetection.ts` | 1-180 | 选择检测 Hook |
| `src/contents/utils/domUtils.ts` | 1-113 | DOM 工具函数 |
| `src/background/index.ts` | 1-422 | Background 消息处理器 |
| `src/options/index.tsx` | 1-1479 | 选项页 |
| `src/options/ConfirmDialog.tsx` | 1-106 | 确认对话框 |
| `src/shared/types.ts` | 1-157 | 类型定义 |
| `src/shared/constants.ts` | 1-53 | 常量定义 |
| `src/shared/defaults.ts` | 1-52 | 默认值 |
| `src/shared/storage.ts` | 1-124 | 存储封装 |
| `src/shared/messaging.ts` | 1-113 | 消息传递 |
| `src/shared/selection.ts` | 1-240 | 选择逻辑 |
| `src/shared/prompt.ts` | 1-100 | 提示词构建 |
| `src/shared/errors.ts` | 1-52 | 错误处理 |
| `src/shared/ui/tokens.ts` | 1-216 | 设计令牌 |
| `src/shared/ui/theme.ts` | 1-84 | 主题 Hook |
| `src/shared/ui/styles.ts` | 1-134 | 样式工厂函数 |
| `src/shared/ui/icons.tsx` | 1-26 | BrandIcon 组件 |
| `popup.tsx` | 1-488 | Popup 窗口 |
| `background.ts` | 1-3 | Background 入口 |
| `options.tsx` | 1-3 | Options 入口 |

---

**文档版本**：1.1  
**最后更新**：2026-04-24  
**维护者**：AIction 开发团队
