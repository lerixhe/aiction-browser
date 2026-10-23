import type {
  ChatStreamCancelRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ApiTestRequest,
  ApiTestResponse,
  ModelsDevResponse,
  OpenRouterModelsResponse,
  ProviderConfig,
  SelectionContext,
  TtsSynthesizeRequest,
  TtsSynthesizeResponse
} from "@/shared/types"
import { MESSAGE_TYPES, ERROR_MESSAGES, OPEN_OPTIONS_ENTRIES, OPEN_WEB_PAGE_ROUTES, OPTIONS_ENTRY_STORAGE_KEY } from "@/shared/constants"
import { i18nStore } from "@/shared/i18n/index"
import { initBackgroundI18n } from "@/shared/i18n/background"
import {
  formatApiError,
  getErrorMessage,
  getErrorName,
  isAbortError,
  classifyChatError,
  describeApiError,
  sanitizeErrorMessage
} from "@/shared/errors"
import { getActiveProvider, getSettings } from "@/shared/storage"
import { DEFAULT_TTS_SETTINGS } from "@/shared/defaults"
import { buildContextSystemMessage, resolveUILanguageLabel } from "@/shared/prompt"
import { providerIdentityOf, type ProviderIdentityProps } from "@/shared/provider-type"
import { prepareChatRequest, describeCallWarning, type ChatRequestPlan } from "@/shared/chat-stream"
import { fetchModelsDev } from "@/shared/models-dev"
import { fetchOpenRouterModels } from "@/shared/openrouter"
import { getSnapshot, initializeSession, signIn, signOut } from "@/shared/auth/session"
import { WEB_BASE, WEB_ROUTES } from "@/shared/auth/config"
import { getEntitlements } from "@/shared/auth/entitlements"
import type {
  AuthSignInResponse,
  AuthSignOutResponse,
  AuthStateResponse,
  EntitlementsResponse,
  OpenOptionsResponse,
  OpenWebPageResponse
} from "@/shared/auth/types"

import {
  trackBackgroundEvent,
  startBackgroundBatching,
  stopBackgroundBatching,
  consumeFirstTimeFlag,
  type AnalyticsSource
} from "@/shared/analytics"

/** 上次上报活跃的本地日期（YYYY-MM-DD） */
const LAST_ACTIVE_DATE_KEY = "aiction:lastActiveDate"

/**
 * 「测试连接」用的合成上下文：**故意留空**。
 *
 * 测试只验证「这条链路 + 这组参数」能不能跑通，不验证内容质量，
 * 所以不编造选区 / 页面标题 / URL（旧实现塞了 `"connection test"` 与 `example.com`，
 * 那些伪造文本会进 system 消息，属于没必要的假数据）。
 * 留空后走的就是「用户没选中任何东西、直接提问」的真实形态。
 */
const TEST_SELECTION_CONTEXT: SelectionContext = {
  text: "",
  title: "",
  url: ""
}

/** 固定的提问内容：测试只要能拿到第一个 token，具体问什么不重要 */
const TEST_PROMPT = "Hi"

/** 告警最多带/展示几条（避免端点刷屏，也避免事件属性过大） */
const MAX_TEST_WARNINGS = 5

/** 本地日期键：用本地时区，符合「用户的某一天」（UTC 会让东部时区的凌晨算到前一天） */
function localDateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** 同一 SW 生命周期内的去重（跨实例由 storage 里的日期保证） */
let dailyActivePromise: Promise<void> | null = null

/**
 * 每日活跃：service worker 被唤醒的那一天算一次（浏览器启动 / popup / 划词请求等都会唤醒它）。
 * 这是扩展唯一的口径为「日活」的事件，仅上报 version，不携带任何页面信息。
 */
function reportDailyActive(): Promise<void> {
  if (!dailyActivePromise) {
    dailyActivePromise = (async () => {
      try {
        const today = localDateKey()
        const result = await chrome.storage.local.get(LAST_ACTIVE_DATE_KEY)
        if (result[LAST_ACTIVE_DATE_KEY] === today) {
          return
        }
        await chrome.storage.local.set({ [LAST_ACTIVE_DATE_KEY]: today })
        await trackBackgroundEvent("daily_active", {
          version: chrome.runtime.getManifest().version
        })
      } catch {
        // 存储 / 上报失败都不应影响扩展本身
      }
    })()
  }
  return dailyActivePromise
}

/** 从 port 来源页面判断事件来源：PDF 阅读器是扩展页面，其余（content script）算网页 */
function resolvePortSource(port: chrome.runtime.Port): AnalyticsSource {
  const url = port.sender?.tab?.url ?? port.sender?.url ?? ""
  return url.startsWith(chrome.runtime.getURL("pdf-viewer.html")) ? "pdf" : "web"
}

/**
 * 里程碑：首次配置出「真的能用」的 provider（API 测试通过 / 首次对话成功，只算一次）。
 * 只上报结构化枚举与数量，不上报 provider 展示名（自定义名可能是用户填写的文本）。
 */
async function reportProviderConfigured(
  provider: { modelsDevId?: string },
  trigger: "api_test" | "chat",
  providerCount?: number
): Promise<void> {
  const isFirst = await consumeFirstTimeFlag("provider_configured")
  if (!isFirst) {
    return
  }

  const properties: Record<string, unknown> = {
    provider_type: provider.modelsDevId ? "models_dev" : "custom",
    trigger,
    is_first: true
  }
  if (provider.modelsDevId) {
    properties.models_dev_id = provider.modelsDevId
  }
  if (typeof providerCount === "number") {
    properties.provider_count = providerCount
  }

  await trackBackgroundEvent("provider_configured", properties)
}

/** 当前生效 provider 的身份（仅用于失败埋点；只含元信息，不涉及 API Key） */
async function currentProviderIdentity(): Promise<ProviderIdentityProps> {
  try {
    const settings = await getSettings()
    return providerIdentityOf(getActiveProvider(settings))
  } catch {
    return { provider_type: "none", is_custom_endpoint: false, has_api_key: false }
  }
}

async function streamChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  signal: AbortSignal,
  source: AnalyticsSource,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const { streamText } = await import("ai")

  const settings = await getSettings()
  const activeService = getActiveProvider(settings)
  const identity = providerIdentityOf(activeService)

  if (!activeService?.apiKey.trim()) {
    // 关键流失点：装了但没配好 provider 就触发动作（详情见 docs/ANALYTICS.md §5 P0）
    void trackBackgroundEvent("action_triggered_without_provider", { source })
    onEvent({ type: "failed", error: ERROR_MESSAGES.NO_API_KEY, code: "no_api_key", provider: identity })
    return
  }

  onEvent({ type: "started" })

  if (!activeService.modelsDevId && !activeService.apiBaseUrl?.trim()) {
    onEvent({
      type: "failed",
      error: ERROR_MESSAGES.API_TEST_MISSING_FIELDS,
      code: "missing_config",
      provider: identity
    })
    return
  }

  const modelsDevData = await fetchModelsDev()

  // 请求构造与「测试连接」共用同一处（src/shared/chat-stream.ts），
  // 保证测试覆盖的就是真实链路的参数与流式行为。
  const { streamParams } = prepareChatRequest({
    provider: activeService,
    messages,
    modelsDevData,
    signal
  })

  let hasContent = false

  const consumeStream = async (): Promise<void> => {
    const result = streamText(streamParams)

    for await (const part of result.fullStream) {
      if (signal.aborted) {
        throw new DOMException("aborted", "AbortError")
      }

      switch (part.type) {
        case "text-delta":
          hasContent = true
          onEvent({ type: "chunk", content: part.text })
          break
        case "reasoning-delta":
          hasContent = true
          onEvent({ type: "chunk", content: "", reasoning_content: part.text })
          break
        case "error":
          throw part.error
      }
    }
  }

  // 不做事后重试：端点拒绝某个参数（如 max_tokens 超过端点上限、不支持关闭思考）时
  // 直接报错，让用户看到真正的原因并去设置里改。静默“去掉参数重试”会滑两个坑：
  // 1) 请求变成两次，用户看到的是“莫名其妙变慢”；2) 错误的配置永远不会被暴露。
  await consumeStream()

  if (!hasContent) {
    onEvent({
      type: "failed",
      error: ERROR_MESSAGES.NO_VALID_CONTENT,
      code: "no_content",
      provider: identity
    })
    return
  }

  void reportProviderConfigured(activeService, "chat", settings.providers.length)
  onEvent({ type: "completed" })
}

/**
 * 右键菜单：标题是本地化文案，而 Chrome **不会更新已创建菜单的标题**，
 * 所以「安装/更新」与「语言变化」都要重建一次（见 `initBackgroundI18n` 的 onLocaleChange）。
 */
function syncContextMenus(): void {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "open-pdf-with-aiction",
        title: i18nStore.t("background.openPdfWithAIction"),
        contexts: ["page", "frame"],
        documentUrlPatterns: ["*://*/*.pdf", "*://*/*.PDF", "file://*/*.pdf", "file://*/*.PDF"]
      })
    })
  } catch {
    // 没有 contextMenus 权限 / 上下文失效：菜单不是核心功能，静默跳过
  }
}

export default defineBackground(() => {
  // 每日活跃：SW 被唤醒即算（顶层 + onStartup 双保险，由 storage 里的日期去重）
  void reportDailyActive()

  // background 的 locale：`ERROR_MESSAGES.*` 与右键菜单标题都走 i18nStore，
  // 而 React 的 I18nRoot 覆盖不到 service worker，不初始化就永远是英文。
  const i18nReady = initBackgroundI18n({ onLocaleChange: () => syncContextMenus() })

  // 会话初始化（SPEC §5.2）：先信本地快照，token 的补齐在后台跑、不阻塞消息响应。
  // 失败也不能影响 SW 启动——按「未登录 / 匿名未配置」继续跑即可。
  void initializeSession().catch((error: unknown) => {
    console.warn("[auth] 会话初始化失败（按未登录处理）", getErrorMessage(error))
  })

  chrome.runtime.onStartup.addListener(() => {
    void reportDailyActive()
  })

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== MESSAGE_TYPES.STREAM_PORT_NAME) {
      return
    }

    let abortController: AbortController | null = null

    port.onDisconnect.addListener(() => {
      abortController?.abort()
    })

    port.onMessage.addListener((request: ChatStreamRequest) => {
      if (request?.type === MESSAGE_TYPES.CHAT_STREAM_CANCEL) {
        abortController?.abort()
        return
      }

      if (request?.type !== MESSAGE_TYPES.CHAT_STREAM_START) {
        return
      }

      abortController?.abort()
      const controller = new AbortController()
      abortController = controller

      void streamChat(request.payload.messages, controller.signal, resolvePortSource(port), (event) => {
        try {
          port.postMessage(event)
        } catch {
          return
        }
      }).catch(async (error: unknown) => {
        if (controller.signal.aborted && isAbortError(error)) {
          try {
            port.postMessage({ type: "cancelled" } satisfies ChatStreamEvent)
          } catch {
            return
          }
          return
        }

        const message = getErrorMessage(error)
        try {
          port.postMessage({
            type: "failed",
            error: `${ERROR_MESSAGES.REQUEST_FAILED}: ${message}`,
            code: classifyChatError(error),
            diagnostics: describeApiError(error),
            provider: await currentProviderIdentity()
          } satisfies ChatStreamEvent)
        } catch {
          return
        }
      })
    })
  })

  startBackgroundBatching()

  chrome.runtime.onInstalled.addListener((details) => {
    const version = chrome.runtime.getManifest().version
    if (details.reason === "install") {
      void trackBackgroundEvent("extension_installed", { version })
    } else if (details.reason === "update") {
      void trackBackgroundEvent("extension_updated", {
        version,
        previous_version: details.previousVersion
      })
    }

    // 菜单标题是本地化文案：先等 locale 就绪，否则首次安装会建成英文菜单（且之后不会自动更新）
    void i18nReady.finally(syncContextMenus)
  })

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "open-pdf-with-aiction") {
      const pdfUrl = info.pageUrl || info.frameUrl || tab?.url
      if (pdfUrl) {
        void trackBackgroundEvent("pdf_viewer_opened", {
          scheme: pdfUrl.startsWith("file:") ? "file" : "http"
        })
        const encodedUrl = encodeURIComponent(pdfUrl)
        chrome.tabs.create({
          url: chrome.runtime.getURL(`/pdf-viewer.html?url=${encodedUrl}`)
        })
      }
    }
  })

  chrome.runtime.onSuspend?.addListener?.(() => {
    stopBackgroundBatching()
  })

  chrome.runtime.onMessage.addListener((request: TtsSynthesizeRequest, _sender, sendResponse) => {
    if (request?.type !== MESSAGE_TYPES.TTS_SYNTHESIZE_REQUEST) {
      return false
    }

    const { text, voice, rate } = request.payload ?? { text: "", voice: "", rate: 1 }

    if (!text?.trim()) {
      sendResponse({ success: false, error: ERROR_MESSAGES.TTS_NO_TEXT } satisfies TtsSynthesizeResponse)
      return false
    }

    const doSynthesize = async () => {
      try {
        // 动态 import，保持 service worker 启动轻量
        const { synthesizeEdgeTts } = await import("@/shared/edge-tts")
        const result = await synthesizeEdgeTts(
          text,
          voice?.trim() || DEFAULT_TTS_SETTINGS.edgeVoice,
          typeof rate === "number" && rate >= 0.5 && rate <= 2 ? rate : DEFAULT_TTS_SETTINGS.rate
        )
        void trackBackgroundEvent("edge_tts_synthesize", { success: true, bytes: result.audioBase64.length })
        sendResponse({ success: true, ...result } satisfies TtsSynthesizeResponse)
      } catch (error: unknown) {
        // 不上报错误原文（可能含 WebSocket URL / 语音令牌），只给类名 + 脱敏消息
        void trackBackgroundEvent("edge_tts_synthesize", {
          success: false,
          error_name: getErrorName(error),
          error_detail: sanitizeErrorMessage(getErrorMessage(error))
        })
        sendResponse({
          success: false,
          error: `${ERROR_MESSAGES.TTS_SYNTH_FAILED}: ${getErrorMessage(error)}`
        } satisfies TtsSynthesizeResponse)
      }
    }

    void doSynthesize()
    return true
  })

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== MESSAGE_TYPES.MODELS_DEV_REQUEST) {
      return false
    }

    fetchModelsDev()
      .then((data) => {
        sendResponse({ success: true, data } satisfies ModelsDevResponse)
      })
      .catch((error: unknown) => {
        sendResponse({
          success: false,
          error: getErrorMessage(error)
        } satisfies ModelsDevResponse)
      })

    return true
  })

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== MESSAGE_TYPES.OPENROUTER_MODELS_REQUEST) {
      return false
    }

    fetchOpenRouterModels()
      .then((models) => {
        sendResponse({ success: true, models } satisfies OpenRouterModelsResponse)
      })
      .catch((error: unknown) => {
        sendResponse({
          success: false,
          error: getErrorMessage(error)
        } satisfies OpenRouterModelsResponse)
      })

    return true
  })

  chrome.runtime.onMessage.addListener((request: ApiTestRequest, _sender, sendResponse) => {
    if (request?.type !== MESSAGE_TYPES.API_TEST_REQUEST) {
      return false
    }

    const { apiBaseUrl, apiKey, model } = request.payload
    const modelParams = request.payload.modelParams ?? {}

    /** 失败发生在哪一步：本地校验 / 请求未拿到流 / 流中途断 / 200 但无内容 */
    type TestStage = "validate" | "request" | "stream" | "empty"

    /**
     * provider 元信息 + 草稿参数（只含元信息与数值，不含 apiKey；见 docs/ANALYTICS.md §3.10）。
     * 单独抽出是因为**所有**分支都要带：即使请求根本没发出去，也该看出用户配了什么。
     */
    const providerMeta = () => ({
      ...(model?.trim() ? { model: model.trim() } : {}),
      provider_type: request.payload.modelsDevId ? "models_dev" : "custom",
      is_custom_endpoint: Boolean(apiBaseUrl?.trim()),
      has_api_key: Boolean(apiKey?.trim()),
      ...(request.payload.modelsDevId ? { models_dev_id: request.payload.modelsDevId } : {}),
      ...(apiBaseUrl?.trim() ? { api_base_url: apiBaseUrl.trim() } : {}),
      ...(typeof modelParams.maxTokens === "number" ? { max_tokens: modelParams.maxTokens } : {}),
      ...(typeof modelParams.contextSize === "number" && modelParams.contextSize > 0
        ? { context_size: modelParams.contextSize }
        : {}),
      ...(modelParams.reasoning !== undefined ? { reasoning: modelParams.reasoning } : {}),
      ...(modelParams.reasoningEffort ? { reasoning_effort: modelParams.reasoningEffort } : {})
    })

    if (!apiKey?.trim() || !model?.trim()) {
      // 本地校验没过也算一次失败的测试：否则「点了测试但字段没填全」在数据里完全看不见
      void trackBackgroundEvent("api_test_completed", {
        success: false,
        stage: "validate",
        ...providerMeta(),
        ...describeApiError(ERROR_MESSAGES.API_TEST_MISSING_FIELDS)
      })
      sendResponse({ success: false, error: ERROR_MESSAGES.API_TEST_MISSING_FIELDS } satisfies ApiTestResponse)
      return false
    }

    const doActualTest = async () => {
      const { streamText } = await import("ai")
      const startTime = performance.now()
      const controller = new AbortController()

      // 声明在 try 外：**失败埋点同样要带请求形态**——参数配错导致 400 时，
      // 「max_tokens 填了多少」正是唯一能定位问题的线索。
      let stage: TestStage = "request"
      let plan: ChatRequestPlan | undefined
      let finishReason: string | undefined
      const warnings: string[] = []

      /**
       * 是否��本地 30s 定时器超时。
       * **不能用 `controller.signal.aborted` 判定**：流消费完（含报错）我们会主动
       * `abort()` 收尾，信号同样是 true——那样任何端点错误都会被改写成 TimeoutError，
       * 原始 400 / 响应体全部丢失（2026-10-20 实际踩过：`max_tokens` 超限收到端点 400，
       * 却上报成 `TimeoutError`）。只认定时器置的位。
       */
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, 30_000)

      try {
        const modelsDevData = await fetchModelsDev()
        const draft: ProviderConfig = {
          id: "test",
          name: "test",
          apiKey: apiKey.trim(),
          model: model.trim(),
          apiBaseUrl: apiBaseUrl?.trim() || undefined,
          // 用草稿里用户实际填的参数测试（maxTokens / reasoning …）——
          // 这些正是「测试通过但真实对话 400」的主因
          modelParams: request.payload.modelParams ?? {},
          modelsDevId: request.payload.modelsDevId
        }

        // 与真实对话同构：带系统提示词（已保存的设置）+ 一条用户消息
        const settings = await getSettings().catch(() => null)
        const systemContent = buildContextSystemMessage(
          TEST_SELECTION_CONTEXT,
          settings?.systemPrompt,
          resolveUILanguageLabel(settings?.language ?? null)
        )

        // 同一个构造器（src/shared/chat-stream.ts）→ 流式 + 用户参数 + system，与真实链路一致
        const { streamParams, plan: requestPlan } = prepareChatRequest({
          provider: draft,
          messages: [
            { id: "test-system", role: "system", content: systemContent },
            { id: "test-user", role: "user", content: TEST_PROMPT }
          ],
          modelsDevData,
          signal: controller.signal
        })
        plan = requestPlan

        const result = streamText(streamParams)
        /** 首个内容块到达时间；null = 流结束但一个字符都没有（真实链路会走 no_content） */
        let ttftMs: number | null = null

        try {
          for await (const part of result.fullStream) {
            // AI SDK 在 abortSignal 触发时**不抛异常**，而是发一个 `abort` part 后正常结束流；
            // 不显式处理的话，30s 超时会被误判成「200 但零内容」（no_content）。
            if (controller.signal.aborted || part.type === "abort") {
              throw new DOMException(ERROR_MESSAGES.REQUEST_TIMEOUT, "TimeoutError")
            }
            if (part.type === "start-step") {
              // 走到 start-step 才说明 HTTP 已成功、SDK 开始解析流。
              // 400/401 这类会在流建立前就以 `error` part 到达（前面只有 `start`），
              // 那种情况 stage 应停在 "request"。
              stage = "stream"
              // fullStream 把 provider 的 CallWarning 挂在 start-step（不是 stream-start）
              for (const warning of part.warnings ?? []) {
                if (warnings.length >= MAX_TEST_WARNINGS) break
                warnings.push(sanitizeErrorMessage(describeCallWarning(warning), 200))
              }
            } else if (part.type === "text-delta" || part.type === "reasoning-delta") {
              stage = "stream"
              ttftMs = Math.round(performance.now() - startTime)
              // 只验证「第一个字能不能到」：拿到就停，不花用户的 token
              break
            } else if (part.type === "finish") {
              finishReason = part.finishReason
            } else if (part.type === "error") {
              throw part.error
            }
          }
        } finally {
          // 收尾用的主动 abort（不是超时）：单独用 timedOut 标志区分，
          // 否则 signal.aborted 会把真实端点错误误判成超时。
          controller.abort()
          // 中止后不再消费的流会留下未 await 的 promise，吞掉避免 unhandled rejection
          void Promise.resolve(result.text).catch(() => {})
        }

        const latencyMs = Math.round(performance.now() - startTime)
        const requestProps = {
          streaming: true,
          ...providerMeta(),
          ...(plan ?? {})
        }

        if (ttftMs === null) {
          // 端点 200 但没给内容：真实对话在这里也是 no_content，测试不能报成功
          stage = "empty"
          const error = ERROR_MESSAGES.NO_VALID_CONTENT
          void trackBackgroundEvent("api_test_completed", {
            success: false,
            stage,
            latency_ms: latencyMs,
            finish_reason: finishReason ?? "unknown",
            ...(warnings.length > 0 ? { warnings } : {}),
            ...requestProps,
            ...describeApiError(error)
          })
          sendResponse({
            success: false,
            error,
            latencyMs,
            warnings,
            finishReason
          } satisfies ApiTestResponse)
          return
        }

        void trackBackgroundEvent("api_test_completed", {
          success: true,
          stage,
          latency_ms: ttftMs,
          ttft_ms: ttftMs,
          finish_reason: finishReason ?? "stopped_after_first_chunk",
          ...(warnings.length > 0 ? { warnings } : {}),
          ...requestProps
        })
        void reportProviderConfigured({ modelsDevId: request.payload.modelsDevId }, "api_test")
        sendResponse({ success: true, latencyMs: ttftMs, ttftMs, warnings, finishReason } satisfies ApiTestResponse)
      } catch (error: unknown) {
        const latencyMs = Math.round(performance.now() - startTime)
        // 只把**定时器触发**的算超时；否则原样上报端点错误（状态码 / 响应体 / 文案都在 error 里）。
        // 不用 `isAbortError` 做额外条件：超时被包装后 name 不一定是 AbortError，
        // 带了该条件反而会把真超时当成端点错误。
        const diagnostics = describeApiError(
          timedOut ? new DOMException(ERROR_MESSAGES.REQUEST_TIMEOUT, "TimeoutError") : error
        )
        // 失败事件与成功事件带同一套上下文（stage / 请求形态 / warnings），
        // 否则「为什么失败」只能靠猜
        void trackBackgroundEvent("api_test_completed", {
          success: false,
          stage,
          latency_ms: latencyMs,
          ...(finishReason ? { finish_reason: finishReason } : {}),
          ...(warnings.length > 0 ? { warnings } : {}),
          ...diagnostics,
          ...providerMeta(),
          ...(plan ?? {})
        })
        const message = timedOut
          ? ERROR_MESSAGES.REQUEST_TIMEOUT
          : `${ERROR_MESSAGES.REQUEST_FAILED}: ${getErrorMessage(error)}`
        sendResponse({
          success: false,
          error: message,
          latencyMs,
          warnings,
          finishReason
        } satisfies ApiTestResponse)
      } finally {
        clearTimeout(timeout)
      }
    }

    void doActualTest()
    return true
  })

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== MESSAGE_TYPES.FETCH_MODELS_REQUEST) {
      return false
    }

    const { apiBaseUrl, apiKey } = request.payload as { apiBaseUrl: string; apiKey: string }

    if (!apiBaseUrl?.trim()) {
      sendResponse({ success: false, error: ERROR_MESSAGES.FETCH_MODELS_MISSING_URL })
      return false
    }

    const headers: Record<string, string> = {}
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`
    }

    fetch(`${apiBaseUrl.trim().replace(/\/$/, "")}/models`, { headers })
      .then(async (response) => {
        const rawBody = await response.text()

        if (!response.ok) {
          sendResponse({
            success: false,
            error: `${ERROR_MESSAGES.FETCH_MODELS_FAILED}: ${formatApiError(response.status, rawBody)}`
          })
          return
        }

        if (!rawBody.trim()) {
          sendResponse({
            success: false,
            error: `${ERROR_MESSAGES.FETCH_MODELS_FAILED}: ${ERROR_MESSAGES.FETCH_MODELS_EMPTY_BODY}`
          })
          return
        }

        let body: { data?: unknown[] }
        try {
          body = JSON.parse(rawBody)
        } catch {
          sendResponse({
            success: false,
            error: `${ERROR_MESSAGES.FETCH_MODELS_FAILED}: ${ERROR_MESSAGES.FETCH_MODELS_INVALID_JSON}`
          })
          return
        }

        const rawList: unknown[] = Array.isArray(body?.data) ? body.data : []
        const models = rawList
          .map((item) => (item && typeof item === "object" && "id" in item ? String(item.id) : ""))
          .filter((id) => id.length > 0)

        if (models.length === 0) {
          sendResponse({ success: false, error: ERROR_MESSAGES.FETCH_MODELS_EMPTY })
          return
        }

        sendResponse({ success: true, models })
      })
      .catch((error: unknown) => {
        sendResponse({
          success: false,
          error: `${ERROR_MESSAGES.FETCH_MODELS_FAILED}: ${getErrorMessage(error)}`
        })
      })

    return true
  })

  // ── 账号（M1，SPEC §7）────────────────────────────────────
  // 五个监听全部在模块加载期注册（AGENTS.md 不变量 3），且都不碰生命周期回调

  chrome.runtime.onMessage.addListener(
    (request: { type?: string; payload?: { entry?: unknown } }, _sender, sendResponse) => {
      if (request?.type !== MESSAGE_TYPES.AUTH_SIGN_IN) return false

      const entry = request.payload?.entry === "popup" ? "popup" : "options"
      void (async () => {
        try {
          const result = await signIn({ entry })
          sendResponse({
            success: result.status !== "failed",
            status: result.status,
            ...(result.status === "failed" ? { code: result.code } : {})
          } satisfies AuthSignInResponse)
        } catch (error: unknown) {
          // signIn 自己会把可预期错误折成 status: failed，走到这里说明是意外，原文透出便于排查
          sendResponse({
            success: false,
            status: "failed",
            error: getErrorMessage(error)
          } satisfies AuthSignInResponse)
        }
      })()
      return true
    }
  )

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== MESSAGE_TYPES.AUTH_SIGN_OUT) return false

    void (async () => {
      try {
        await signOut() // 内部已经「先清本地、再 fire-and-forget 通知服务端」
        sendResponse({ success: true } satisfies AuthSignOutResponse)
      } catch (error: unknown) {
        sendResponse({ success: false, error: getErrorMessage(error) } satisfies AuthSignOutResponse)
      }
    })()
    return true
  })

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== MESSAGE_TYPES.AUTH_STATE_REQUEST) return false

    void (async () => {
      try {
        // 响应键集固定为 { success, snapshot }：**不得出现任何 token 字段**
        sendResponse({ success: true, snapshot: await getSnapshot() } satisfies AuthStateResponse)
      } catch (error: unknown) {
        sendResponse({ success: false, error: getErrorMessage(error) } satisfies AuthStateResponse)
      }
    })()
    return true
  })

  chrome.runtime.onMessage.addListener(
    (request: { type?: string; payload?: { force?: unknown } }, _sender, sendResponse) => {
      if (request?.type !== MESSAGE_TYPES.ENTITLEMENTS_REQUEST) return false

      void (async () => {
        try {
          // 拿不到就返回 null（不是「没有权益」），由 UI 保留旧状态
          const entitlements = await getEntitlements({ force: request.payload?.force === true })
          sendResponse({ success: true, entitlements } satisfies EntitlementsResponse)
        } catch (error: unknown) {
          sendResponse({ success: false, error: getErrorMessage(error) } satisfies EntitlementsResponse)
        }
      })()
      return true
    }
  )

  chrome.runtime.onMessage.addListener(
    (
      request: { type?: string; payload?: { hash?: unknown; entry?: unknown } },
      _sender,
      sendResponse
    ) => {
      if (request?.type !== MESSAGE_TYPES.OPEN_OPTIONS) return false

      const rawHash = request.payload?.hash
      const hash = rawHash === "account" ? "account" : undefined
      const rawEntry = request.payload?.entry
      const entry =
        typeof rawEntry === "string" ? OPEN_OPTIONS_ENTRIES.find((item) => item === rawEntry) : undefined

      // 白名单收敛是刻意的（不接受任意 hash / 任意 entry），但**不静默丢**：
      // 发送方写错路由名时，这里的一行 warn 是唯一能排查的鼓点。
      if (rawHash !== undefined && hash === undefined) {
        console.warn("[options] 未知的 hash，已忽略", rawHash)
      }
      if (rawEntry !== undefined && entry === undefined) {
        console.warn("[options] 未知的 entry，已忽略", rawEntry)
      }

      void (async () => {
        try {
          // `chrome.runtime.openOptionsPage()` 不支持 hash；entry 标记由 Options 页读完清除
          if (entry) {
            await chrome.storage.local.set({ [OPTIONS_ENTRY_STORAGE_KEY]: entry })
          }
          await chrome.tabs.create({
            url: chrome.runtime.getURL(`options.html${hash ? `#${hash}` : ""}`)
          })
          sendResponse({ success: true } satisfies OpenOptionsResponse)
        } catch (error: unknown) {
          sendResponse({ success: false, error: getErrorMessage(error) } satisfies OpenOptionsResponse)
        }
      })()
      return true
    }
  )

  /**
   * 打开官网页面（定价 / 账单）。
   *
   * 为什么由 background 代开：`chrome.tabs` **不暴露给 content script**，
   * 面板里的「升级额度」CTA 直接调 `chrome.tabs.create` 会抛 TypeError（被 `void` 吞掉 → 点了没反应）。
   * 只接受路由名而不是 URL：这个通道对任意页面可达，不能变成任意的 URL 打开器。
   */
  chrome.runtime.onMessage.addListener(
    (request: { type?: string; payload?: { route?: unknown } }, _sender, sendResponse) => {
      if (request?.type !== MESSAGE_TYPES.OPEN_WEB_PAGE) return false

      const rawRoute = request.payload?.route
      const route =
        typeof rawRoute === "string" ? OPEN_WEB_PAGE_ROUTES.find((item) => item === rawRoute) : undefined

      void (async () => {
        try {
          if (!route) {
            // 不在白名单里的目标一律拒，并把收到的值写进错误里（便于排查调用方写错）
            sendResponse({
              success: false,
              error: `unknown route: ${String(rawRoute)}`
            } satisfies OpenWebPageResponse)
            return
          }
          await chrome.tabs.create({ url: `${WEB_BASE}${WEB_ROUTES[route]}` })
          sendResponse({ success: true } satisfies OpenWebPageResponse)
        } catch (error: unknown) {
          sendResponse({ success: false, error: getErrorMessage(error) } satisfies OpenWebPageResponse)
        }
      })()
      return true
    }
  )
})
