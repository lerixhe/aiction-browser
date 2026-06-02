import type {
  ChatStreamCancelRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ApiTestRequest,
  ApiTestResponse,
  ModelsDevResponse
} from "@/shared/types"
import { MESSAGE_TYPES, ERROR_MESSAGES } from "@/shared/constants"
import { i18nStore } from "@/shared/i18n/index"
import { formatApiError, getErrorMessage, isAbortError } from "@/shared/errors"
import { getActiveProvider, getSettings } from "@/shared/storage"
import { resolveLanguageModel } from "@/shared/model-provider"
import { fetchModelsDev } from "@/shared/models-dev"
import {
  trackBackgroundEvent,
  startBackgroundBatching,
  stopBackgroundBatching
} from "@/shared/analytics"

async function streamChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  signal: AbortSignal,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const { streamText } = await import("ai")

  const settings = await getSettings()
  const activeService = getActiveProvider(settings)

  if (!activeService?.apiKey.trim()) {
    onEvent({ type: "failed", error: ERROR_MESSAGES.NO_API_KEY })
    return
  }

  onEvent({ type: "started" })

  if (!activeService.modelsDevId && !activeService.apiBaseUrl?.trim()) {
    onEvent({ type: "failed", error: ERROR_MESSAGES.API_TEST_MISSING_FIELDS })
    return
  }

  const modelsDevData = await fetchModelsDev()
  const model = resolveLanguageModel(activeService, modelsDevData)

  const result = streamText({
    model,
    messages,
    maxOutputTokens: activeService.modelParams.maxTokens,
    temperature: activeService.modelParams.temperature,
    topP: activeService.modelParams.topP,
    presencePenalty: activeService.modelParams.presencePenalty,
    frequencyPenalty: activeService.modelParams.frequencyPenalty,
    abortSignal: signal,
  })

  let hasContent = false

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

  if (!hasContent) {
    onEvent({ type: "failed", error: ERROR_MESSAGES.NO_VALID_CONTENT })
    return
  }

  onEvent({ type: "completed" })
}

export default defineBackground(() => {
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
      abortController = new AbortController()

      void streamChat(request.payload.messages, abortController.signal, (event) => {
        try {
          port.postMessage(event)
        } catch {
          return
        }
      }).catch((error: unknown) => {
        if (abortController?.signal.aborted && isAbortError(error)) {
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
            error: `${ERROR_MESSAGES.REQUEST_FAILED}: ${message}`
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

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "open-pdf-with-aiction") {
      const pdfUrl = info.pageUrl || info.frameUrl || tab?.url
      if (pdfUrl) {
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

      try {
        const modelsDevData = await fetchModelsDev()
        const service = {
          id: "test",
          name: "test",
          apiKey: apiKey.trim(),
          model: model.trim(),
          apiBaseUrl: apiBaseUrl?.trim() || undefined,
          modelParams: { maxTokens: 5, temperature: 0, topP: 1, presencePenalty: 0, frequencyPenalty: 0 },
        }
        const resolvedModel = resolveLanguageModel(service, modelsDevData)
        const result = await generateText({
          model: resolvedModel,
          messages: [{ role: "user", content: "Hi" }],
          maxOutputTokens: 5,
        })
        const latencyMs = Math.round(performance.now() - startTime)

        void trackBackgroundEvent("api_test_completed", { success: true, latency_ms: latencyMs })
        sendResponse({ success: true, latencyMs } satisfies ApiTestResponse)
      } catch (error: unknown) {
        const latencyMs = Math.round(performance.now() - startTime)
        void trackBackgroundEvent("api_test_completed", { success: false, latency_ms: latencyMs })
        sendResponse({
          success: false,
          error: `${ERROR_MESSAGES.REQUEST_FAILED}: ${getErrorMessage(error)}`,
          latencyMs
        } satisfies ApiTestResponse)
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
        if (!response.ok) {
          const rawError = await response.text()
          sendResponse({
            success: false,
            error: `${ERROR_MESSAGES.FETCH_MODELS_FAILED}: ${formatApiError(response.status, rawError)}`
          })
          return
        }

        const body = await response.json()
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
