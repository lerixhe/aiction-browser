import { useCallback, useEffect, useRef, useState } from "react"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import ChatSession from "@/entrypoints/content/components/ChatSession"
import type { ChatSessionInit } from "@/entrypoints/content/components/ChatSession"
import SpeechWidget from "@/entrypoints/content/components/SpeechWidget"
import { fallbackAnchor, type AnchorRect } from "@/entrypoints/content/components/floating"
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

  const [ttsAnchor, setTtsAnchor] = useState<AnchorRect | null>(null)

  /** 朗读是否激活（朗读控件挂载中） */
  const ttsActive = speechPlayer.state.status !== "idle"

  // ---------- 对话会话实例（每个 action 触发独立创建，关闭即销毁） ----------

  /**
   * 当前对话会话（null = 无会话）。新触发总是创建全新实例：
   * - 不同 action / 选区内容变化 → 新实例替换旧实例（key 变更强制卸载重建）
   * - 同一动作 + 同一选区且会话仍开着（initialPrompt 相同）→ 防抖忽略，不重复响应；
   *   只有会话被关闭（Esc / × / 点窗外）后才能重新触发
   */
  const [chatSession, setChatSession] = useState<ChatSessionInit | null>(null)
  const nextSessionIdRef = useRef(1)

  /** 创建全新对话会话实例（替换并销毁旧实例） */
  const openChatSession = useCallback((session: Omit<ChatSessionInit, "id">) => {
    setChatSession({ ...session, id: nextSessionIdRef.current++ })
  }, [])

  /** 关闭当前对话会话：实例销毁（卸载时中断流式并清理定时器） */
  const closeChatSession = useCallback(() => setChatSession(null), [])

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

  // Handle action
  const handleAction = useCallback(
    async (template: string, text: string) => {
      if (!selectionContext) {
        return
      }

      const settings = await getSettings()
      const context = { ...selectionContext, text }
      const prompt = resolveActionTemplate(template, context, settings)

      // 防抖：同一 action（模板解析 prompt 相同，即选区内容未变）且对话会话
      // 仍开着时忽略重复点击；会话被关闭后（chatSession 为 null 或已换新）才响应
      if (chatSession?.initialPrompt === prompt) {
        return
      }

      const matchedAction = settings.actions.find((a) => a.template === template)
      const BUILTIN_IDS = new Set(["explain", "translate"])
      const customActions = settings.actions.filter((a) => !BUILTIN_IDS.has(a.id))
      void trackEvent("action_clicked", {
        action_id: matchedAction?.id ?? "unknown",
        action_label: matchedAction?.label ?? "unknown",
        custom_action_count: customActions.length,
        custom_action_labels: customActions.map((a) => a.label).join(",")
      })

      // 每次触发均创建独立会话实例（旧实例被整体销毁）
      openChatSession({
        anchor: takeToolbarAnchor(),
        capturedText: text,
        context,
        initialPrompt: prompt
      })
    },
    [selectionContext, chatSession, openChatSession, takeToolbarAnchor]
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
  // （与 action 同路径：自由输入解析出的 prompt 相同且会话仍开着同样防抖）
  const handleFreeSubmit = useCallback(
    async (input: string, text: string) => {
      if (!selectionContext) {
        return
      }

      void trackEvent("free_input_submitted", { input_length: input.length })

      const context = { ...selectionContext, text }
      const prompt = formatFreeInputPrompt(input, text)
      if (chatSession?.initialPrompt === prompt) {
        return
      }

      openChatSession({
        anchor: takeToolbarAnchor(),
        capturedText: text,
        context,
        initialPrompt: prompt
      })
    },
    [selectionContext, chatSession, openChatSession, takeToolbarAnchor]
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

      {/* 对话会话：每个 action 触发独立创建实例，关闭即销毁（key 变更强制重建全新实例） */}
      {chatSession ? (
        <ChatSession key={chatSession.id} init={chatSession} onClose={closeChatSession} />
      ) : null}

      {/* 朗读控件：触发朗读后浮现于工具栏下方，闲置自动收起为小圆球 */}
      {ttsActive && <SpeechWidget player={speechPlayer} anchor={ttsAnchor} />}
    </div>
  )
}
