import type {
  ChatFeature,
  ChatStreamCancelRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ChatStreamStartRequest,
  ChatMessage
} from "@/shared/types"
import { MESSAGE_TYPES, ERROR_MESSAGES, STREAM_EVENTS } from "@/shared/constants"

/** Popup「在当前页面提问」请求：content script 收到后开一个空的聊天态面板并聚焦输入框 */
export interface OpenChatRequest {
  type: typeof MESSAGE_TYPES.OPEN_CHAT
}

export function isOpenChatRequest(message: unknown): message is OpenChatRequest {
  return (message as OpenChatRequest | null)?.type === MESSAGE_TYPES.OPEN_CHAT
}

/**
 * 向当前活动标签页的 content script 发送「在当前页面提问」。
 * 页面没有可用的 content script（chrome://、扩展商店、页面未刷新等）时抛错，
 * 由调用方（Popup）显式提示——不静默失败。
 */
export async function requestOpenChatInActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    throw new Error("NO_ACTIVE_TAB")
  }
  await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.OPEN_CHAT } satisfies OpenChatRequest)
}

interface StreamChatOptions {
  onEvent: (event: ChatStreamEvent) => void
  signal?: AbortSignal
  /** 计费主体（契约 §6.1）：只有官方链路用，但**由调用点填**（background 不知道你是划词还是页内提问） */
  feature?: ChatFeature
}

function isTerminalEvent(event: ChatStreamEvent): boolean {
  return (
    event.type === STREAM_EVENTS.COMPLETED ||
    event.type === STREAM_EVENTS.CANCELLED ||
    event.type === STREAM_EVENTS.FAILED
  )
}

export async function streamChat(messages: ChatMessage[], options: StreamChatOptions): Promise<void> {
  const request: ChatStreamStartRequest = {
    type: MESSAGE_TYPES.CHAT_STREAM_START,
    payload: {
      messages,
      ...(options.feature ? { feature: options.feature } : {})
    }
  }

  await new Promise<void>((resolve, reject) => {
    let port: chrome.runtime.Port
    try {
      port = chrome.runtime.connect({ name: MESSAGE_TYPES.STREAM_PORT_NAME })
    } catch {
      reject(new Error(ERROR_MESSAGES.CONTEXT_INVALIDATED))
      return
    }
    let settled = false

    const cleanup = () => {
      try {
        port.onMessage.removeListener(handleMessage)
        port.onDisconnect.removeListener(handleDisconnect)
      } catch {
        // Extension context may have been invalidated
      }
      options.signal?.removeEventListener("abort", handleAbort)
    }

    const settle = (callback: () => void) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback()
    }

    const handleMessage = (message: ChatStreamEvent) => {
      options.onEvent(message)

      if (!isTerminalEvent(message)) {
        return
      }

      settle(() => {
        try { port.disconnect() } catch { /* context invalidated */ }
        resolve()
      })
    }

    const handleDisconnect = () => {
      if (settled) {
        return
      }

      settle(() => {
        const runtimeError = chrome.runtime.lastError?.message
        reject(new Error(runtimeError || ERROR_MESSAGES.STREAM_DISCONNECTED))
      })
    }

    const handleAbort = () => {
      const cancelRequest: ChatStreamCancelRequest = {
        type: MESSAGE_TYPES.CHAT_STREAM_CANCEL
      }

      try {
        port.postMessage(cancelRequest)
      } catch {
        settle(resolve)
      }
    }

    port.onMessage.addListener(handleMessage)
    port.onDisconnect.addListener(handleDisconnect)
    options.signal?.addEventListener("abort", handleAbort, { once: true })

    if (options.signal?.aborted) {
      handleAbort()
      return
    }

    try {
      port.postMessage(request satisfies ChatStreamRequest)
    } catch {
      cleanup()
      reject(new Error(ERROR_MESSAGES.CONTEXT_INVALIDATED))
    }
  })
}
