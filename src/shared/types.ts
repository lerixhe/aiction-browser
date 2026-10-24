import type { ApiErrorDiagnostics, ChatErrorCode } from "@/shared/errors"
import type { Locale } from "@/shared/i18n/registry"
import type { ProviderIdentityProps } from "@/shared/provider-type"

export type ThemePreference = "auto" | "light" | "dark"

/** 界面语言偏好：`"browser"` = 跟随浏览器 UI 语言（自动项），其余为具体 locale */
export type LanguagePreference = "browser" | Locale

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

/**
 * 服务来源：`byok` = 用户自己的 API Key（现有链路）；`official` = 官方托管服务（需登录）。
 * 只在运行时构造，**不写入 `providers[]`**（不可编辑 / 删除 / 导出）。
 */
export type ProviderKind = "byok" | "official"

export interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  model: string
  apiBaseUrl?: string
  modelParams: ModelParams
  modelsDevId?: string
  /** 缺省一律视为 "byok"（老存档零迁移；读取时兜底，不写回默认值） */
  kind?: ProviderKind
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
  /** 官方服务选用的模型（登录后可用）；M1 只做展示，M2 才接入真实链路 */
  officialModel?: string
  /**
   * 是否优先使用官方服务。`undefined` = 跟随会话状态
   * （已登录 / 已领到匿名 device token 才走官方服务；未登录时行为与现状一致），
   * 解析规则收敛在 `shared/provider-resolve.ts`。
   */
  useOfficialService?: boolean
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
    /**
     * 计费主体（契约 §6.1）：只有官方 provider 会把它写成请求头 `X-AIction-Feature`。
     * 由**调用点**填（划词动作 / 面板追问 = `selection_chat`，Popup「在当前页面提问」= `page_qa`），
     * 不放在 body / 路径里：body 会与 AI SDK 的 providerOptions 互扰，路径会扭曲 baseURL 语义。
     */
    feature?: ChatFeature
  }
}

/**
 * 官方对话的计费主体枚举（契约 §6.1，服务端白名单校验）。
 * 自定义动作**不单独开池**：用户建 100 个动作就是 100 个计费主体，额度会碎成一地。
 */
export const CHAT_FEATURES = ["selection_chat", "page_qa"] as const
export type ChatFeature = (typeof CHAT_FEATURES)[number]

export interface ChatStreamCancelRequest {
  type: "AICTION_CHAT_STREAM_CANCEL"
}

export interface ChatStreamStartedEvent {
  type: "started"
  /**
   * 本次请求**实际使用**的 provider 身份（background 是唯一知道真值的地方）。
   *
   * 为什么由 background 回传：官方链路下 content 只看本地设置是猜不出真相的
   *（官方 provider 是运行时构造的，不在 `providers[]` 里）。面板头部要显示正确的模型名，
   *埋点也要有正确的 `provider_type`；两处各写一套判断就是「显示与实际分成两套」的老问题。
   * 旧 background 不带此字段时，content 退回读本地设置。
   */
  provider?: { kind: ProviderKind; name: string; model: string }
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
  /** 失败归因枚举（仅用于埋点，见 docs/ANALYTICS.md §2.5）；旧端可能不带 */
  code?: ChatErrorCode
  /** 失败诊断属性（仅用于埋点，见 docs/ANALYTICS.md §3.10）；旧端可能不带 */
  diagnostics?: ApiErrorDiagnostics
  /** provider 身份（仅用于埋点；只含元信息，**不包含 API Key**）；旧端可能不带 */
  provider?: ProviderIdentityProps
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
  | {
      status: "failed"
      assistantMessageId: string
      error: string
      /** 失败归因（用于面板失败态 CTA，见 `ChatPanel`）；旧端可能不带 */
      code?: ChatErrorCode
    }

// Stream handler options
export interface StreamChatOptions {
  onEvent: (event: ChatStreamEvent) => void
  signal?: AbortSignal
}

/**
 * 「当前实际使用哪个引擎」（background 回答，content 只读展示）。
 * **不得包含任何凭据**：它就是给面板头部写一行模型名用的。
 */
export interface EngineInfo {
  kind: ProviderKind
  name: string
  model: string
}

export interface EngineRequest {
  type: "AICTION_ENGINE_REQUEST"
}

export interface EngineResponse {
  success: boolean
  /** `null` = 没有任何可用引擎（既未登录也没配 BYOK） */
  engine?: EngineInfo | null
  /**
   * 官方引擎是否可用（`OFFICIAL_AI_ENABLED`）。由 background 一处决定，UI 不自己读常量：
   * 常量置 false 回滚时，Popup 的引擎菜单必须跟着不出现「官方服务」，
   * 否则点了会静默回弹（M1 评审 P1-3 的原型）。
   */
  officialAvailable?: boolean
  error?: string
}

// API test connection types
export interface ApiTestRequest {
  type: "AICTION_API_TEST_REQUEST"
  payload: {
    apiBaseUrl: string
    apiKey: string
    model: string
    modelsDevId?: string
    /** 草稿里的模型参数（真假连接的请求会带上，与真实对话同构）；旧版 UI 可能不带 */
    modelParams?: ModelParams
  }
}

export interface ApiTestResponse {
  success: boolean
  error?: string
  /** 首包耗时（收到第一个内容块的 ms）；失败时为总耗时 */
  latencyMs?: number
  /** 首包延迟（仅成功时） */
  ttftMs?: number
  /** 端点的 finishReason（成功时通常是 stopped_after_first_chunk） */
  finishReason?: string
  /** AI SDK 告警：参数被端点忽略 / 不支持等，需要直接告诉用户 */
  warnings?: string[]
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
