import { useEffect, useRef, useState } from "react"

import { BrandIcon } from "@/shared/ui/icons"
import { MarkdownRenderer } from "@/shared/ui/markdown"
import { useUiTheme } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiTypography, uiLayer } from "@/shared/ui/tokens"
import { createButtonStyle, createCardStyle, createFocusRing, createInputStyle, createOverlayStyle, createStatusMessageStyle } from "@/shared/ui/styles"
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
        {isStreaming ? "思考中…" : "思考过程"}
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

export default function UnifiedPanel({
  capturedText,
  messages,
  requestState,
  onCapturedTextChange,
  onSend,
  onStop,
  onClose
}: Props) {
  const theme = useUiTheme()
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [closePressed, setClosePressed] = useState(false)
  const [sendPressed, setSendPressed] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)

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
    const root = overlayRef.current?.getRootNode()
    const host = root instanceof ShadowRoot ? root.host : null
    if (!host) return
    const children = Array.from(document.body.children)
    const inerted: Element[] = []
    for (const child of children) {
      if (child === host) {
        continue
      }
      child.setAttribute("inert", "")
      inerted.push(child)
    }
    return () => {
      for (const child of inerted) {
        child.removeAttribute("inert")
      }
    }
  }, [])

  const focusRing = (state: string | null, target: string) =>
    focused === target ? createFocusRing(theme.accent.primary) : "none"

  return (
    <div
      ref={overlayRef}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape") {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      style={{
        ...createOverlayStyle(theme),
        zIndex: uiLayer.overlay,
        pointerEvents: "auto",
        fontFamily: uiTypography.fontFamily,
        animation: `unified-overlay-enter 250ms ${uiMotion.easingDecelerate} forwards`
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}>
      <style>{`
        @keyframes unified-overlay-enter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes unified-panel-enter {
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

      {/* Panel */}
      <div
        onClick={(event) => {
          event.stopPropagation()
        }}
        onWheel={(event) => {
          event.stopPropagation()
        }}
        style={{
          ...createCardStyle(theme),
          width: "min(80vw, 960px)",
          maxWidth: "calc(100vw - 32px)",
          height: "min(70vh, calc(100vh - 32px))",
          display: "flex",
          flexDirection: "column",
          borderRadius: uiRadius.xl,
          boxShadow: uiShadow.xl,
          overflow: "hidden",
          animation: `unified-panel-enter 350ms ${uiMotion.easingSpring} forwards`
        }}>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `${uiSpace[12]}px ${uiSpace[16]}px`,
            borderBottom: `0.5px solid ${theme.border.hairline}`,
            flexShrink: 0
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: uiSpace[10] }}>
            <BrandIcon size={28} />
            <span
              style={{
                fontWeight: uiTypography.fontWeight.semibold,
                fontSize: uiTypography.fontSize.xxl,
                letterSpacing: uiTypography.letterSpacing.tight,
                color: theme.text.primary
              }}>
              Aiction
            </span>
          </div>
          <button
            onClick={onClose}
            onMouseDown={() => setClosePressed(true)}
            onMouseUp={() => setClosePressed(false)}
            onFocus={() => setFocused("close")}
            onBlur={() => setFocused(null)}
            aria-label="关闭对话面板"
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
              选中文本
            </div>
            <textarea
              value={capturedText}
              onChange={(event) => onCapturedTextChange(event.target.value)}
              onFocus={() => setFocused("captured")}
              onBlur={() => setFocused(null)}
              rows={3}
              aria-label="已捕获的选区文本"
              placeholder="选中文本将显示在这里..."
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
                ? "选中文本已捕获，点击动作按钮开始对话。"
                : "请选择动作，或直接输入一个问题开始对话。"}
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
              AI 正在生成中…
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
            aria-label="在对话面板中继续提问"
            placeholder="继续提问（Enter 发送，Shift+Enter 换行）"
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
            {isStreaming ? "停止" : "发送"}
          </button>
        </div>
      </div>
    </div>
  )
}
