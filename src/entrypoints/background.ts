import type {
  ChatStreamCancelRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ApiTestRequest,
  ApiTestResponse,
  ModelsDevResponse,
  OpenRouterModelsResponse,
  TtsSynthesizeRequest,
  TtsSynthesizeResponse
} from "@/shared/types"
import { MESSAGE_TYPES, ERROR_MESSAGES } from "@/shared/constants"
import { i18nStore } from "@/shared/i18n/index"
import { formatApiError, getErrorMessage, isAbortError, classifyChatError } from "@/shared/errors"
import { getActiveProvider, getSettings } from "@/shared/storage"
import { DEFAULT_TTS_SETTINGS } from "@/shared/defaults"
import { resolveLanguageModel } from "@/shared/model-provider"
import { buildProviderOptions, truncateMessagesToContext } from "@/shared/model-params"
import { fetchModelsDev } from "@/shared/models-dev"
import { fetchOpenRouterModels } from "@/shared/openrouter"

import {
  trackBackgroundEvent,
  startBackgroundBatching,
  stopBackgroundBatching,
  consumeFirstTimeFlag,
  type AnalyticsSource
} from "@/shared/analytics"

/** 上次上报活跃的本地日期（YYYY-MM-DD） */
const LAST_ACTIVE_DATE_KEY = "aiction:lastActiveDate"

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

async function streamChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  signal: AbortSignal,
  source: AnalyticsSource,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const { streamText } = await import("ai")

  const settings = await getSettings()
  const activeService = getActiveProvider(settings)

  if (!activeService?.apiKey.trim()) {
    // 关键流失点：装了但没配好 provider 就触发动作（详情见 docs/ANALYTICS.md §5 P0）
    void trackBackgroundEvent("action_triggered_without_provider", { source })
    onEvent({ type: "failed", error: ERROR_MESSAGES.NO_API_KEY, code: "no_api_key" })
    return
  }

  onEvent({ type: "started" })

  if (!activeService.modelsDevId && !activeService.apiBaseUrl?.trim()) {
    onEvent({ type: "failed", error: ERROR_MESSAGES.API_TEST_MISSING_FIELDS, code: "missing_config" })
    return
  }

  const modelsDevData = await fetchModelsDev()
  const model = resolveLanguageModel(activeService, modelsDevData)

  const params = activeService.modelParams ?? {}

  // 只发送用户显式填充的参数；未填充 = 忽略（跟随模型默认）
  const finalMessages =
    typeof params.contextSize === "number" && params.contextSize > 0
      ? truncateMessagesToContext(messages, params.contextSize)
      : messages

  const streamParams: Parameters<typeof streamText>[0] = {
    model,
    messages: finalMessages,
    abortSignal: signal,
  }

  if (typeof params.maxTokens === "number" && params.maxTokens >= 1) {
    streamParams.maxOutputTokens = params.maxTokens
  }

  const providerOptions = buildProviderOptions(activeService, modelsDevData, params)
  if (providerOptions) {
    streamParams.providerOptions = providerOptions
  }

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
    onEvent({ type: "failed", error: ERROR_MESSAGES.NO_VALID_CONTENT, code: "no_content" })
    return
  }

  void reportProviderConfigured(activeService, "chat", settings.providers.length)
  onEvent({ type: "completed" })
}

export default defineBackground(() => {
  // 每日活跃：SW 被唤醒即算（顶层 + onStartup 双保险，由 storage 里的日期去重）
  void reportDailyActive()

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
      }).catch((error: unknown) => {
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
            code: classifyChatError(error)
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

    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "open-pdf-with-aiction",
        title: i18nStore.t("background.openPdfWithAIction"),
        contexts: ["page", "frame"],
        documentUrlPatterns: [
          "*://*/*.pdf",
          "*://*/*.PDF",
          "file://*/*.pdf",
          "file://*/*.PDF"
        ]
      })
    })
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
        void trackBackgroundEvent("edge_tts_synthesize", {
          success: false,
          error: getErrorMessage(error).slice(0, 200)
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

    if (!apiKey?.trim() || !model?.trim()) {
      sendResponse({ success: false, error: ERROR_MESSAGES.API_TEST_MISSING_FIELDS } satisfies ApiTestResponse)
      return false
    }

    const doActualTest = async () => {
      const { generateText } = await import("ai")
      const startTime = performance.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      try {
        const modelsDevData = await fetchModelsDev()
        const service = {
          id: "test",
          name: "test",
          apiKey: apiKey.trim(),
          model: model.trim(),
          apiBaseUrl: apiBaseUrl?.trim() || undefined,
          modelParams: {},
          modelsDevId: request.payload.modelsDevId,
        }
        const resolvedModel = resolveLanguageModel(service, modelsDevData)
        const result = await generateText({
          model: resolvedModel,
          messages: [{ role: "user", content: "Hi" }],
          maxOutputTokens: 5,
          abortSignal: controller.signal,
        })
        const latencyMs = Math.round(performance.now() - startTime)

        void trackBackgroundEvent("api_test_completed", { success: true, latency_ms: latencyMs })
        void reportProviderConfigured({ modelsDevId: request.payload.modelsDevId }, "api_test")
        sendResponse({ success: true, latencyMs } satisfies ApiTestResponse)
      } catch (error: unknown) {
        const latencyMs = Math.round(performance.now() - startTime)
        void trackBackgroundEvent("api_test_completed", { success: false, latency_ms: latencyMs })
        const message = controller.signal.aborted
          ? ERROR_MESSAGES.REQUEST_TIMEOUT
          : `${ERROR_MESSAGES.REQUEST_FAILED}: ${getErrorMessage(error)}`
        sendResponse({
          success: false,
          error: message,
          latencyMs
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
})
