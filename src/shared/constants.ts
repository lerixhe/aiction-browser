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
  OPEN_CHAT: "AICTION_OPEN_CHAT",
  // ── 账号 / 登录（M1）────────────────────────────────────
  // 常量先落（T0），监听与广播在 T2 实现。
  /** UI → background：发起登录（拉起 identity 授权页） */
  AUTH_SIGN_IN: "AICTION_AUTH_SIGN_IN",
  /** UI → background：登出 */
  AUTH_SIGN_OUT: "AICTION_AUTH_SIGN_OUT",
  /** 任意 → background：读快照（content 冷启动补读；**响应里不得含 token**） */
  AUTH_STATE_REQUEST: "AICTION_AUTH_STATE_REQUEST",
  /** 任意 → background：读权益（`force` 越过 5min TTL） */
  ENTITLEMENTS_REQUEST: "AICTION_ENTITLEMENTS_REQUEST",
  /** background → 任意：快照变更（不落盘的场景走这条；落盘变更靠 storage.onChanged） */
  AUTH_CHANGED: "AICTION_AUTH_CHANGED",
  /**
   * 任意 → background：开设置页并落到指定锚点。
   * 存在的理由：`chrome.runtime.openOptionsPage()` **不支持 hash**，而面板失败态 CTA 必须落到 `#account`。
   */
  OPEN_OPTIONS: "AICTION_OPEN_OPTIONS",
  /**
   * 任意 → background：打开官网页面（定价 / 账单 / 登录）。
   * 存在的理由：`chrome.tabs` **不暴露给 content script**，内容页里的外链必须由 background 代开。
   */
  OPEN_WEB_PAGE: "AICTION_OPEN_WEB_PAGE"
} as const

/**
 * `OPEN_OPTIONS` 允许携带的来源标记（写进 `aiction:optionsEntry`，由 Options 页读完清除）。
 * **必须白名单**：这个值最终会作为埋点属性 `options_opened.entry`，自由文本进埋点是禁止的。
 */
export const OPEN_OPTIONS_ENTRIES = ["chat", "popup", "quota"] as const
export type OpenOptionsEntry = (typeof OPEN_OPTIONS_ENTRIES)[number]

/**
 * `OPEN_WEB_PAGE` 允许的目标：**只接受路由名，不接受 URL**。
 *
 * 传 URL 会把这个消息变成「任意地址打开器」——内容脚本能触达的消息通道不该有这种能力。
 * 实际地址由 background 用 `shared/auth/config.ts` 的 `WEB_BASE` 拼，客户端拿不到也不该拿到它。
 */
export const OPEN_WEB_PAGE_ROUTES = ["login", "pricing", "billing"] as const
export type OpenWebPageRoute = (typeof OPEN_WEB_PAGE_ROUTES)[number]

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
