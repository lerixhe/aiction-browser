import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { MarkdownRenderer } from "@/shared/ui/markdown"
import { useUiTheme } from "@/shared/ui/theme"
import {
  EDGE_INSET,
  placeNearAnchor,
  type AnchorRect
} from "@/entrypoints/content/components/floating"
import { uiLayer, uiMotion, uiRadius, uiSpace, uiShadow, uiTypography } from "@/shared/ui/tokens"
import { createButtonStyle, createFocusRing, createInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ChatMessage, ChatRequestState } from "@/shared/types"

/** 对话窗宽度 */
const PANEL_WIDTH = 340
/** 对话窗理想高度（超高视口按可用高度收缩） */
const PANEL_MAX_HEIGHT = 560

function CloseIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12M12 4L4 12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

/** 模型图标（芯片造型）：替代原「模型：xxx」文本胶囊，悬停时 title 提示完整模型名 */
function ModelIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="7"
        rx="1.5"
        stroke={color}
        strokeWidth={1.2}
      />
      <rect x="6.75" y="6.75" width="2.5" height="2.5" rx="0.75" fill={color} opacity={0.55} />
      <path
        d="M6 2.2v2.3M10 2.2v2.3M6 11.5v2.3M10 11.5v2.3M2.2 6h2.3M2.2 10h2.3M11.5 6h2.3M11.5 10h2.3"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 图钉图标：pinned 为实心（副色高亮），unpinned 为描边 */
function PinIcon({ size, color, pinned }: { size: number; color: string; pinned: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ transform: pinned ? "rotate(45deg)" : "rotate(0deg)", transition: `transform ${uiMotion.durationFast} ${uiMotion.easingStandard}` }}
    >
      <path
        d="M6.2 2.5h3.6v3.7l1.7 1.8H4.5l1.7-1.8z"
        fill={pinned ? color : "none"}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path d="M8 8v5.5" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  )
}

/** 思考中的跳动圆点 */
function ThinkingDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        animation: "thinking-pulse 1s ease-in-out infinite",
        display: "inline-block"
      }}
      aria-hidden="true"
    />
  )
}

interface ThinkingTheme {
  text: { secondary: string; primary: string }
  bg: { surfaceMuted: string; surface: string }
  border: { subtle: string }
  brand: { primary: string }
}

function ThinkingBlock({
  reasoning,
  isStreaming,
  theme
}: {
  reasoning: string
  isStreaming: boolean
  theme: ThinkingTheme
}) {
  const { t } = useI18n()
  // 通用方案：思考块默认折叠（不依赖模型是否支持关闭思考），点击标题可展开查看
  const [expanded, setExpanded] = useState(false)
  const prevStreamingRef = useRef(isStreaming)

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setExpanded(false)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.border.subtle}`,
        fontSize: uiTypography.fontSize.sm
      }}>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: uiSpace[6],
          width: "100%",
          padding: `${uiSpace[8]}px ${uiSpace[12]}px`,
          border: "none",
          background: "transparent",
          color: theme.text.secondary,
          cursor: "pointer",
          fontFamily: uiTypography.fontFamily,
          fontSize: uiTypography.fontSize.sm,
          fontWeight: uiTypography.fontWeight.medium,
          textAlign: "left"
        }}>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: `transform ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
            flexShrink: 0
          }}>
          <path
            d="M3.5 1.5L7 5L3.5 8.5"
            stroke={theme.text.secondary}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {isStreaming ? t("chat.thinking") : t("chat.thinkingProcess")}
        {isStreaming ? <ThinkingDot color={theme.brand.primary} /> : null}
      </button>
      {expanded ? (
        <div
          style={{
            padding: `0 ${uiSpace[12]}px ${uiSpace[8]}px`,
            color: theme.text.secondary,
            borderLeft: `2px solid ${theme.brand.primary}`,
            marginLeft: uiSpace[12],
            marginRight: uiSpace[4],
            marginBottom: uiSpace[4],
            opacity: 0.85
          }}>
          <MarkdownRenderer content={reasoning} color={theme.text.secondary} />
        </div>
      ) : null}
    </div>
  )
}

interface MessageBubbleProps {
  item: ChatMessage
  isStreaming: boolean
  theme: ReturnType<typeof useUiTheme>
}

const MessageBubble = memo(function MessageBubble({ item, isStreaming, theme }: MessageBubbleProps) {
  return (
    <div
      style={{
        display: "block",
        marginLeft: item.role === "user" ? "auto" : undefined,
        maxWidth: "85%",
        marginBottom: uiSpace[8],
        borderRadius: uiRadius.md,
        lineHeight: 1.4,
        fontSize: uiTypography.fontSize.sm,
        whiteSpace: item.role === "user" ? "pre-wrap" : "normal",
        wordBreak: "break-word",
        background: item.role === "user" ? theme.accent.primary : theme.bg.surfaceMuted,
        color: item.role === "user" ? theme.text.inverse : theme.text.primary,
        border: item.role === "user" ? "none" : `0.5px solid ${theme.border.hairline}`,
        boxShadow: item.role === "user" ? uiShadow.sm : uiShadow.sm,
        animation: `message-enter 300ms ${uiMotion.easingDecelerate} forwards`,
        overflow: "hidden"
      }}>
      {item.role === "assistant" && item.reasoning_content ? (
        <ThinkingBlock
          reasoning={item.reasoning_content}
          isStreaming={isStreaming && !item.content}
          theme={theme}
        />
      ) : null}
      {item.content ? (
        <div
          style={{
            padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
            overflowWrap: "break-word",
            wordBreak: "break-word"
          }}>
          {item.role === "assistant" ? (
            <MarkdownRenderer content={item.content} />
          ) : (
            item.content
          )}
        </div>
      ) : null}
    </div>
  )
})

interface Props {
  /** 对话窗是否可见（触发动作时自动打开） */
  open: boolean
  /** 锚定矩形（工具栏落位，文档坐标）；null 时回退到视口上方居中 */
  anchor: AnchorRect | null
  /** 触发时的选区文本快照（目前仅用于空状态文案区分） */
  capturedText: string
  messages: ChatMessage[]
  requestState: ChatRequestState["status"]
  modelName?: string
  /** 钉住状态由父级（ChatSession/App）持有：钉住后点击窗外不关闭，且父级可据此保护会话不被新触发替换 */
  pinned: boolean
  onPinChange: (pinned: boolean) => void
  onSend: (input: string) => void
  onStop: () => void
  /** 关闭对话窗（清空本轮对话） */
  onClose: () => void
}

/**
 * 悬浮对话窗：触发 AI 动作后自动浮现在划词工具栏下方（下方放不下自动翻转到上方）。
 * 自带关闭交互（Esc / 点击窗外 / 头部 ×）；点击窗外不包含扩展 UI 内部的点击。
 */
export default function ChatPanel({
  open,
  anchor,
  capturedText,
  messages,
  requestState,
  modelName,
  pinned,
  onPinChange,
  onSend,
  onStop,
  onClose
}: Props) {
  const theme = useUiTheme()
  const { t } = useI18n()
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [sendPressed, setSendPressed] = useState(false)
  /** 钉住状态（受控 props）：钉住后点击窗外不再关闭对话窗（Esc / × 仍可关闭） */
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned
  /** 拖拽进行中（头部 cursor 态） */
  const [dragging, setDragging] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  /** 收起路径回调走 ref，document 级监听不随回调重建 */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // ---------- 落位：工具栏下方，放不下翻转上方，最后收敛回视口 ----------
  // 用户拖拽头部后位置改由用户接管：此后不再按锚点重算，仅在 resize 时收敛回视口

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  /** 用户是否已拖拽过位置（拖拽后位置归用户管） */
  const draggedRef = useRef(false)

  /** 把面板位置钳制回当前视口（拖拽中与 resize 后都用它防丢） */
  const clampPanelPos = useCallback((p: { left: number; top: number }) => {
    const height = Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_INSET * 2)
    const maxLeft = Math.max(
      EDGE_INSET,
      Math.max(document.documentElement.clientWidth, document.documentElement.scrollWidth) - PANEL_WIDTH - EDGE_INSET
    )
    const viewportTop = window.scrollY + EDGE_INSET
    const viewportBottom = window.scrollY + window.innerHeight - EDGE_INSET - height
    return {
      left: Math.min(Math.max(p.left, EDGE_INSET), maxLeft),
      top: Math.min(Math.max(p.top, viewportTop), Math.max(viewportTop, viewportBottom))
    }
  }, [])

  const computePosition = useCallback(() => {
    if (!open) return
    // 用户拖拽过后位置归用户接管，resize 只需要钳制回视口，不再按锚点重算
    if (draggedRef.current) {
      setPos((prev) => (prev ? clampPanelPos(prev) : prev))
      return
    }
    const height = Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_INSET * 2)
    const rect =
      anchor ??
      ({ x: window.scrollX + window.innerWidth / 2, y: window.scrollY + 80, width: 0, height: 0 } satisfies AnchorRect)
    const placed = placeNearAnchor(rect, PANEL_WIDTH, height)
    setPos({ left: placed.left, top: placed.top })
  }, [open, anchor, clampPanelPos])

  useLayoutEffect(() => {
    computePosition()
  }, [computePosition])

  // 视口尺寸变化时重新钳制（仅贴边时需要；拖拽后钳制回当前视口）
  useEffect(() => {
    if (!open) return
    const handleResize = () => computePosition()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [open, computePosition])

  // ---------- 拖拽：按住头部空白处拖动整个对话窗（头部按钮不受影响） ----------

  const handleHeaderPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      // 头部上的功能按钮（模型图标 / 钉子 / 关闭）不触发拖拽
      if ((event.target as HTMLElement).closest("button")) return
      event.preventDefault()
      if (!pos) return
      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: pos.left,
        top: pos.top
      }
      draggedRef.current = true
      setDragging(true)

      const handleMove = (e: PointerEvent) => {
        setPos(
          clampPanelPos({
            left: start.left + (e.clientX - start.pointerX),
            top: start.top + (e.clientY - start.pointerY)
          })
        )
      }
      const handleUp = () => {
        setDragging(false)
        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", handleUp)
        window.removeEventListener("pointercancel", handleUp)
      }
      window.addEventListener("pointermove", handleMove)
      window.addEventListener("pointerup", handleUp)
      window.addEventListener("pointercancel", handleUp)
    },
    [pos, clampPanelPos]
  )

  // ---------- 关闭交互：点击窗外（未钉住时）----------
  // 注意：Esc 关闭已上移到 useChatSessions 统一监听（多实例并存时避免一次按键连环关关闭所有面板）

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      // 钉住后点击窗外不关闭（Esc / × 仍可关闭）
      if (pinnedRef.current) return
      const path = event.composedPath()
      if (panelRef.current && path.includes(panelRef.current)) return
      // 点击扩展 UI 内部（划词工具栏 / 朗读控件等）不关闭对话窗：
      // 面板开着时工具栏也保持可见，需要支持从工具栏连续触发其他动作
      const insideExtension = path.some(
        (el) => el instanceof Element && (el as Element).closest('[data-aiction-root="true"]') != null
      )
      if (insideExtension) return
      onCloseRef.current()
    }

    document.addEventListener("mousedown", handlePointerDown, true)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true)
    }
  }, [open])

  const isStreaming = requestState === "streaming"
  const sendDisabled = isStreaming || !input.trim()
  const hasCapturedText = capturedText.length > 0
  /** 用户是否停在消息区底部附近（流式期间仅贴底时才自动跟随滚动） */
  const isNearBottomRef = useRef(true)

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || !isNearBottomRef.current) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages, requestState])

  const focusRing = (state: string | null, target: string) =>
    focused === target ? createFocusRing(theme.accent.primary) : "none"

  if (!open) return null

  return (
    <div
      ref={panelRef}
      data-aiction-chat-panel="true"
      role="dialog"
      aria-label={t("chat.inputLabel")}
      style={{
        position: "absolute",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: PANEL_WIDTH,
        height: Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_INSET * 2),
        zIndex: uiLayer.panel,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        borderRadius: uiRadius.xl,
        background: theme.bg.surface,
        border: `1px solid ${theme.border.default}`,
        boxShadow: uiShadow.lg,
        overflow: "hidden",
        fontFamily: uiTypography.fontFamily,
        animation: `floating-enter 220ms ${uiMotion.easingDecelerate} both`
      }}>
      <style>{`
        @keyframes message-enter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes floating-enter {
          from {
            opacity: 0;
            transform: translateY(6px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes thinking-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        [data-messages-scroll]::-webkit-scrollbar {
          width: 6px;
        }
        [data-messages-scroll]::-webkit-scrollbar-track {
          background: transparent;
        }
        [data-messages-scroll]::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.12);
          border-radius: 3px;
        }
        [data-messages-scroll]::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.2);
        }
      `}</style>

      {/* 头部：拖拽手柄（模型图标左置，钉子 + 关闭右置；按钮不可拖拽） */}
      <div
        onPointerDown={handleHeaderPointerDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: uiSpace[6],
          padding: `${uiSpace[6]}px ${uiSpace[10]}px ${uiSpace[4]}px`,
          flexShrink: 0,
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
          WebkitUserSelect: "none"
        }}>
        {modelName ? (
          <div
            onMouseEnter={() => setHovered("model")}
            onMouseLeave={() => setHovered(null)}
            aria-label={`${t("chat.modelLabel")}: ${modelName}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: uiSpace[4],
              padding: `${uiSpace[2]}px ${uiSpace[6]}px ${uiSpace[2]}px`,
              borderRadius: uiRadius.sm,
              flexShrink: 1,
              minWidth: 0,
              overflow: "hidden",
              background: hovered === "model" ? theme.bg.surfaceMuted : "transparent"
            }}>
            <ModelIcon size={14} color={theme.text.secondary} />
            <span
              style={{
                fontSize: uiTypography.fontSize.xs,
                color: theme.text.secondary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>
              {modelName}
            </span>
          </div>
        ) : null}

        <div style={{ flex: 1, alignSelf: "stretch" }} />

        <button
          onClick={() => onPinChange(!pinned)}
          onMouseEnter={() => setHovered("pin")}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setFocused("pin")}
          onBlur={() => setFocused(null)}
          aria-pressed={pinned}
          aria-label={pinned ? t("chat.unpinPanel") : t("chat.pinPanel")}
          title={pinned ? t("chat.unpinPanel") : t("chat.pinPanel")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "none",
            background:
              pinned || hovered === "pin" ? theme.bg.surfaceMuted : "transparent",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            boxShadow: focused === "pin" ? createFocusRing(theme.accent.primary) : "none"
          }}>
          <PinIcon
            size={13}
            color={pinned ? theme.accent.primary : theme.text.secondary}
            pinned={pinned}
          />
        </button>

        <button
          onClick={onClose}
          onMouseEnter={() => setHovered("close")}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setFocused("close")}
          onBlur={() => setFocused(null)}
          aria-label={t("chat.closePanel")}
          title={t("chat.closePanel")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "none",
            background: hovered === "close" ? theme.bg.surfaceMuted : "transparent",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            boxShadow: focused === "close" ? createFocusRing(theme.accent.primary) : "none"
          }}>
          <CloseIcon size={11} color={theme.text.secondary} />
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        data-messages-scroll
        onScroll={handleMessagesScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: uiSpace[6],
          display: "block",
          background: theme.bg.surfaceAlt,
          minHeight: 0
        }}>
        {messages.length === 0 ? (
          <div
            style={{
              ...createStatusMessageStyle(theme, "info"),
              color: theme.text.secondary,
              fontSize: uiTypography.fontSize.sm,
              borderRadius: uiRadius.md,
              padding: `${uiSpace[10]}px ${uiSpace[14]}px`,
              textAlign: "center",
              lineHeight: 1.4
            }}>
            {hasCapturedText
              ? t("chat.emptyWithCapture")
              : t("chat.emptyWithoutCapture")}
          </div>
        ) : null}

        {messages.map((item) => (
          <MessageBubble
            key={item.id}
            item={item}
            isStreaming={isStreaming}
            theme={theme}
          />
        ))}

        {isStreaming ? (
          <div
            style={{
              color: theme.text.secondary,
              ...createStatusMessageStyle(theme, "info"),
              display: "flex",
              alignItems: "center",
              gap: uiSpace[6]
            }}>
            <ThinkingDot color={theme.accent.primary} />
            {t("chat.generating")}
          </div>
        ) : null}
      </div>

      {/* Input area */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: uiSpace[6],
          padding: `${uiSpace[6]}px ${uiSpace[8]}px`,
          borderTop: `0.5px solid ${theme.border.hairline}`,
          background: theme.bg.surface,
          flexShrink: 0
        }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onFocus={() => setFocused("input")}
          onBlur={() => setFocused(null)}
          onKeyDown={(event) => {
            event.stopPropagation()

            // 输入法组合中的 Enter 是确认候选词，不能当成发送
            if (event.nativeEvent.isComposing) {
              return
            }

            if (event.key !== "Enter" || event.shiftKey) {
              return
            }

            event.preventDefault()

            const value = input.trim()
            if (!value || isStreaming) {
              return
            }

            onSend(value)
            setInput("")
          }}
          aria-label={t("chat.inputLabel")}
          placeholder={t("chat.inputPlaceholder")}
          style={{
            ...createInputStyle(theme, focused === "input"),
            flex: 1,
            minHeight: 44,
            resize: "none",
            borderRadius: uiRadius.sm,
            padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
            fontSize: uiTypography.fontSize.sm,
            fontFamily: "inherit",
            lineHeight: 1.4,
            boxShadow: focusRing(focused, "input")
          }}
        />
        <button
          onClick={() => {
            if (isStreaming) {
              onStop()
              return
            }

            const value = input.trim()
            if (!value) {
              return
            }

            onSend(value)
            setInput("")
          }}
          onMouseEnter={() => setHovered("send")}
          onMouseLeave={() => {
            setHovered(null)
            setSendPressed(false)
          }}
          onMouseDown={() => setSendPressed(true)}
          onMouseUp={() => setSendPressed(false)}
          onFocus={() => setFocused("send")}
          onBlur={() => setFocused(null)}
          disabled={sendDisabled && !isStreaming}
          style={{
            ...createButtonStyle(theme, isStreaming ? "secondary" : "primary", {
              disabled: sendDisabled && !isStreaming,
              pressed: sendPressed,
              focused: focused === "send"
            }),
            height: 32,
            minWidth: 60,
            alignSelf: "center",
            borderRadius: uiRadius.md,
            background: isStreaming
              ? theme.bg.surfaceMuted
              : sendDisabled
                ? theme.state.disabled
                : hovered === "send"
                  ? theme.accent.primaryHover
                  : theme.accent.primary,
            cursor: isStreaming ? "pointer" : sendDisabled ? "not-allowed" : "pointer",
            opacity: sendDisabled && !isStreaming ? 0.5 : 1,
            transform: sendPressed ? "scale(0.95)" : "scale(1)",
            padding: `0 ${uiSpace[12]}px`,
            fontSize: uiTypography.fontSize.sm
          }}>
          {isStreaming ? t("chat.stop") : t("chat.send")}
        </button>
      </div>
    </div>
  )
}
