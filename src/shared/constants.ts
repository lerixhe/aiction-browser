// Message type constants
export const MESSAGE_TYPES = {
  CHAT_STREAM_START: "AICTION_CHAT_STREAM_START",
  CHAT_STREAM_CANCEL: "AICTION_CHAT_STREAM_CANCEL",
  STREAM_PORT_NAME: "AICTION_STREAM",
  API_TEST_REQUEST: "AICTION_API_TEST_REQUEST",
  FETCH_MODELS_REQUEST: "AICTION_FETCH_MODELS_REQUEST"
} as const

// Stream event types
export const STREAM_EVENTS = {
  STARTED: "started",
  CHUNK: "chunk",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed"
} as const

// Error messages
export const ERROR_MESSAGES = {
  NO_API_KEY: "请先在设置台填写 API Key。",
  STREAM_DISCONNECTED: "流式连接已断开",
  REQUEST_FAILED: "请求失败",
  UNKNOWN_ERROR: "未知错误",
  INVALID_RESPONSE: "AI 服务返回错误",
  NO_READABLE_STREAM: "AI 服务未返回可读取的流。",
  NO_VALID_CONTENT: "AI 未返回有效内容。",
  SETTINGS_SAVE_FAILED: "保存失败",
  API_TEST_MISSING_FIELDS: "请填写 API Base URL、API Key 和 Model 后再测试。",
  FETCH_MODELS_FAILED: "获取模型列表失败",
  FETCH_MODELS_MISSING_URL: "请先填写 API Base URL",
  FETCH_MODELS_EMPTY: "未找到可用模型",
  CONTEXT_INVALIDATED: "扩展上下文已失效，请刷新页面重试。"
} as const

// UI messages
export const UI_MESSAGES = {
  LOADING: "AI 正在生成中...",
  EMPTY_CHAT: "请选择动作，或直接输入一个问题开始对话。",
  SAVE_SUCCESS: "保存成功"
} as const

// CSS selectors
export const SELECTORS = {
  EXTENSION_ROOT: "[data-aiction-root='true']"
} as const

// Default values
export const DEFAULTS = {
  CHAT_PANEL_INITIAL_X: 24,
  CHAT_PANEL_INITIAL_Y: 24,
  TOOLBAR_COLLAPSE_DELAY: 300
} as const
