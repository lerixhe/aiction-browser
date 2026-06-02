import { useCallback, useEffect, useRef, useState } from "react"

import { ERROR_MESSAGES, UI_MESSAGES } from "@/shared/constants"
import { streamChat } from "@/shared/messaging"
import { buildContextSystemMessage } from "@/shared/prompt"
import { trackEvent } from "@/shared/analytics"
import { getSettings, getActiveProvider } from "@/shared/storage"
import type { ChatMessage, ChatRequestState, SelectionContext } from "@/shared/types"

/**
 * Generate unique message ID
 */
function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Create a new chat message
 */
function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: createMessageId(),
    role,
    content
  }
}

/**
 * Update message content by ID
 */
function updateMessageContent(
  messages: ChatMessage[],
  id: string,
  content: string,
  reasoning_content?: string
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== id) {
      return message
    }
    return {
      ...message,
      content,
      ...(reasoning_content !== undefined ? { reasoning_content } : {})
    }
  })
}

/**
 * Hook for managing chat state and streaming requests
 */
export function useChatState() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [requestState, setRequestState] = useState<ChatRequestState>({ status: "idle" })
  const [panelOpen, setPanelOpen] = useState(false)
  const [capturedText, setCapturedText] = useState("")
  const [context, setContext] = useState<SelectionContext | null>(null)

  const messagesRef = useRef<ChatMessage[]>([])
  const activeStreamAbortRef = useRef<AbortController | null>(null)
  const lastUpdateTimeRef = useRef<number>(0)
  const pendingChunkRef = useRef<{ id: string; content: string; reasoning?: string } | null>(null)
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync messages ref
  const syncMessages = useCallback((newMessages: ChatMessage[]) => {
    messagesRef.current = newMessages
    setMessages(newMessages)
  }, [])

  // Cleanup throttle timer on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current)
      }
    }
  }, [])

  // Stop streaming
  const stopStreaming = useCallback(() => {
    activeStreamAbortRef.current?.abort()
  }, [])

  // Send prompt
  const sendPrompt = useCallback(
    async (prompt: string, overrideContext?: SelectionContext | null) => {
      activeStreamAbortRef.current?.abort()

      const abortController = new AbortController()
      activeStreamAbortRef.current = abortController

      const isCurrentRequest = () => activeStreamAbortRef.current === abortController

      const userMessage = createMessage("user", prompt)
      const assistantMessage = createMessage("assistant", "")
      const nextMessages = [...messagesRef.current, userMessage, assistantMessage]

      // Use overrideContext if provided, otherwise fall back to stored context
      const ctx = overrideContext !== undefined ? overrideContext : context

      // Build API messages with system context prepended
      let apiMessages = nextMessages
      if (ctx) {
        const systemContent = buildContextSystemMessage(ctx)
        const systemMessage = createMessage("system", systemContent)
        apiMessages = [systemMessage, ...nextMessages]
      }

      syncMessages(nextMessages)
      setRequestState({ status: "streaming", assistantMessageId: assistantMessage.id })

      const streamStartTime = performance.now()
      let modelName = "unknown"
      try {
        const settings = await getSettings()
        const activeService = getActiveProvider(settings)
        modelName = activeService?.model ?? "unknown"
      } catch {
        // Ignore
      }

      void trackEvent("chat_started", { model: modelName })

      try {
        let streamedContent = ""
        let streamedReasoning = ""
        let terminalState: "completed" | "cancelled" | "failed" | null = null

        await streamChat(apiMessages, {
          signal: abortController.signal,
          onEvent: (event) => {
            if (!isCurrentRequest()) {
              return
            }

            if (event.type === "started") {
              setRequestState({ status: "streaming", assistantMessageId: assistantMessage.id })
              return
            }

            if (event.type === "chunk") {
              streamedContent += event.content
              if (event.reasoning_content) {
                streamedReasoning += event.reasoning_content
              }

              const now = performance.now()
              const timeSinceLastUpdate = now - lastUpdateTimeRef.current
              const THROTTLE_MS = 32 // ~30fps

              const updateMessages = () => {
                const updatedMessages = updateMessageContent(
                  messagesRef.current,
                  assistantMessage.id,
                  streamedContent,
                  streamedReasoning || undefined
                )
                messagesRef.current = updatedMessages
                setMessages(updatedMessages)
                lastUpdateTimeRef.current = performance.now()
                pendingChunkRef.current = null
                throttleTimerRef.current = null
              }

              if (timeSinceLastUpdate >= THROTTLE_MS) {
                updateMessages()
              } else {
                pendingChunkRef.current = {
                  id: assistantMessage.id,
                  content: streamedContent,
                  reasoning: streamedReasoning || undefined
                }

                if (throttleTimerRef.current === null) {
                  const delay = THROTTLE_MS - timeSinceLastUpdate
                  throttleTimerRef.current = setTimeout(updateMessages, delay)
                }
              }

              return
            }

            if (event.type === "completed") {
              terminalState = "completed"
              setRequestState({ status: "idle" })
              return
            }

            if (event.type === "cancelled") {
              terminalState = "cancelled"
              setRequestState({ status: "cancelled", assistantMessageId: assistantMessage.id })
              return
            }

            terminalState = "failed"
            setRequestState({
              status: "failed",
              assistantMessageId: assistantMessage.id,
              error: event.error
            })

            const afterFailure = updateMessageContent(messagesRef.current, assistantMessage.id, event.error)
            messagesRef.current = afterFailure
            setMessages(afterFailure)
          }
        })

        if (terminalState === "completed" && !streamedContent && !streamedReasoning) {
          const afterEmpty = updateMessageContent(messagesRef.current, assistantMessage.id, UI_MESSAGES.EMPTY_CHAT)
          messagesRef.current = afterEmpty
          setMessages(afterEmpty)
        }

        if (throttleTimerRef.current !== null) {
          clearTimeout(throttleTimerRef.current)
          throttleTimerRef.current = null
        }
        const finalPending = pendingChunkRef.current
        if (finalPending && finalPending.id === assistantMessage.id) {
          const finalMessages = updateMessageContent(
            messagesRef.current,
            finalPending.id,
            finalPending.content,
            finalPending.reasoning
          )
          messagesRef.current = finalMessages
          setMessages(finalMessages)
          pendingChunkRef.current = null
        }

        const durationMs = Math.round(performance.now() - streamStartTime)
        if (terminalState === "completed") {
          void trackEvent("chat_completed", {
            model: modelName,
            duration_ms: durationMs,
            content_length: streamedContent.length
          })
        } else if (terminalState === "cancelled") {
          void trackEvent("chat_cancelled", { model: modelName, duration_ms: durationMs })
        } else if (terminalState === "failed") {
          void trackEvent("chat_failed", { model: modelName, duration_ms: durationMs })
        }
      } catch (error: unknown) {
        if (!isCurrentRequest()) {
          return
        }

        const durationMs = Math.round(performance.now() - streamStartTime)
        void trackEvent("chat_failed", { model: modelName, duration_ms: durationMs })

        const message = error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR
        setRequestState({ status: "failed", assistantMessageId: assistantMessage.id, error: message })
        const afterFailure = updateMessageContent(messagesRef.current, assistantMessage.id, `${ERROR_MESSAGES.REQUEST_FAILED}：${message}`)
        messagesRef.current = afterFailure
        setMessages(afterFailure)
      } finally {
        if (activeStreamAbortRef.current === abortController) {
          activeStreamAbortRef.current = null
        }

        setRequestState((current) =>
          current.status === "streaming" && current.assistantMessageId === assistantMessage.id
            ? { status: "idle" }
            : current
        )
      }
    },
    [syncMessages, context]
  )

  // Clear chat
  const clearChat = useCallback(() => {
    activeStreamAbortRef.current?.abort()
    if (throttleTimerRef.current !== null) {
      clearTimeout(throttleTimerRef.current)
      throttleTimerRef.current = null
    }
    syncMessages([])
    setRequestState({ status: "idle" })
    setPanelOpen(false)
    setCapturedText("")
  }, [syncMessages])

  // Reset messages only (keep panel open)
  const resetMessages = useCallback(() => {
    activeStreamAbortRef.current?.abort()
    if (throttleTimerRef.current !== null) {
      clearTimeout(throttleTimerRef.current)
      throttleTimerRef.current = null
    }
    syncMessages([])
    setRequestState({ status: "idle" })
  }, [syncMessages])

  return {
    messages,
    requestState,
    panelOpen,
    setPanelOpen,
    capturedText,
    setCapturedText,
    context,
    setContext,
    sendPrompt,
    stopStreaming,
    clearChat,
    resetMessages
  }
}
