import { useCallback, useEffect, useRef } from "react"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import ChatWindow from "@/entrypoints/content/components/ChatWindow"
import { useChatState } from "@/entrypoints/content/hooks/useChatState"
import { useSelectionDetection } from "@/entrypoints/content/hooks/useSelectionDetection"
import { useToolbarState } from "@/entrypoints/content/hooks/useToolbarState"
import { initContentScriptAnalytics, trackEvent } from "@/shared/analytics"
import { resolveActionTemplate, formatFreeInputPrompt } from "@/shared/prompt"
import { getSettings } from "@/shared/storage"
import type { SelectionAnchor, SelectionContext } from "@/shared/types"

export default function App() {
  const extensionRootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void initContentScriptAnalytics()
  }, [])

  // Use toolbar state hook
  const {
    toolbarVisible,
    toolbarAnchor,
    selectionContext,
    actions,
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
    resetMessages
  } = useChatState()

  // Handle selection change — suppress while panel is open
  const handleSelectionChange = useCallback(
    (context: SelectionContext | null, anchor: SelectionAnchor | null) => {
      if (panelOpen) {
        return
      }

      if (context && anchor) {
        openToolbar(context, anchor)
        void trackEvent("selection_detected", { text_length: context.text.length })
      } else {
        closeToolbar()
      }
    },
    [openToolbar, closeToolbar, panelOpen]
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

      void trackEvent("panel_opened")

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
      void trackEvent("action_clicked", {
        action_id: matchedAction?.id ?? "unknown",
        action_label: matchedAction?.label ?? "unknown"
      })

      await openPanelWithAction(text, prompt)
    },
    [selectionContext, openPanelWithAction]
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
        actions={actions}
        onAction={(template, text) => {
          void handleAction(template, selectionContext?.text ?? text)
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
