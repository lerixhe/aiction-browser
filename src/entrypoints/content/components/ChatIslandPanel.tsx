import { memo, useCallback, useEffect, useRef, useState } from "react"

import SmileyFace from "@/entrypoints/content/components/SmileyFace"
import { MarkdownRenderer } from "@/shared/ui/markdown"
import { useUiTheme } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiSpace, uiShadow, uiTypography } from "@/shared/ui/tokens"
import { createButtonStyle, createFocusRing, createInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ChatMessage, ChatRequestState } from "@/shared/types"

/** 聊天任务的胶囊相位 */
export type ChatIslandPhase = "thinking" | "streaming" | "done" | "cancelled" | "failed"

/** 由请求状态 + 消息推导胶囊相位（idle 且无消息视为等待响应的空窗期） */
export function deriveChatPhase(
  requestState: ChatRequestState,
  messages: ChatMessage[]
): ChatIslandPhase {
  if (requestState.status === "failed") return "failed"
  if (requestState.status === "cancelled") return "cancelled"
  if (requestState.status === "streaming") {
    const last = messages[messages.length - 1]
    return last?.role === "assistant" && last.content ? "streaming" : "thinking"
  }
  return messages.length > 0 ? "done" : "thinking"
}

interface Props {
  capturedText: string
  messages: ChatMessage[]
  requestState: ChatRequestState["status"]
  modelName?: string
  onCapturedTextChange: (text: string) => void
  onSend: (input: string) => void
  onStop: () => void
  /** 收起为胶囊（岛保留，对话保留） */
  onCollapse: () => void
  /** 彻底关闭对话（岛消失） */
  onClose: () => void
}

function ChevronDownIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 6L8 10.5L12.5 6" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12M12 4L4 12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
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

/** 流式生成中的打字光标 */
function TypingCursor({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 2.5,
        height: 13,
        borderRadius: 1,
        background: color,
        animation: "island-caret-blink 0.9s steps(1) infinite",
        display: "inline-block"
      }}
      aria-hidden="true"
    />
  )
}

/** 取消/停止的短横图标 */
function CancelledGlyph({ color }: { color: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="13" height="13" rx="2" stroke={color} strokeWidth={2} />
    </svg>
  )
}

/**
 * 聊天岛 idle 态胶囊：笑脸 +「询问」，邀请用户发起对话。
 */
export function ChatIdlePill() {
  const theme = useUiTheme()
  const { t } = useI18n()

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        width: "100%",
        padding: "0 10px"
      }}>
      <SmileyFace size={17} />
      <span
        style={{
          fontSize: 12.5,
          fontWeight: uiTypography.fontWeight.medium,
          color: theme.text.primary,
          whiteSpace: "nowrap"
        }}>
        {t("island.chat.ask")}
      </span>
    </div>
  )
}

/** 聊天岛圆球层内容（当前形态固定为胶囊，此层不激活；保留供单岛场景） */
export function ChatCircleContent({ phase }: { phase: ChatIslandPhase | "idle" }) {
  const theme = useUiTheme()

  if (phase === "idle") return <SmileyFace size={15} animated={false} />
  if (phase === "thinking") return <SmileyFace size={15} mood="thinking" />
  if (phase === "streaming") return <TypingCursor color={theme.brand.primary} />
  if (phase === "cancelled") return <CancelledGlyph color={theme.text.secondary} />
  if (phase === "done") {
    return (
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke={theme.state.success}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    )
  }
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke={theme.state.error}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

/**
 * 灵动岛胶囊态的聊天状态内容（图标 + 文案 + hover 关闭按钮）。
 */
export function ChatPillContent({
  phase,
  onDismiss
}: {
  phase: ChatIslandPhase
  onDismiss: () => void
}) {
  const theme = useUiTheme()
  const { t } = useI18n()
  const [hovered, setHovered] = useState(false)

  const label =
    phase === "thinking"
      ? t("chat.thinking")
      : phase === "streaming"
        ? t("island.chat.generating")
        : phase === "done"
          ? t("island.chat.done")
          : phase === "cancelled"
            ? t("island.chat.cancelled")
            : t("island.chat.failed")

  const color =
    phase === "done"
      ? theme.state.success
      : phase === "failed"
        ? theme.state.error
        : phase === "cancelled"
          ? theme.text.secondary
          : theme.text.primary

  const icon =
    phase === "thinking" ? (
      <SmileyFace size={14} mood="thinking" />
    ) : phase === "streaming" ? (
      <TypingCursor color={theme.brand.primary} />
    ) : phase === "done" ? (
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ color }} aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    ) : phase === "cancelled" ? (
      <CancelledGlyph color={color} />
    ) : (
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color }} aria-hidden="true">
        <path d="M12 8v5" />
        <path d="M12 16.5h.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    )

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {icon}
      <span style={{ fontSize: 12, fontWeight: uiTypography.fontWeight.medium, color }}>{label}</span>
      {hovered && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            onDismiss()
          }}
          onMouseDown={(event) => event.stopPropagation()}
          aria-label={t("chat.closePanel")}
          title={t("chat.closePanel")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "none",
            background: theme.bg.surfaceMuted,
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            animation: `island-pill-fade 120ms ${uiMotion.easingStandard}`
          }}>
          <CloseIcon size={9} color={theme.text.secondary} />
        </button>
      )}
    </div>
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
  const [expanded, setExpanded] = useState(true)
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

export default function ChatIslandPanel({
  capturedText,
  messages,
  requestState,
  modelName,
  onCapturedTextChange,
  onSend,
  onStop,
  onCollapse,
  onClose
}: Props) {
  const theme = useUiTheme()
  const { t } = useI18n()
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [capturedTagHovered, setCapturedTagHovered] = useState(false)
  const [sendPressed, setSendPressed] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: theme.bg.surface,
        fontFamily: uiTypography.fontFamily
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
        @keyframes island-caret-blink {
          0%, 55% { opacity: 1; }
          56%, 100% { opacity: 0.15; }
        }
        @keyframes island-pill-fade {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
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

      {/* 岛头：模型名 + 收起/关闭 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: uiSpace[6],
          padding: `${uiSpace[8]}px ${uiSpace[10]}px ${uiSpace[4]}px`,
          flexShrink: 0
        }}>
        {modelName ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: uiSpace[4],
              padding: `${uiSpace[2]}px ${uiSpace[6]}px`,
              borderRadius: uiRadius.sm,
              background: theme.bg.surfaceMuted,
              fontSize: uiTypography.fontSize.xs,
              color: theme.text.secondary,
              fontFamily: uiTypography.fontFamily,
              minWidth: 0,
              overflow: "hidden"
            }}>
            <span style={{ opacity: 0.7, flexShrink: 0 }}>{t("chat.modelLabel")}:</span>
            <span
              style={{
                fontWeight: uiTypography.fontWeight.medium,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>
              {modelName}
            </span>
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={onCollapse}
          onMouseEnter={() => setHovered("collapse")}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setFocused("collapse")}
          onBlur={() => setFocused(null)}
          aria-label={t("island.chat.collapse")}
          title={t("island.chat.collapse")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "none",
            background: hovered === "collapse" ? theme.bg.surfaceMuted : "transparent",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            boxShadow: focused === "collapse" ? createFocusRing(theme.accent.primary) : "none"
          }}>
          <ChevronDownIcon size={12} color={theme.text.secondary} />
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

      {/* Captured text capsule tag */}
      {hasCapturedText && (
        <div
          style={{
            padding: `${uiSpace[4]}px ${uiSpace[8]}px`,
            borderBottom: `0.5px solid ${theme.border.hairline}`,
            flexShrink: 0
          }}>
          <div
            style={{
              position: "relative",
              display: "inline-flex"
            }}
            onMouseEnter={() => setCapturedTagHovered(true)}
            onMouseLeave={() => setCapturedTagHovered(false)}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: uiSpace[6],
                padding: `${uiSpace[4]}px ${uiSpace[10]}px`,
                borderRadius: 999,
                background: theme.brand.secondary,
                color: theme.text.primary,
                fontSize: uiTypography.fontSize.xs,
                fontWeight: uiTypography.fontWeight.medium,
                cursor: "default",
                transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
                lineHeight: 1.4
              }}
            >
              <span>{t("chat.selectedText")}</span>
              {capturedTagHovered && (
                <button
                  onClick={() => onCapturedTextChange("")}
                  onMouseDown={(event) => event.stopPropagation()}
                  aria-label={t("chat.clearCapturedText")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "none",
                    background: theme.bg.surfaceMuted,
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0
                  }}
                >
                  <CloseIcon size={10} color={theme.text.secondary} />
                </button>
              )}
            </div>
            {capturedTagHovered && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: uiSpace[4],
                  padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                  borderRadius: uiRadius.md,
                  background: theme.bg.surface,
                  border: `1px solid ${theme.border.default}`,
                  boxShadow: uiShadow.md,
                  fontSize: uiTypography.fontSize.xs,
                  color: theme.text.secondary,
                  maxWidth: 280,
                  maxHeight: 120,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  zIndex: 10,
                  lineHeight: 1.4,
                  pointerEvents: "none"
                }}
              >
                {capturedText}
              </div>
            )}
          </div>
        </div>
      )}

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
