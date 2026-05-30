import type {
  ChatStreamCancelRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ChatStreamStartRequest,
  ChatMessage,
  ApiTestRequest,
  ApiTestResponse
} from "@/shared/types"
import { MESSAGE_TYPES, ERROR_MESSAGES } from "@/shared/constants"
import { i18nStore } from "@/shared/i18n/index"
import { formatApiError, getErrorMessage, isAbortError } from "@/shared/errors"
import { getActiveModelService, getSettings } from "@/shared/storage"
import {
  trackBackgroundEvent,
  startBackgroundBatching,
  stopBackgroundBatching
} from "@/shared/analytics"

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "")
}

function normalizeAssistantContent(content: unknown): string {
  if (typeof content === "string") {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part
        }

        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text
        }

        return ""
      })
      .join("")
      .trim()
  }

  return ""
}

interface StreamChunkFields {
  content: string
  reasoning_content: string
}

function getStreamChunkContent(chunk: unknown): StreamChunkFields {
  const empty: StreamChunkFields = { content: "", reasoning_content: "" }

  if (!chunk || typeof chunk !== "object") {
    return empty
  }

  const choices = "choices" in chunk ? chunk.choices : undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    return empty
  }

  const choice = choices[0]
  if (!choice || typeof choice !== "object") {
    return empty
  }

  const delta = "delta" in choice ? choice.delta : undefined

  if (!delta || typeof delta !== "object") {
    return empty
  }

  const content = "content" in delta ? delta.content : undefined
  // OpenAI o1/o3 uses "reasoning_content", Ollama compatible mode uses "reasoning"
  const reasoning_content =
    ("reasoning_content" in delta ? delta.reasoning_content : undefined) ??
    ("reasoning" in delta ? delta.reasoning : undefined)

  return {
    content: normalizeAssistantContent(content),
    reasoning_content: normalizeAssistantContent(reasoning_content)
  }
}

async function streamOpenAiCompatible(
  messages: ChatMessage[],
  signal: AbortSignal,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const settings = await getSettings()
  const activeService = getActiveModelService(settings)

  if (!activeService?.apiKey.trim()) {
    onEvent({
      type: "failed",
      error: ERROR_MESSAGES.NO_API_KEY
    })
    return
  }

  onEvent({ type: "started" })

  if (!activeService.apiBaseUrl.trim() || !activeService.model.trim()) {
    onEvent({
      type: "failed",
      error: ERROR_MESSAGES.API_TEST_MISSING_FIELDS
    })
    return
  }

  const endpoint = `${normalizeBaseUrl(activeService.apiBaseUrl)}/chat/completions`
  const response = await fetch(endpoint, {
    signal,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${activeService.apiKey}`
    },
    body: JSON.stringify({
      model: activeService.model,
      stream: true,
      max_tokens: activeService.modelParams.maxTokens,
      temperature: activeService.modelParams.temperature,
      top_p: activeService.modelParams.topP,
      presence_penalty: activeService.modelParams.presencePenalty,
      frequency_penalty: activeService.modelParams.frequencyPenalty,
      messages: messages.map((item) => ({
        role: item.role,
        content: item.content
      }))
    })
  })

  if (!response.ok) {
    const rawError = await response.text()
    onEvent({
      type: "failed",
      error: formatApiError(response.status, rawError)
    })
    return
  }

  if (!response.body) {
    onEvent({
      type: "failed",
      error: ERROR_MESSAGES.NO_READABLE_STREAM
    })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let hasContent = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })

      const events = buffer.split("\n\n")
      buffer = events.pop() || ""

      for (const event of events) {
        const lines = event
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"))

        for (const line of lines) {
          const data = line.slice(5).trim()

          if (!data) {
            continue
          }

          if (data === "[DONE]") {
            if (!hasContent) {
              onEvent({
                type: "failed",
                error: ERROR_MESSAGES.NO_VALID_CONTENT
              })
              return
            }

            onEvent({ type: "completed" })
            return
          }

          let parsed: unknown

          try {
            parsed = JSON.parse(data)
          } catch {
            continue
          }

          const { content, reasoning_content } = getStreamChunkContent(parsed)
          if (!content && !reasoning_content) {
            continue
          }

          hasContent = true
          onEvent({
            type: "chunk",
            content,
            ...(reasoning_content ? { reasoning_content } : {})
          })
        }
      }

      if (done) {
        break
      }
    }
  } catch (streamError: unknown) {
    if (signal.aborted) {
      throw streamError
    }

    if (!hasContent) {
      onEvent({
        type: "failed",
        error: `${ERROR_MESSAGES.REQUEST_FAILED}: ${getErrorMessage(streamError)}`
      })
      return
    }

    onEvent({ type: "completed" })
    return
  }

  if (!hasContent) {
    onEvent({
      type: "failed",
      error: ERROR_MESSAGES.NO_VALID_CONTENT
    })
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

      void streamOpenAiCompatible(request.payload.messages, abortController.signal, (event) => {
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

    // Create context menu for PDF files
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

  // Handle context menu clicks
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

  chrome.runtime.onMessage.addListener((request: ApiTestRequest, _sender, sendResponse) => {
    if (request?.type !== MESSAGE_TYPES.API_TEST_REQUEST) {
      return false
    }

    const { apiBaseUrl, apiKey, model } = request.payload

    if (!apiBaseUrl?.trim() || !apiKey?.trim() || !model?.trim()) {
      sendResponse({ success: false, error: ERROR_MESSAGES.API_TEST_MISSING_FIELDS } satisfies ApiTestResponse)
      return false
    }

    const baseUrl = normalizeBaseUrl(apiBaseUrl.trim())

    const doActualTest = () => {
      const startTime = performance.now()

      fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          model: model.trim(),
          stream: false,
          max_tokens: 5,
          messages: [{ role: "user", content: "Hi" }]
        })
      })
        .then(async (response) => {
          const latencyMs = Math.round(performance.now() - startTime)
          if (!response.ok) {
            const rawError = await response.text()
            void trackBackgroundEvent("api_test_completed", { success: false, latency_ms: latencyMs })
            sendResponse({
              success: false,
              error: formatApiError(response.status, rawError),
              latencyMs
            } satisfies ApiTestResponse)
            return
          }
          const body = await response.json()
          if (!body.choices || !Array.isArray(body.choices) || body.choices.length === 0) {
            void trackBackgroundEvent("api_test_completed", { success: false, latency_ms: latencyMs })
            sendResponse({
              success: false,
              error: ERROR_MESSAGES.NO_VALID_CONTENT,
              latencyMs
            } satisfies ApiTestResponse)
            return
          }
          void trackBackgroundEvent("api_test_completed", { success: true, latency_ms: latencyMs })
          sendResponse({ success: true, latencyMs } satisfies ApiTestResponse)
        })
        .catch((error: unknown) => {
          const latencyMs = Math.round(performance.now() - startTime)
          void trackBackgroundEvent("api_test_completed", { success: false, latency_ms: latencyMs })
          sendResponse({
            success: false,
            error: `${ERROR_MESSAGES.REQUEST_FAILED}: ${getErrorMessage(error)}`,
            latencyMs
          } satisfies ApiTestResponse)
        })
    }

    fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey.trim()}` }
    })
      .then(() => doActualTest())
      .catch(() => doActualTest())

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

    fetch(`${normalizeBaseUrl(apiBaseUrl.trim())}/models`, { headers })
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
