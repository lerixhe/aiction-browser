import { useCallback, useEffect, useRef, useState } from "react"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import ChatWindow from "@/entrypoints/content/components/ChatWindow"
import { useChatState } from "@/entrypoints/content/hooks/useChatState"
import { useSelectionDetection } from "@/entrypoints/content/hooks/useSelectionDetection"
import type { SelectionStart } from "@/entrypoints/content/hooks/useSelectionDetection"
import { useToolbarState } from "@/entrypoints/content/hooks/useToolbarState"
import { initContentScriptAnalytics, trackEvent } from "@/shared/analytics"
import { resolveActionTemplate, formatFreeInputPrompt } from "@/shared/prompt"
import { getSettings } from "@/shared/storage"
import type { SelectionAnchor, SelectionContext, QuickAction } from "@/shared/types"

export default function App() {
  const extensionRootRef = useRef<HTMLDivElement | null>(null)
  const panelOpenRef = useRef(false)
  const [selectionStart, setSelectionStart] = useState<SelectionStart | null>(null)

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
      }

      void trackEvent("quick_action_clicked", { action_type: action.type })
    },
    [selectionContext, closeToolbar]
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
      />

      {panelOpen && (
        <ChatWindow
          capturedText={capturedText}
          messages={messages}
          requestState={requestState.status}
          modelName={modelName}
          onCapturedTextChange={setCapturedText}
          onSend={(input) => {
            void handleFollowupSend(input)
          }}
          onStop={stopStreaming}
          onClose={() => {
            setPanelOpen(false)
            setCapturedText("")
            setContext(null)
          }}
        />
      )}
    </div>
  )
}
