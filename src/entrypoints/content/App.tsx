import { useCallback, useEffect, useRef, useState } from "react"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import ChatSession from "@/entrypoints/content/components/ChatSession"
import SpeechWidget from "@/entrypoints/content/components/SpeechWidget"
import { fallbackAnchor, type AnchorRect } from "@/entrypoints/content/components/floating"
import { useChatSessions } from "@/entrypoints/content/hooks/useChatSessions"
import { useSelectionDetection } from "@/entrypoints/content/hooks/useSelectionDetection"
import { useSpeechPlayer } from "@/entrypoints/content/hooks/useSpeechPlayer"
import { useToolbarState } from "@/entrypoints/content/hooks/useToolbarState"
import { initContentScriptAnalytics, trackEvent } from "@/shared/analytics"
import { copyTextFallback } from "@/shared/clipboard"
import { resolveActionTemplate, formatFreeInputPrompt } from "@/shared/prompt"
import { getSettings } from "@/shared/storage"
import type { SelectionAnchor, SelectionContext, QuickAction } from "@/shared/types"

export default function App() {
  const extensionRootRef = useRef<HTMLDivElement | null>(null)

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

  /** 朗读是否激活（朗读控件挂载中） */
  const ttsActive = speechPlayer.state.status !== "idle"
  // ---------- 对话会话实例（每个 action 触发独立创建，关闭即销毁） ----------

  /**
   * 对话会话管理（多实例并存）：新触发总是追加全新实例，钉住的实例继续驻留；
   * 关闭（× / 点外 / Esc）时按实例逐个销毁。Esc 在 hook 内统一监听，一次关一个。
   */
  const { sessions, openSession, closeSession, setSessionPinned, findSessionForPrompt, revealSession } =
    useChatSessions()

  // ---------- 划词工具栏 ----------

  const handleSelectionChange = useCallback(
    (context: SelectionContext | null, anchor: SelectionAnchor | null) => {
      if (context && anchor) {
        openToolbar(context, anchor)
      } else {
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

      const context = { ...selectionContext, text }
      // 防抖判断必须在任何 await 之前：resolveActionTemplate 不依赖设置项，
      // 放到 await 之后会让「等 storage 的那个窗口」里的第二次点击双双通过检查（连开两个同 prompt 实例）
      const prompt = resolveActionTemplate(template, context)

      // 命中已有卡片：不再静默吞掉点击，让那张卡片闪一圈脉冲作为反馈
      // （同一动作同一选区，答案已经有了，不重新请求；卡片位置不动）
      const existing = findSessionForPrompt(prompt)
      if (existing) {
        revealSession(existing.id)
        return
      }

      // 先同步出新实例：卡片立刻挂出（不等 storage），埋点随后异步补齐
      openSession({
        anchor: takeToolbarAnchor(),
        capturedText: text,
        context,
        initialPrompt: prompt
      })

      const settings = await getSettings()
      const matchedAction = settings.actions.find((a) => a.template === template)
      const BUILTIN_IDS = new Set(["explain", "translate"])
      const customActions = settings.actions.filter((a) => !BUILTIN_IDS.has(a.id))
      void trackEvent("action_clicked", {
        action_id: matchedAction?.id ?? "unknown",
        action_label: matchedAction?.label ?? "unknown",
        custom_action_count: customActions.length,
        custom_action_labels: customActions.map((a) => a.label).join(",")
      })
    },
    [selectionContext, findSessionForPrompt, revealSession, openSession, takeToolbarAnchor]
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
          copyTextFallback(text)
        }
        // 复制属快捷动作，与其它动作一致：保留选区与工具栏，
        // 由用户另行选区 / 点击页面空白时自然关闭
      } else if (action.type === "speakText") {
        const trimmed = text.trim()
        if (!trimmed) return

        // 朗读触发：朗读控件在视口顶部中间以小圆球浮现（随后跟随视口，鼠标移入展开）
        speechPlayer.start(trimmed)
      }

      void trackEvent("quick_action_clicked", { action_type: action.type })
    },
    [selectionContext, speechPlayer.start]
  )

  // Handle free submit from panel captured text
  // （与 action 同路径：自由输入解析出的 prompt 相同且会话仍开着时同样命中防抖，命中即闪一下）
  const handleFreeSubmit = useCallback(
    async (input: string, text: string) => {
      if (!selectionContext) {
        return
      }

      const context = { ...selectionContext, text }
      const prompt = formatFreeInputPrompt(input, text)

      // 防抖：与 handleAction 同规则（钉住的会话也不阻断新触发，仅同 prompt 命中）
      const existing = findSessionForPrompt(prompt)
      if (existing) {
        revealSession(existing.id)
        return
      }

      // 多实例并存：钉住的会话不会被替换，自由输入也弹出新实例（同步先出卡片）
      openSession({
        anchor: takeToolbarAnchor(),
        capturedText: text,
        context,
        initialPrompt: prompt
      })

      void trackEvent("free_input_submitted", { input_length: input.length })
    },
    [selectionContext, findSessionForPrompt, revealSession, openSession, takeToolbarAnchor]
  )

  return (
    <div ref={extensionRootRef} data-aiction-root="true" style={{ pointerEvents: "none" }}>
      <SelectionToolbar
        visible={toolbarVisible}
        anchor={toolbarAnchor}
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

      {/* 对话会话：多实例并存，逐个独立销毁（onClose/onPinnedChange 以 id 闭包捕获） */}
      {sessions.map((session) => (
        <ChatSession
          key={session.id}
          init={session}
          pinned={session.pinned}
          revealNonce={session.revealNonce}
          onPinnedChange={(pinned) => setSessionPinned(session.id, pinned)}
          onClose={() => closeSession(session.id)}
        />
      ))}

      {/* 朗读控件：视口顶部中间浮现，鼠标移入展开为控制条，闲置自动收起为小圆球 */}
      {ttsActive && <SpeechWidget player={speechPlayer} />}
    </div>
  )
}
