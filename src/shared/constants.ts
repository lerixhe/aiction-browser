import { i18nStore } from "@/shared/i18n/index"

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
  get CONTEXT_INVALIDATED() { return i18nStore.t("errors.contextInvalidated") }
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
