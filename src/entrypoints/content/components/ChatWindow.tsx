import { useEffect, useRef, useState } from "react"

import { useDraggable } from "@/entrypoints/content/hooks/useDraggable"
import { BrandIcon } from "@/shared/ui/icons"
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

function DragIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5" cy="4" r="1.25" fill={color} />
      <circle cx="11" cy="4" r="1.25" fill={color} />
      <circle cx="5" cy="8" r="1.25" fill={color} />
      <circle cx="11" cy="8" r="1.25" fill={color} />
      <circle cx="5" cy="12" r="1.25" fill={color} />
      <circle cx="11" cy="12" r="1.25" fill={color} />
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
  const [expanded, setExpanded] = useState(false)
  const autoExpandedRef = useRef(false)

  useEffect(() => {
    if (isStreaming && !autoExpandedRef.current) {
      autoExpandedRef.current = true
      setExpanded(true)
    }
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
            lineHeight: 1.55,
            fontSize: uiTypography.fontSize.sm,
            borderLeft: `2px solid ${theme.brand.primary}`,
            marginLeft: uiSpace[12],
            marginRight: uiSpace[4],
            marginBottom: uiSpace[4],
            opacity: 0.85,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}>
          {reasoning}
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

export default function ChatWindow({
  capturedText,
  messages,
  requestState,
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
    width: "min(80vw, 960px)",
    maxWidth: "calc(100vw - 32px)",
    height: "min(70vh, calc(100vh - 32px))",
    display: "flex",
    flexDirection: "column",
    borderRadius: uiRadius.xl,
    boxShadow: uiShadow.xl,
    overflow: "hidden",
    zIndex: uiLayer.overlay,
    pointerEvents: "auto",
    fontFamily: uiTypography.fontFamily,
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

      {/* Header - Draggable */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${uiSpace[12]}px ${uiSpace[16]}px`,
          borderBottom: `0.5px solid ${theme.border.hairline}`,
          flexShrink: 0,
          cursor: "grab",
          userSelect: "none"
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: uiSpace[10] }}>
          <DragIcon size={16} color={theme.text.secondary} />
          <BrandIcon size={28} />
          <span
            style={{
              fontWeight: uiTypography.fontWeight.semibold,
              fontSize: uiTypography.fontSize.xxl,
              letterSpacing: uiTypography.letterSpacing.tight,
              color: theme.text.primary
            }}>
            AIction
          </span>
        </div>
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
            ...createButtonStyle(theme, "secondary", {
              compact: true,
              pressed: closePressed,
              focused: focused === "close"
            }),
            background: hovered === "close" ? theme.bg.surfaceMuted : "transparent",
            color: theme.text.secondary,
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            transform: closePressed ? "scale(0.9)" : "scale(1)"
          }}
          onMouseEnter={() => setHovered("close")}
          onMouseLeave={() => {
            setHovered(null)
            setClosePressed(false)
          }}>
          <CloseIcon size={14} color={theme.text.secondary} />
        </button>
      </div>

      {/* Captured text section */}
      {hasCapturedText && (
        <div
          style={{
            padding: `${uiSpace[10]}px ${uiSpace[16]}px`,
            borderBottom: `0.5px solid ${theme.border.hairline}`,
            flexShrink: 0
          }}>
          <div
            style={{
              fontSize: uiTypography.fontSize.xs,
              fontWeight: uiTypography.fontWeight.medium,
              color: theme.text.secondary,
              marginBottom: uiSpace[6],
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
            rows={3}
            aria-label={t("chat.capturedTextareaLabel")}
            placeholder={t("chat.capturedTextareaPlaceholder")}
            style={{
              ...createInputStyle(theme, focused === "captured"),
              width: "100%",
              resize: "vertical",
              borderRadius: uiRadius.sm,
              fontSize: uiTypography.fontSize.md,
              fontFamily: "inherit",
              lineHeight: 1.55,
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
          padding: uiSpace[16],
          display: "block",
          background: theme.bg.surfaceAlt,
          minHeight: 0
        }}>
        {messages.length === 0 ? (
          <div
            style={{
              ...createStatusMessageStyle(theme, "info"),
              color: theme.text.secondary,
              fontSize: uiTypography.fontSize.md,
              borderRadius: uiRadius.md,
              padding: `${uiSpace[16]}px ${uiSpace[20]}px`,
              textAlign: "center",
              lineHeight: 1.55
            }}>
            {hasCapturedText
              ? t("chat.emptyWithCapture")
              : t("chat.emptyWithoutCapture")}
          </div>
        ) : null}

        {messages.map((item) => (
          <div
            key={item.id}
            style={{
              display: "block",
              marginLeft: item.role === "user" ? "auto" : undefined,
              maxWidth: "85%",
              marginBottom: uiSpace[12],
              borderRadius: uiRadius.md,
              lineHeight: 1.55,
              fontSize: uiTypography.fontSize.md,
              whiteSpace: "pre-wrap",
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
                  padding: `${uiSpace[10]}px ${uiSpace[14]}px`,
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
        ))}

        {isStreaming ? (
          <div
            style={{
              color: theme.text.secondary,
              ...createStatusMessageStyle(theme, "info"),
              display: "flex",
              alignItems: "center",
              gap: uiSpace[8]
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
          gap: uiSpace[10],
          padding: `${uiSpace[12]}px ${uiSpace[16]}px`,
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
            minHeight: 56,
            resize: "none",
            borderRadius: uiRadius.md,
            padding: `${uiSpace[10]}px ${uiSpace[14]}px`,
            fontSize: uiTypography.fontSize.md,
            fontFamily: "inherit",
            lineHeight: 1.5,
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
            height: 36,
            minWidth: 72,
            alignSelf: "flex-end",
            borderRadius: uiRadius.pill,
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
            padding: `0 ${uiSpace[16]}px`
          }}>
          {isStreaming ? t("chat.stop") : t("chat.send")}
        </button>
      </div>
    </div>
  )
}