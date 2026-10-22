import { useCallback, useEffect, useRef, useState } from "react"

import { ERROR_MESSAGES, UI_MESSAGES } from "@/shared/constants"
import { streamChat } from "@/shared/messaging"
import { buildContextSystemMessage, resolveUILanguageLabel } from "@/shared/prompt"
import { trackEvent, type AnalyticsSource } from "@/shared/analytics"
import { classifyChatError, describeApiError, type ApiErrorDiagnostics, type ChatErrorCode } from "@/shared/errors"
import { providerTypeOf, providerIdentityOf, type ProviderIdentityProps } from "@/shared/provider-type"
import { getSettings, getActiveProvider } from "@/shared/storage"
import type { ChatMessage, ChatRequestState, ExtensionSettings, SelectionContext } from "@/shared/types"

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
 * Hook for managing chat state and streaming requests.
 * 由 ChatSession（单个对话会话实例）内部调用：每个实例持有独立的
 * messages / 流式 abort / 节流定时器，实例卸载时一并中断与清理。
 */
export function useChatState(source: AnalyticsSource = "web") {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [requestState, setRequestState] = useState<ChatRequestState>({ status: "idle" })
  const [context, setContext] = useState<SelectionContext | null>(null)
  const [modelName, setModelName] = useState<string>("")

  const messagesRef = useRef<ChatMessage[]>([])
  const activeStreamAbortRef = useRef<AbortController | null>(null)
  /** 进行中请求的维度快照：供「用户主动停止」埋点使用（停止发生在 sendPrompt 之外） */
  const activeRequestRef = useRef<{
    controller: AbortController
    turnIndex: number
    model: string
    providerType: string
    startedAt: number
  } | null>(null)
  const lastUpdateTimeRef = useRef<number>(0)
  const pendingChunkRef = useRef<{ id: string; content: string; reasoning?: string } | null>(null)
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync messages ref
  const syncMessages = useCallback((newMessages: ChatMessage[]) => {
    messagesRef.current = newMessages
    setMessages(newMessages)
  }, [])

  // Cleanup on unmount：中断流式请求，清理节流定时器（会话实例整体销毁的兜底）
  useEffect(() => {
    return () => {
      activeStreamAbortRef.current?.abort()
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current)
      }
    }
  }, [])

  // Fetch model name on mount
  useEffect(() => {
    let cancelled = false
    const fetchModelName = async () => {
      try {
        const settings = await getSettings()
        const activeProvider = getActiveProvider(settings)
        if (!cancelled && activeProvider?.model) {
          setModelName(activeProvider.model)
        }
      } catch {
        // Ignore errors
      }
    }
    void fetchModelName()
    return () => {
      cancelled = true
    }
  }, [])

  // Stop streaming
  const stopStreaming = useCallback(() => {
    const active = activeRequestRef.current
    if (active) {
      // 只有这里才是「用户主动点停止」；关闭面板导致的 abort 走卸载清理，不上报本事件
      void trackEvent("chat_stopped_by_user", {
        model: active.model,
        provider_type: active.providerType,
        source,
        turn_index: active.turnIndex,
        elapsed_ms: Math.round(performance.now() - active.startedAt)
      })
    }
    activeStreamAbortRef.current?.abort()
  }, [source])

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

      // 先取设置：系统提示词模板需要随请求注入， modelName 也复用这次读取
      let settings: ExtensionSettings | null = null
      try {
        settings = await getSettings()
      } catch {
        // Ignore
      }
      const activeProvider = settings ? getActiveProvider(settings) : undefined
      const modelName = activeProvider?.model ?? "unknown"
      const providerType = providerTypeOf(activeProvider)

      // 轮次：本次调用是会话里的第几轮（1 = 触发动作的首轮，>1 = 追问）
      const turnIndex = messagesRef.current.filter((message) => message.role === "user").length + 1

      // Build API messages with system context prepended
      let apiMessages = nextMessages
      if (ctx) {
        const systemContent = buildContextSystemMessage(
          ctx,
          settings?.systemPrompt,
          resolveUILanguageLabel(settings?.language ?? null)
        )
        const systemMessage = createMessage("system", systemContent)
        apiMessages = [systemMessage, ...nextMessages]
      }

      syncMessages(nextMessages)
      setRequestState({ status: "streaming", assistantMessageId: assistantMessage.id })

      const streamStartTime = performance.now()
      activeRequestRef.current = {
        controller: abortController,
        turnIndex,
        model: modelName,
        providerType,
        startedAt: streamStartTime
      }

      // TTFT：首个内容块（含思考块）到达时间，比总时长更能反映真实体验
      let firstTokenMs: number | null = null

      /** 每轮上报共用的维度（模型 / 来源 / 轮次） */
      const chatProps = (extra: Record<string, unknown>): Record<string, unknown> => ({
        model: modelName,
        provider_type: providerType,
        source,
        turn_index: turnIndex,
        is_follow_up: turnIndex > 1,
        ...(firstTokenMs !== null ? { ttft_ms: firstTokenMs } : {}),
        ...extra
      })

      /** 失败事件的额外维度：provider 身份（只含元信息，不含 API Key） */
      const providerIdentity = providerIdentityOf(activeProvider)

      try {
        let streamedContent = ""
        let streamedReasoning = ""
        let terminalState: "completed" | "cancelled" | "failed" | null = null
        let failedCode: ChatErrorCode = "unknown"
        let failedDiagnostics: ApiErrorDiagnostics | null = null
        let failedProvider: ProviderIdentityProps = providerIdentity

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
              if (firstTokenMs === null) {
                firstTokenMs = Math.round(performance.now() - streamStartTime)
              }

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
            failedCode = event.code ?? classifyChatError(event.error)
            // background 已给出结构化诊断就用它的，否则本地兜底（旧版 background 不带 diagnostics）
            failedDiagnostics = event.diagnostics ?? describeApiError(event.error, event.code)
            if (event.provider) {
              failedProvider = event.provider
            }
            setRequestState({
              status: "failed",
              assistantMessageId: assistantMessage.id,
              error: event.error,
              // 归因码要带到状态里：面板的失败态 CTA 靠它决定「去登录」还是什么都不显示
              code: failedCode
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
          void trackEvent("chat_completed", chatProps({
            duration_ms: durationMs,
            content_length: streamedContent.length
          }))
        } else if (terminalState === "cancelled") {
          void trackEvent("chat_cancelled", chatProps({ duration_ms: durationMs }))
        } else if (terminalState === "failed") {
          void trackEvent(
            "chat_failed",
            chatProps({
              duration_ms: durationMs,
              ...(failedDiagnostics ?? describeApiError("unknown")),
              ...failedProvider,
              error_code: failedCode
            })
          )
        }
      } catch (error: unknown) {
        if (!isCurrentRequest()) {
          return
        }

        void trackEvent(
          "chat_failed",
          chatProps({
            duration_ms: Math.round(performance.now() - streamStartTime),
            ...describeApiError(error),
            ...providerIdentity,
            error_code: classifyChatError(error)
          })
        )

        const message = error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR
        setRequestState({
          status: "failed",
          assistantMessageId: assistantMessage.id,
          error: message,
          code: classifyChatError(error)
        })
        const afterFailure = updateMessageContent(messagesRef.current, assistantMessage.id, `${ERROR_MESSAGES.REQUEST_FAILED}：${message}`)
        messagesRef.current = afterFailure
        setMessages(afterFailure)
      } finally {
        if (activeStreamAbortRef.current === abortController) {
          activeStreamAbortRef.current = null
        }
        if (activeRequestRef.current?.controller === abortController) {
          activeRequestRef.current = null
        }

        setRequestState((current) =>
          current.status === "streaming" && current.assistantMessageId === assistantMessage.id
            ? { status: "idle" }
            : current
        )
      }
    },
    [syncMessages, context, source]
  )

  return {
    messages,
    requestState,
    context,
    setContext,
    sendPrompt,
    stopStreaming,
    modelName
  }
}
