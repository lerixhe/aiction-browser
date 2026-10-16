import { useCallback, useEffect, useRef, useState } from "react"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import ChatPanel from "@/entrypoints/content/components/ChatPanel"
import SpeechWidget from "@/entrypoints/content/components/SpeechWidget"
import { fallbackAnchor, type AnchorRect } from "@/entrypoints/content/components/floating"
import { useChatState } from "@/entrypoints/content/hooks/useChatState"
import { useSelectionDetection } from "@/entrypoints/content/hooks/useSelectionDetection"
import type { SelectionStart } from "@/entrypoints/content/hooks/useSelectionDetection"
import { useSpeechPlayer } from "@/entrypoints/content/hooks/useSpeechPlayer"
import { useToolbarState } from "@/entrypoints/content/hooks/useToolbarState"
import { initContentScriptAnalytics, trackEvent } from "@/shared/analytics"
import { resolveActionTemplate, formatFreeInputPrompt } from "@/shared/prompt"
import { getSettings } from "@/shared/storage"
import type { SelectionAnchor, SelectionContext, QuickAction } from "@/shared/types"

export default function App() {
  const extensionRootRef = useRef<HTMLDivElement | null>(null)
  const [selectionStart, setSelectionStart] = useState<SelectionStart | null>(null)

  const speechPlayer = useSpeechPlayer()

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
    capturedText,
    setCapturedText,
    setContext,
    sendPrompt,
    stopStreaming,
    clearChat,
    resetMessages,
    modelName,
    panelOpen,
    setPanelOpen
  } = useChatState()

  // ---------- 悬浮面板锚点（触发时刻的工具栏落位；工具栏随后关闭，位置保持不变） ----------

  /** 工具栏实时落位（SelectionToolbar 上报），触发动作时快照给各悬浮面板 */
  const toolbarRectRef = useRef<AnchorRect | null>(null)
  const handleToolbarRectChange = useCallback((rect: AnchorRect) => {
    toolbarRectRef.current = rect
  }, [])

  /** 取当前工具栏落位快照（无上报记录时用选区锚点兜底） */
  const takeToolbarAnchor = useCallback((): AnchorRect | null => {
    if (toolbarRectRef.current) return { ...toolbarRectRef.current }
    return fallbackAnchor(toolbarAnchor)
  }, [toolbarAnchor])

  const [chatAnchor, setChatAnchor] = useState<AnchorRect | null>(null)
  const [ttsAnchor, setTtsAnchor] = useState<AnchorRect | null>(null)

  /** 朗读是否激活（朗读控件挂载中） */
  const ttsActive = speechPlayer.state.status !== "idle"

  /** 关闭对话窗：清空本轮对话与选区上下文 */
  const closeConversation = useCallback(() => {
    clearChat()
    setContext(null)
    setPanelOpen(false)
  }, [clearChat, setContext, setPanelOpen])

  // ---------- 划词工具栏 ----------

  const handleSelectionChange = useCallback(
    (context: SelectionContext | null, anchor: SelectionAnchor | null, start: SelectionStart | null) => {
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

  // Open chat panel below the toolbar with selection text and fire action
  // （触发后工具栏保持可见、选区不清空：可连续换动作；工具栏随用户新选区/点击空白自然关闭）
  const openPanelWithAction = useCallback(
    async (text: string, prompt: string) => {
      setCapturedText(text)
      resetMessages()

      if (selectionContext) {
        const ctx = { ...selectionContext, text }
        setContext(ctx)
        setChatAnchor(takeToolbarAnchor())
        setPanelOpen(true)
        await runWithSelectionContext(prompt, ctx)
      }
    },
    [selectionContext, setCapturedText, setContext, setPanelOpen, takeToolbarAnchor, runWithSelectionContext, resetMessages]
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

        // 朗读触发：朗读控件出现在工具栏落位下方（工具栏保持可见，随后控件自动收起为小圆球）
        setTtsAnchor(takeToolbarAnchor())
        speechPlayer.start(trimmed)
      }

      void trackEvent("quick_action_clicked", { action_type: action.type })
    },
    [selectionContext, closeToolbar, takeToolbarAnchor, speechPlayer.start]
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
      await sendPrompt(input)
    },
    [sendPrompt, messages.length]
  )

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
        onRectChange={handleToolbarRectChange}
      />

      {/* 对话窗：触发动作后浮现于工具栏下方（安全区自动翻转） */}
      <ChatPanel
        open={panelOpen}
        anchor={chatAnchor}
        capturedText={capturedText}
        messages={messages}
        requestState={requestState.status}
        modelName={modelName}
        onCapturedTextChange={setCapturedText}
        onSend={(input) => {
          void handleFollowupSend(input)
        }}
        onStop={stopStreaming}
        onClose={closeConversation}
      />

      {/* 朗读控件：触发朗读后浮现于工具栏下方，闲置自动收起为小圆球 */}
      {ttsActive && <SpeechWidget player={speechPlayer} anchor={ttsAnchor} />}
    </div>
  )
}
