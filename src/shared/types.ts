export type ThemePreference = "auto" | "light" | "dark"

export type LanguagePreference = "system" | "en" | "zh_CN"

export interface ActionTemplate {
  id: string
  label: string
  template: string
  enabled?: boolean
  icon?: string
}

export interface ModelParams {
  maxTokens: number
  temperature: number
  topP: number
  presencePenalty: number
  frequencyPenalty: number
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
  telemetryEnabled: boolean
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

// Models.dev cache request/response
export interface ModelsDevRequest {
  type: "AICTION_MODELS_DEV_REQUEST"
}

export interface ModelsDevResponse {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}
