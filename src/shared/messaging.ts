import type {
  ChatStreamCancelRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ChatStreamStartRequest,
  ChatMessage
} from "~/shared/types"
import { MESSAGE_TYPES, ERROR_MESSAGES, STREAM_EVENTS } from "~/shared/constants"

interface StreamChatOptions {
  onEvent: (event: ChatStreamEvent) => void
  signal?: AbortSignal
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
      messages
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
