export type ThemePreference = "auto" | "light" | "dark"

export type LanguagePreference = "system" | "en" | "zh_CN"

export interface ActionTemplate {
  id: string
  label: string
  template: string
  enabled?: boolean
  icon?: string
}

export type QuickActionType = "copyToClipboard" | "speakText"

export interface QuickAction {
  id: string
  type: QuickActionType
  icon: string
  enabled: boolean
}

export type TtsProvider = "system" | "edge"

export interface TtsSettings {
  /** 语音合成引擎："edge" 为 Edge 在线语音（默认），"system" 为浏览器系统语音 */
  provider: TtsProvider
  /** Edge 语音名称，如 "zh-CN-XiaoxiaoNeural" */
  edgeVoice: string
  /** 语速倍率，0.5–2.0，1 为正常语速 */
  rate: number
  /** 按选中文本的语言自动切换语音（默认开启） */
  autoLocale: boolean
}

/**
 * 模型参数：所有项初始为 undefined（未填充）。
 * - 未填充的参数在请求时不发送（忽略，跟随模型默认）
 * - 用户显式填充后按填写值发送，系统不覆盖
 */
export interface ModelParams {
  /** 最大输出 token 数 */
  maxTokens?: number
  /** 上下文窗口上限（字符数）：输入总长超出时自动裁剪，未填充 = 不裁剪 */
  contextSize?: number
  /** 思考模式：true = 启用；false = 禁用；未填充 = 跟随模型默认 */
  reasoning?: boolean
  /** 思考力度档位（随请求发送 reasoning_effort） */
  reasoningEffort?: "low" | "medium" | "high"
  /** 结构化输出：true = 启用；未填充 = 忽略 */
  structuredOutputs?: boolean
}

export interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  model: string
  apiBaseUrl?: string
  modelParams: ModelParams
  modelsDevId?: string
}

export interface ExtensionSettings {
  providers: ProviderConfig[]
  activeProviderId: string
  theme: ThemePreference
  language: LanguagePreference
  actions: ActionTemplate[]
  quickActions: QuickAction[]
  tts: TtsSettings
  telemetryEnabled: boolean
  /** 系统提示词模板，支持 {selection} {pageTitle} {pageUrl} {metaDescription} {surround} 占位符；空白则回退默认模板 */
  systemPrompt: string
}

export interface SelectionContext {
  text: string
  title: string
  url: string
  surround?: string
  meta?: {
    description?: string
  }
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  reasoning_content?: string
}

export interface ChatStreamStartRequest {
  type: "AICTION_CHAT_STREAM_START"
  payload: {
    messages: ChatMessage[]
  }
}

export interface ChatStreamCancelRequest {
  type: "AICTION_CHAT_STREAM_CANCEL"
}

export interface ChatStreamStartedEvent {
  type: "started"
}

export interface ChatStreamChunkEvent {
  type: "chunk"
  content: string
  reasoning_content?: string
}

export interface ChatStreamCompletedEvent {
  type: "completed"
}

export interface ChatStreamCancelledEvent {
  type: "cancelled"
}

export interface ChatStreamFailedEvent {
  type: "failed"
  error: string
}

export type ChatStreamRequest = ChatStreamStartRequest | ChatStreamCancelRequest

export type ChatStreamEvent =
  | ChatStreamStartedEvent
  | ChatStreamChunkEvent
  | ChatStreamCompletedEvent
  | ChatStreamCancelledEvent
  | ChatStreamFailedEvent

// Selection types
export interface SelectionAnchor {
  x: number
  y: number
  rectRight: number
  mouseX: number
  mouseY: number
}

export interface SelectionSnapshot {
  context: SelectionContext
  anchor: SelectionAnchor | null
}

// Chat request state types
export type ChatRequestStatus = "idle" | "streaming" | "cancelled" | "failed"

export type ChatRequestState =
  | { status: "idle" }
  | { status: "streaming"; assistantMessageId: string }
  | { status: "cancelled"; assistantMessageId: string }
  | { status: "failed"; assistantMessageId: string; error: string }

// Stream handler options
export interface StreamChatOptions {
  onEvent: (event: ChatStreamEvent) => void
  signal?: AbortSignal
}

// API test connection types
export interface ApiTestRequest {
  type: "AICTION_API_TEST_REQUEST"
  payload: {
    apiBaseUrl: string
    apiKey: string
    model: string
    modelsDevId?: string
  }
}

export interface ApiTestResponse {
  success: boolean
  error?: string
  latencyMs?: number
}

// Fetch models types
export interface FetchModelsRequest {
  type: "AICTION_FETCH_MODELS_REQUEST"
  payload: {
    apiBaseUrl: string
    apiKey: string
  }
}

export interface FetchModelsResponse {
  success: boolean
  models?: string[]
  error?: string
}

// User icon data stored in chrome.storage.sync
export interface UserIconData {
  body: string
  width?: number
  height?: number
}

// Edge TTS synthesis request/response
export interface TtsSynthesizeRequest {
  type: "AICTION_TTS_SYNTHESIZE_REQUEST"
  payload: {
    text: string
    voice: string
    /** 语速倍率 0.5–2.0 */
    rate: number
  }
}

export interface TtsSynthesizeResponse {
  success: boolean
  /** MP3 音频的 base64 编码 */
  audioBase64?: string
  /** 音频 MIME 类型，如 "audio/mpeg" */
  contentType?: string
  error?: string
}

// Models.dev cache request/response
export interface ModelsDevRequest {
  type: "AICTION_MODELS_DEV_REQUEST"
}

export interface ModelsDevResponse {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

// OpenRouter models list request/response（智能填充参数的数据源之一）
export interface OpenRouterModelInfo {
  id: string
  name: string
  contextLength?: number
  /** top_provider.max_completion_tokens：该模型最大输出 token 数 */
  maxCompletionTokens?: number
  supportedParameters: string[]
}

export interface OpenRouterModelsRequest {
  type: "AICTION_OPENROUTER_MODELS_REQUEST"
}

export interface OpenRouterModelsResponse {
  success: boolean
  models?: OpenRouterModelInfo[]
  error?: string
}
