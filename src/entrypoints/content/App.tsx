import { useCallback, useEffect, useRef, useState } from "react"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import DynamicIsland from "@/entrypoints/content/components/DynamicIsland"
import ChatIslandPanel, {
  ChatCircleContent,
  ChatIdlePill,
  ChatPillContent,
  deriveChatPhase,
  type ChatIslandPhase
} from "@/entrypoints/content/components/ChatIslandPanel"
import { TtsCircleContent, TtsCountdownRing, TtsPillContent, TtsControlBar } from "@/entrypoints/content/components/SpeechPlayer"
import { ISLAND_METRICS, dualAnchorFor } from "@/entrypoints/content/components/islandMetrics"
import { useChatState } from "@/entrypoints/content/hooks/useChatState"
import { useIslandCoordinator } from "@/entrypoints/content/hooks/useIslandCoordinator"
import { MOVE_MS } from "@/entrypoints/content/components/DynamicIsland"
import { useSelectionDetection } from "@/entrypoints/content/hooks/useSelectionDetection"
import type { SelectionStart } from "@/entrypoints/content/hooks/useSelectionDetection"
import { useSpeechPlayer } from "@/entrypoints/content/hooks/useSpeechPlayer"
import { useToolbarState } from "@/entrypoints/content/hooks/useToolbarState"
import { initContentScriptAnalytics, trackEvent } from "@/shared/analytics"
import { resolveActionTemplate, formatFreeInputPrompt } from "@/shared/prompt"
import { getSettings } from "@/shared/storage"
import { useI18n } from "@/shared/i18n/context"
import type { SelectionAnchor, SelectionContext, QuickAction } from "@/shared/types"

export default function App() {
  const extensionRootRef = useRef<HTMLDivElement | null>(null)
  const [selectionStart, setSelectionStart] = useState<SelectionStart | null>(null)

  const speechPlayer = useSpeechPlayer()
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
    capturedText,
    setCapturedText,
    setContext,
    sendPrompt,
    stopStreaming,
    clearChat,
    resetMessages,
    modelName
  } = useChatState()

  // ---------- 灵动岛状态机（双岛：聊天左 / 朗读右） ----------

  const ttsActive = speechPlayer.state.status !== "idle"
  const ttsFinished = speechPlayer.state.status === "finished"
  /** 朗读退场中：球播吸收动画（缩向页面中心），聊天岛同时回中；动画完 stop 卸载 */
  const [ttsExiting, setTtsExiting] = useState(false)
  /** 启动朗读退场（引用稳定：否则每次渲染重建退场计时器，5s 永远到不了点） */
  const handleTtsDismiss = useCallback(() => setTtsExiting(true), [])
  /** 对话是否活跃（岛胶囊显示任务状态而非笑脸「询问」） */
  const chatActive = requestState.status !== "idle" || messages.length > 0
  /** 聊天岛折叠胶囊宽度（idle 92 / 任务 148） */
  const chatPillWidth = chatActive ? ISLAND_METRICS.chatPill.width : ISLAND_METRICS.chatIdlePill.width
  /** 双岛外缘锚点：随胶囊宽度推导，使双岛间距恒为 dualGap（两岛必须同值） */
  const dualAnchor = dualAnchorFor(chatPillWidth)
  const chatPhase: ChatIslandPhase | "idle" = chatActive ? deriveChatPhase(requestState, messages) : "idle"
  /** 完成/取消态闲置一段时间后自动清空，回到笑脸 idle 态 */
  const chatSettled = chatPhase === "done" || chatPhase === "cancelled"

  /** 清空本轮对话（岛保留，回到笑脸「询问」态） */
  const clearConversation = useCallback(() => {
    clearChat()
    setContext(null)
  }, [clearChat, setContext])

  const island = useIslandCoordinator({
    ttsActive,
    ttsExiting,
    ttsFinished,
    onTtsDismiss: handleTtsDismiss,
    chatSettled,
    onChatIdleReset: clearConversation
  })

  // 退场动画（island-exit）播完 → 真正停止朗读、卸载朗读岛并复位退场标记
  useEffect(() => {
    if (!ttsExiting) return
    const timer = window.setTimeout(() => {
      speechPlayer.stop()
      setTtsExiting(false)
    }, MOVE_MS + 40)
    return () => window.clearTimeout(timer)
  }, [ttsExiting, speechPlayer.stop])

  // 退场期间用户重新发起朗读（loading/playing 等）→ 取消退场，岛回到正常态
  useEffect(() => {
    if (!ttsExiting) return
    const status = speechPlayer.state.status
    if (status !== "finished" && status !== "idle") setTtsExiting(false)
  }, [ttsExiting, speechPlayer.state.status])

  // 流式首个 token 到达时自动展开一次（用户收起过则本轮不再打扰）
  useEffect(() => {
    if (requestState.status !== "streaming") return
    const last = messages[messages.length - 1]
    if (last && last.role === "assistant" && last.content.length > 0) {
      island.requestAutoExpand("chat")
    }
  }, [messages, requestState.status, island.requestAutoExpand])

  // ---------- 划词工具栏（聊天岛常驻后不再相互抑制） ----------

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

  // Open unified panel with selection text and fire action
  const openPanelWithAction = useCallback(
    async (text: string, prompt: string) => {
      setCapturedText(text)
      closeToolbar()
      resetMessages()
      // 新任务触发：重置自动展开窗口并收起另一岛（markIslandTriggered）
      island.markIslandTriggered("chat")

      if (selectionContext) {
        const ctx = { ...selectionContext, text }
        setContext(ctx)
        await runWithSelectionContext(prompt, ctx)
      }
    },
    [selectionContext, setCapturedText, closeToolbar, setContext, runWithSelectionContext, resetMessages, island.markIslandTriggered]
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

        // 朗读触发：朗读岛出现在右侧（形态固定，无主副互换）
        closeToolbar()
        island.markIslandTriggered("tts")
        speechPlayer.start(trimmed)
      }

      void trackEvent("quick_action_clicked", { action_type: action.type })
    },
    [selectionContext, closeToolbar, island.markIslandTriggered, speechPlayer.start]
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
      island.markIslandTriggered("chat")
      await sendPrompt(input)
    },
    [sendPrompt, messages.length, island.markIslandTriggered]
  )

  // ---------- 岛内容组装 ----------

  const chatPillContent = chatActive ? (
    <ChatPillContent phase={chatPhase as ChatIslandPhase} onDismiss={clearConversation} />
  ) : (
    <ChatIdlePill />
  )

  const chatCircleContent = <ChatCircleContent phase={chatPhase} />

  const chatAriaLabel = chatActive ? t("island.chat.label") : t("island.chat.ask")

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

      {/* 聊天岛：常驻（单岛居中，双岛时锁定左缘） */}
      <DynamicIsland
        form={island.chatForm}
        anchor={island.chatAnchor}
        circleSize={ISLAND_METRICS.circle.size}
        pillWidth={chatPillWidth}
        pillHeight={ISLAND_METRICS.chatPill.height}
        dualAnchor={dualAnchor}
        expandedWidth={ISLAND_METRICS.chatPanel.width}
        expandedHeight={ISLAND_METRICS.chatPanel.height}
        ariaLabel={chatAriaLabel}
        circleContent={chatCircleContent}
        pillContent={chatPillContent}
        onActivate={() => island.activateIsland("chat")}
        onDeactivate={() => island.deactivateIsland("chat")}
        onCollapseRequest={() => island.collapseIsland("chat")}>
        <ChatIslandPanel
          capturedText={capturedText}
          messages={messages}
          requestState={requestState.status}
          modelName={modelName}
          onCapturedTextChange={setCapturedText}
          onSend={(input) => {
            void handleFollowupSend(input)
          }}
          onStop={stopStreaming}
          onCollapse={() => island.collapseIsland("chat")}
          onClose={clearConversation}
        />
      </DynamicIsland>

      {/* 朗读岛：朗读激活时出现在右侧 */}
      {ttsActive && (
        <DynamicIsland
          form={island.ttsForm ?? "circle"}
          anchor={island.ttsAnchor}
          circleSize={ISLAND_METRICS.circle.size}
          pillWidth={ISLAND_METRICS.ttsPill.width}
          pillHeight={ISLAND_METRICS.ttsPill.height}
          dualAnchor={dualAnchor}
          expandedWidth={ISLAND_METRICS.ttsBar.width}
          expandedHeight={ISLAND_METRICS.ttsBar.height}
          ariaLabel={t("ui.tts.speaking")}
          circleContent={
            <div style={{ position: "relative", width: ISLAND_METRICS.circle.size, height: ISLAND_METRICS.circle.size }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TtsCircleContent player={speechPlayer} />
              </div>
              {/* 退场倒计时：与退场计时器同帧启停（悬停/展开暂停，移开重计） */}
              {island.ttsDismissCounting && <TtsCountdownRing />}
            </div>
          }
          pillContent={<TtsPillContent player={speechPlayer} />}
          exiting={ttsExiting}
          onActivate={() => island.activateIsland("tts")}
          onDeactivate={() => island.deactivateIsland("tts")}
          onCollapseRequest={() => island.collapseIsland("tts")}>
          <TtsControlBar player={speechPlayer} />
        </DynamicIsland>
      )}
    </div>
  )
}
