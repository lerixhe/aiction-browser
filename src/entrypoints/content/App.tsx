import { useCallback, useEffect, useRef, useState } from "react"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import DynamicIsland from "@/entrypoints/content/components/DynamicIsland"
import ChatIslandPanel, { ChatPillContent, deriveChatPhase } from "@/entrypoints/content/components/ChatIslandPanel"
import { TtsPillContent, TtsControlBar } from "@/entrypoints/content/components/SpeechPlayer"
import { ISLAND_METRICS } from "@/entrypoints/content/components/islandMetrics"
import { useChatState } from "@/entrypoints/content/hooks/useChatState"
import { useSelectionDetection } from "@/entrypoints/content/hooks/useSelectionDetection"
import type { SelectionStart } from "@/entrypoints/content/hooks/useSelectionDetection"
import { useSpeechPlayer } from "@/entrypoints/content/hooks/useSpeechPlayer"
import { useToolbarState } from "@/entrypoints/content/hooks/useToolbarState"
import { useUiTheme } from "@/shared/ui/theme"
import { initContentScriptAnalytics, trackEvent } from "@/shared/analytics"
import { resolveActionTemplate, formatFreeInputPrompt } from "@/shared/prompt"
import { getSettings } from "@/shared/storage"
import { useI18n } from "@/shared/i18n/context"
import type { SelectionAnchor, SelectionContext, QuickAction } from "@/shared/types"

export default function App() {
  const extensionRootRef = useRef<HTMLDivElement | null>(null)
  const panelOpenRef = useRef(false)
  const [selectionStart, setSelectionStart] = useState<SelectionStart | null>(null)
  /** 灵动岛是否处于展开态 */
  const [islandExpanded, setIslandExpanded] = useState(false)
  /** 用户手动收起后，本轮流式请求不再自动展开（直到下一次新请求） */
  const suppressAutoExpandRef = useRef(false)

  const speechPlayer = useSpeechPlayer()
  const theme = useUiTheme()
  const { t } = useI18n()

  useEffect(() => {
    void initContentScriptAnalytics()
  }, [])

  // Use toolbar state hook
  const {
    toolbarVisible,
    toolbarAnchor,
    selectionContext,
    actions,
    quickActions,
    closeToolbar,
    openToolbar,
    toolbarVisibleRef
  } = useToolbarState()

  // Use chat state hook
  const {
    messages,
    requestState,
    panelOpen,
    setPanelOpen,
    capturedText,
    setCapturedText,
    setContext,
    sendPrompt,
    stopStreaming,
    resetMessages,
    modelName
  } = useChatState()

  // Keep ref in sync with state for stable callback dependency
  useEffect(() => {
    panelOpenRef.current = panelOpen
  }, [panelOpen])

  // ---------- 灵动岛状态机 ----------

  const ttsActive = speechPlayer.state.status !== "idle"
  const chatActive = panelOpen
  const islandVisible = chatActive || ttsActive
  const chatPhase = deriveChatPhase(requestState, messages)

  // 首个 token 到达时自动展开（用户手动收起过则本轮不再打扰）；
  // 延迟等待岛入场动画结束，避免 morph 与入场动画叠加
  useEffect(() => {
    if (!panelOpen || requestState.status !== "streaming") return
    if (suppressAutoExpandRef.current) return
    const last = messages[messages.length - 1]
    if (!(last && last.role === "assistant" && last.content.length > 0)) return
    const timer = window.setTimeout(() => setIslandExpanded(true), 400)
    return () => window.clearTimeout(timer)
  }, [messages, requestState.status, panelOpen])

  // 岛卸载时复位展开态（如 TTS stop 后），避免下次出现时跳过胶囊直接展开
  useEffect(() => {
    if (!islandVisible) setIslandExpanded(false)
  }, [islandVisible])

  const handleIslandExpandedChange = useCallback((next: boolean) => {
    setIslandExpanded(next)
    if (!next) {
      suppressAutoExpandRef.current = true
    }
  }, [])

  // 彻底关闭对话（岛消失；消息按约定留在内存，下次动作时重置）
  const closeConversation = useCallback(() => {
    setPanelOpen(false)
    setCapturedText("")
    setContext(null)
    setIslandExpanded(false)
  }, [setPanelOpen, setCapturedText, setContext])

  // 展开态点击岛外：收起并关闭对话，回到"无岛"状态
  const handleOutsideActivate = useCallback(() => {
    closeConversation()
  }, [closeConversation])

  // Handle selection change — suppress while panel is open
  const handleSelectionChange = useCallback(
    (context: SelectionContext | null, anchor: SelectionAnchor | null, start: SelectionStart | null) => {
      if (panelOpenRef.current) {
        return
      }

      if (context && anchor) {
        setSelectionStart(start)
        openToolbar(context, anchor)
      } else {
        setSelectionStart(null)
        closeToolbar()
      }
    },
    [openToolbar, closeToolbar]
  )

  // Use selection detection hook
  useSelectionDetection({
    extensionRootRef,
    onSelectionChange: handleSelectionChange,
    isToolbarVisible: () => toolbarVisibleRef.current
  })

  // Run prompt with selection context
  const runWithSelectionContext = useCallback(
    async (rawPrompt: string, ctx: SelectionContext) => {
      await sendPrompt(rawPrompt, ctx)
    },
    [sendPrompt]
  )

  // Open unified panel with selection text and fire action
  const openPanelWithAction = useCallback(
    async (text: string, prompt: string) => {
      setCapturedText(text)
      setPanelOpen(true)
      closeToolbar()
      resetMessages()
      suppressAutoExpandRef.current = false

      if (selectionContext) {
        const ctx = { ...selectionContext, text }
        setContext(ctx)
        await runWithSelectionContext(prompt, ctx)
      }
    },
    [selectionContext, setCapturedText, setPanelOpen, closeToolbar, setContext, runWithSelectionContext, resetMessages]
  )

  // Handle action
  const handleAction = useCallback(
    async (template: string, text: string) => {
      if (!selectionContext) {
        return
      }

      const settings = await getSettings()
      const context = { ...selectionContext, text }
      const prompt = resolveActionTemplate(template, context, settings)

      const matchedAction = settings.actions.find((a) => a.template === template)
      const BUILTIN_IDS = new Set(["explain", "translate"])
      const customActions = settings.actions.filter((a) => !BUILTIN_IDS.has(a.id))
      void trackEvent("action_clicked", {
        action_id: matchedAction?.id ?? "unknown",
        action_label: matchedAction?.label ?? "unknown",
        custom_action_count: customActions.length,
        custom_action_labels: customActions.map((a) => a.label).join(",")
      })

      await openPanelWithAction(text, prompt)
    },
    [selectionContext, openPanelWithAction]
  )

  // Handle quick action
  const handleQuickAction = useCallback(
    async (action: QuickAction) => {
      if (!selectionContext) return

      const text = selectionContext.text

      if (action.type === "copyToClipboard") {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          // Fallback for contexts where clipboard API is blocked
          const textarea = document.createElement("textarea")
          textarea.value = text
          textarea.style.position = "fixed"
          textarea.style.opacity = "0"
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand("copy")
          document.body.removeChild(textarea)
        }
        closeToolbar()
      } else if (action.type === "speakText") {
        const trimmed = text.trim()
        if (!trimmed) return

        // 关闭工具栏；朗读状态固定显示在页面顶部中央的灵动岛中
        closeToolbar()
        speechPlayer.start(trimmed)
      }

      void trackEvent("quick_action_clicked", { action_type: action.type })
    },
    [selectionContext, closeToolbar, speechPlayer.start]
  )

  // Handle free submit from panel captured text
  const handleFreeSubmit = useCallback(
    async (input: string, text: string) => {
      if (!selectionContext) {
        return
      }

      void trackEvent("free_input_submitted", { input_length: input.length })

      const prompt = formatFreeInputPrompt(input, text)
      await openPanelWithAction(text, prompt)
    },
    [selectionContext, openPanelWithAction]
  )

  // Handle followup send from panel input
  const handleFollowupSend = useCallback(
    async (input: string) => {
      void trackEvent("followup_sent", { input_length: input.length, message_count: messages.length })
      suppressAutoExpandRef.current = false
      await sendPrompt(input)
    },
    [sendPrompt, messages.length]
  )

  // ---------- 胶囊内容组装 ----------

  const pillContent = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 10px",
        width: "100%"
      }}>
      {ttsActive && <TtsPillContent player={speechPlayer} mini={chatActive} />}
      {ttsActive && chatActive && (
        <div style={{ width: 1, height: 14, background: theme.border.default, flexShrink: 0 }} />
      )}
      {chatActive && (
        <ChatPillContent phase={chatPhase} onDismiss={closeConversation} />
      )}
    </div>
  )

  const ariaLabel = chatActive ? t("island.chat.label") : t("ui.tts.speaking")

  return (
    <div ref={extensionRootRef} data-aiction-root="true" style={{ pointerEvents: "none" }}>
      <SelectionToolbar
        visible={toolbarVisible}
        anchor={toolbarAnchor}
        selectionStart={selectionStart}
        actions={actions}
        quickActions={quickActions}
        onAction={(template, text) => {
          void handleAction(template, selectionContext?.text ?? text)
        }}
        onQuickAction={(action) => {
          void handleQuickAction(action)
        }}
        onClose={() => {
          closeToolbar()
        }}
      />

      {islandVisible && (
        <DynamicIsland
          visible
          expanded={islandExpanded}
          onExpandedChange={handleIslandExpandedChange}
          onOutsideActivate={chatActive && islandExpanded ? handleOutsideActivate : undefined}
          pillWidth={
            chatActive && ttsActive
              ? ISLAND_METRICS.dualPillWidth
              : chatActive
                ? ISLAND_METRICS.chatPill.width
                : ISLAND_METRICS.ttsPill.width
          }
          pillHeight={chatActive ? ISLAND_METRICS.chatPill.height : ISLAND_METRICS.ttsPill.height}
          expandedWidth={chatActive ? ISLAND_METRICS.chatPanel.width : ISLAND_METRICS.ttsBar.width}
          expandedHeight={chatActive ? ISLAND_METRICS.chatPanel.height : ISLAND_METRICS.ttsBar.height}
          expandTrigger={chatActive ? "click" : "hover"}
          ariaLabel={ariaLabel}
          pill={pillContent}>
          {chatActive ? (
            <ChatIslandPanel
              capturedText={capturedText}
              messages={messages}
              requestState={requestState.status}
              modelName={modelName}
              ttsPlayer={ttsActive ? speechPlayer : undefined}
              onCapturedTextChange={setCapturedText}
              onSend={(input) => {
                void handleFollowupSend(input)
              }}
              onStop={stopStreaming}
              onCollapse={() => handleIslandExpandedChange(false)}
              onClose={closeConversation}
            />
          ) : (
            <TtsControlBar player={speechPlayer} />
          )}
        </DynamicIsland>
      )}
    </div>
  )
}
