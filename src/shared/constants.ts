import { i18nStore } from "@/shared/i18n/index"

// Message type constants
export const MESSAGE_TYPES = {
  CHAT_STREAM_START: "AICTION_CHAT_STREAM_START",
  CHAT_STREAM_CANCEL: "AICTION_CHAT_STREAM_CANCEL",
  STREAM_PORT_NAME: "AICTION_STREAM",
  API_TEST_REQUEST: "AICTION_API_TEST_REQUEST",
  FETCH_MODELS_REQUEST: "AICTION_FETCH_MODELS_REQUEST",
  MODELS_DEV_REQUEST: "AICTION_MODELS_DEV_REQUEST",
  OPENROUTER_MODELS_REQUEST: "AICTION_OPENROUTER_MODELS_REQUEST",
  TTS_SYNTHESIZE_REQUEST: "AICTION_TTS_SYNTHESIZE_REQUEST",
  /** Popup → content script：在当前页面直接打开一个空的对话面板（不划词也能提问） */
  OPEN_CHAT: "AICTION_OPEN_CHAT"
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
  get NO_API_KEY() { return i18nStore.t("errors.noApiKey") },
  get STREAM_DISCONNECTED() { return i18nStore.t("errors.streamDisconnected") },
  get REQUEST_FAILED() { return i18nStore.t("errors.requestFailed") },
  get UNKNOWN_ERROR() { return i18nStore.t("errors.unknownError") },
  get INVALID_RESPONSE() { return i18nStore.t("errors.invalidResponse") },
  get NO_READABLE_STREAM() { return i18nStore.t("errors.noReadableStream") },
  get NO_VALID_CONTENT() { return i18nStore.t("errors.noValidContent") },
  get SETTINGS_SAVE_FAILED() { return i18nStore.t("errors.settingsSaveFailed") },
  get API_TEST_MISSING_FIELDS() { return i18nStore.t("errors.apiTestMissingFields") },
  get FETCH_MODELS_FAILED() { return i18nStore.t("errors.fetchModelsFailed") },
  get FETCH_MODELS_MISSING_URL() { return i18nStore.t("errors.fetchModelsMissingUrl") },
  get FETCH_MODELS_EMPTY() { return i18nStore.t("errors.fetchModelsEmpty") },
  get FETCH_MODELS_EMPTY_BODY() { return i18nStore.t("errors.fetchModelsEmptyBody") },
  get FETCH_MODELS_INVALID_JSON() { return i18nStore.t("errors.fetchModelsInvalidJson") },
  get CONTEXT_INVALIDATED() { return i18nStore.t("errors.contextInvalidated") },
  get REQUEST_TIMEOUT() { return i18nStore.t("errors.requestTimeout") },
  get TTS_SYNTH_FAILED() { return i18nStore.t("errors.ttsSynthFailed") },
  get TTS_NO_TEXT() { return i18nStore.t("errors.ttsNoText") }
} as const

// UI messages
export const UI_MESSAGES = {
  get LOADING() { return i18nStore.t("ui.loading") },
  get EMPTY_CHAT() { return i18nStore.t("ui.emptyChat") },
  get SAVE_SUCCESS() { return i18nStore.t("ui.saveSuccess") }
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

/**
 * Options 页的入口标记（chrome.storage.local）：
 * Popup 跳转前写入，Options 页读取后清除，用于区分「从 Popup 进来」还是「其它入口」。
 */
export const OPTIONS_ENTRY_STORAGE_KEY = "aiction:optionsEntry"
