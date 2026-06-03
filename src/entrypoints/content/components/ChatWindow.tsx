import { memo, useEffect, useRef, useState } from "react"

import { useDraggable } from "@/entrypoints/content/hooks/useDraggable"
import { MarkdownRenderer } from "@/shared/ui/markdown"
import { useUiTheme } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiTypography, uiLayer } from "@/shared/ui/tokens"
import { createButtonStyle, createCardStyle, createFocusRing, createInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ChatMessage } from "@/shared/types"

interface Props {
  capturedText: string
  messages: ChatMessage[]
  requestState: "idle" | "streaming" | "cancelled" | "failed"
  modelName?: string
  onCapturedTextChange: (text: string) => void
  onSend: (input: string) => void
  onStop: () => void
  onClose: () => void
}

function ChevronIcon({ expanded, color }: { expanded: boolean; color: string }) {
  return (
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
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
        <ChevronIcon expanded={expanded} color={theme.text.secondary} />
        {isStreaming ? t("chat.thinking") : t("chat.thinkingProcess")}
        {isStreaming ? (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: theme.brand.primary,
              animation: "thinking-pulse 1s ease-in-out infinite",
              display: "inline-block"
            }}
          />
        ) : null}
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
      <style>{`
        @keyframes thinking-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
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
        background: item.role === "user" ? theme.accent.primary : theme.bg.surface,
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

export default function ChatWindow({
  capturedText,
  messages,
  requestState,
  modelName,
  onCapturedTextChange,
  onSend,
  onStop,
  onClose
}: Props) {
  const theme = useUiTheme()
  const { t } = useI18n()
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [closePressed, setClosePressed] = useState(false)
  const [sendPressed, setSendPressed] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const { elementRef: draggableRef, handleDragStart, setInitialPosition } = useDraggable({
    initialPosition: {
      x: Math.max(20, window.innerWidth / 2 - 480),
      y: Math.max(20, window.innerHeight / 2 - 350)
    }
  })

  const isStreaming = requestState === "streaming"
  const sendDisabled = isStreaming || !input.trim()
  const hasCapturedText = capturedText.length > 0

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages, requestState])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }

    panel.addEventListener("keydown", handleKeyDown)
    return () => panel.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const focusRing = (state: string | null, target: string) =>
    focused === target ? createFocusRing(theme.accent.primary) : "none"

  const panelStyle: React.CSSProperties = {
    ...createCardStyle(theme),
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(20vw, 320px)",
    maxWidth: "calc(100vw - 32px)",
    aspectRatio: "9/20",
    maxHeight: "calc(100vh - 32px)",
    minWidth: 260,
    minHeight: 300,
    display: "flex",
    flexDirection: "column",
    borderRadius: uiRadius.sm,
    boxShadow: uiShadow.xl,
    overflow: "hidden",
    zIndex: uiLayer.overlay,
    pointerEvents: "auto",
    fontFamily: uiTypography.fontFamily,
    padding: 0,
    resize: "both",
    animation: `floating-panel-enter 350ms ${uiMotion.easingSpring} forwards`
  }

  return (
    <div
      ref={(node) => {
        panelRef.current = node
        if (node) {
          draggableRef.current = node
          setInitialPosition(node)
        }
      }}
      style={panelStyle}
      onClick={(event) => {
        event.stopPropagation()
      }}
      onWheel={(event) => {
        event.stopPropagation()
      }}>
      <style>{`
        @keyframes floating-panel-enter {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
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
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* Close button */}
      <button
        onClick={onClose}
        onMouseDown={(event) => {
          event.stopPropagation()
          setClosePressed(true)
        }}
        onMouseUp={() => setClosePressed(false)}
        onFocus={() => setFocused("close")}
        onBlur={() => setFocused(null)}
        aria-label={t("chat.closePanel")}
        style={{
          position: "absolute",
          top: uiSpace[8],
          right: uiSpace[8],
          zIndex: 10,
          background: hovered === "close" ? theme.bg.surfaceMuted : "transparent",
          color: theme.text.secondary,
          width: 24,
          height: 24,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          border: "none",
          cursor: "pointer",
          transform: closePressed ? "scale(0.9)" : "scale(1)"
        }}
        onMouseEnter={() => setHovered("close")}
        onMouseLeave={() => {
          setHovered(null)
          setClosePressed(false)
        }}>
        <CloseIcon size={12} color={theme.text.secondary} />
      </button>

      {/* Drag handle area */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        style={{
          height: uiSpace[24],
          flexShrink: 0,
          cursor: "grab",
          userSelect: "none"
        }}
      />

      {/* Model name */}
      {modelName && (
        <div
          style={{
            padding: `0 ${uiSpace[8]}px ${uiSpace[4]}px`,
            flexShrink: 0
          }}>
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
              fontFamily: uiTypography.fontFamily
            }}>
            <span style={{ opacity: 0.7 }}>{t("chat.modelLabel")}:</span>
            <span style={{ fontWeight: uiTypography.fontWeight.medium }}>{modelName}</span>
          </div>
        </div>
      )}

      {/* Captured text section */}
      {hasCapturedText && (
        <div
          style={{
            padding: `${uiSpace[4]}px ${uiSpace[8]}px`,
            borderBottom: `0.5px solid ${theme.border.hairline}`,
            flexShrink: 0
          }}>
          <div
            style={{
              fontSize: uiTypography.fontSize.xs,
              fontWeight: uiTypography.fontWeight.medium,
              color: theme.text.secondary,
              marginBottom: uiSpace[4],
              letterSpacing: uiTypography.letterSpacing.wide,
              textTransform: "uppercase"
            }}>
            {t("chat.capturedTextLabel")}
          </div>
          <textarea
            value={capturedText}
            onChange={(event) => onCapturedTextChange(event.target.value)}
            onFocus={() => setFocused("captured")}
            onBlur={() => setFocused(null)}
            onKeyDown={(event) => event.stopPropagation()}
            rows={3}
            aria-label={t("chat.capturedTextareaLabel")}
            placeholder={t("chat.capturedTextareaPlaceholder")}
            style={{
              ...createInputStyle(theme, focused === "captured"),
              width: "100%",
              resize: "vertical",
              borderRadius: uiRadius.sm,
              fontSize: uiTypography.fontSize.sm,
              fontFamily: "inherit",
              lineHeight: 1.4,
              boxSizing: "border-box"
            }}
          />
        </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        data-messages-scroll
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
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: theme.accent.primary,
                animation: "thinking-pulse 1s ease-in-out infinite",
                display: "inline-block"
              }}
            />
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