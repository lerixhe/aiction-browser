import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import ToolbarActionMenu, { ToolbarTooltip } from "@/entrypoints/content/components/ToolbarActionMenu"
import { useUiTheme } from "@/shared/ui/theme"
import { uiLayer, uiMotion, uiRadius, uiTypography } from "@/shared/ui/tokens"
import { ActionIcon } from "@/shared/ui/iconify"
import { useI18n } from "@/shared/i18n/context"
import type { ActionTemplate, QuickAction, SelectionAnchor } from "@/shared/types"

interface SelectionStart {
  x: number
  y: number
}

enum SelectionDirection {
  TOP_LEFT = "TOP_LEFT",
  TOP_RIGHT = "TOP_RIGHT",
  BOTTOM_LEFT = "BOTTOM_LEFT",
  BOTTOM_RIGHT = "BOTTOM_RIGHT"
}

interface Props {
  visible: boolean
  anchor: SelectionAnchor | null
  selectionStart: SelectionStart | null
  actions: ActionTemplate[]
  quickActions: QuickAction[]
  onAction: (template: string, text: string) => void
  onQuickAction: (action: QuickAction) => void
  onClose: () => void
}

const CURSOR_CLEARANCE = 20
const DOWNWARD_TOLERANCE = 8
const BUTTON_HEIGHT = 28
const BUTTON_GAP = 2

function getSelectionDirection(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): SelectionDirection {
  const isRightward = startX <= endX
  const isDownward = startY - DOWNWARD_TOLERANCE <= endY

  if (isRightward && isDownward) return SelectionDirection.BOTTOM_RIGHT
  if (isRightward && !isDownward) return SelectionDirection.TOP_RIGHT
  if (!isRightward && isDownward) return SelectionDirection.BOTTOM_LEFT
  return SelectionDirection.TOP_LEFT
}

function applyDirectionOffset(
  direction: SelectionDirection,
  baseX: number,
  baseY: number,
  toolbarWidth: number,
  toolbarHeight: number
): { x: number; y: number } {
  switch (direction) {
    case SelectionDirection.BOTTOM_RIGHT:
      return { x: baseX, y: baseY + CURSOR_CLEARANCE }
    case SelectionDirection.BOTTOM_LEFT:
      return { x: baseX - toolbarWidth, y: baseY + CURSOR_CLEARANCE }
    case SelectionDirection.TOP_RIGHT:
      return { x: baseX, y: baseY - toolbarHeight - CURSOR_CLEARANCE }
    case SelectionDirection.TOP_LEFT:
      return { x: baseX - toolbarWidth, y: baseY - toolbarHeight - CURSOR_CLEARANCE }
    default:
      return { x: baseX, y: baseY + CURSOR_CLEARANCE }
  }
}

export default function SelectionToolbar({
  visible,
  anchor,
  selectionStart,
  actions,
  quickActions,
  onAction,
  onQuickAction,
  onClose
}: Props) {
  const theme = useUiTheme()
  const { t } = useI18n()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<{ x: number; y: number } | null>(null)
  const directionRef = useRef<SelectionDirection>(SelectionDirection.BOTTOM_RIGHT)

  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const userDraggedRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredQuickId, setHoveredQuickId] = useState<string | null>(null)

  const updatePosition = useCallback(() => {
    if (!visible || !toolbarRef.current || !posRef.current) return
    if (userDraggedRef.current) return

    const toolbarWidth = toolbarRef.current.offsetWidth
    const toolbarHeight = toolbarRef.current.offsetHeight

    const { x, y } = applyDirectionOffset(
      directionRef.current,
      posRef.current.x,
      posRef.current.y,
      toolbarWidth,
      toolbarHeight
    )

    toolbarRef.current.style.top = `${y}px`
    toolbarRef.current.style.left = `${x}px`
  }, [visible])

  useLayoutEffect(() => {
    if (!visible || !anchor) return

    const docX = anchor.mouseX + window.scrollX
    const docY = anchor.mouseY + window.scrollY

    if (selectionStart) {
      directionRef.current = getSelectionDirection(
        selectionStart.x,
        selectionStart.y,
        anchor.mouseX,
        anchor.mouseY
      )
    } else {
      directionRef.current = SelectionDirection.BOTTOM_RIGHT
    }

    posRef.current = { x: docX, y: docY }
    userDraggedRef.current = false

    requestAnimationFrame(() => {
      updatePosition()
    })
  }, [visible, anchor, selectionStart, updatePosition])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current || !toolbarRef.current) return

      const scrollX = window.scrollX
      const scrollY = window.scrollY
      const newX = event.clientX + scrollX - dragOffsetRef.current.x
      const newY = event.clientY + scrollY - dragOffsetRef.current.y

      posRef.current = { x: newX, y: newY }
      toolbarRef.current.style.top = `${newY}px`
      toolbarRef.current.style.left = `${newX}px`
    }

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      setIsDragging(false)
    }

    document.addEventListener("mousemove", handleMouseMove, { passive: true })
    document.addEventListener("mouseup", handleMouseUp, { passive: true })

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  const handleDragStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    if (!toolbarRef.current) return

    const rect = toolbarRef.current.getBoundingClientRect()
    isDraggingRef.current = true
    userDraggedRef.current = true
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    }
    setIsDragging(true)
  }, [])

  const handleActionClick = (action: ActionTemplate) => {
    window.getSelection()?.removeAllRanges()
    onAction(action.template, "")
  }

  if (!visible || !anchor || (actions.length === 0 && quickActions.length === 0)) {
    return null
  }

  return (
    <div
      ref={toolbarRef}
      data-aiction-toolbar="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: uiLayer.overlay,
        pointerEvents: "auto",
        fontFamily: uiTypography.fontFamily,
        opacity: visible ? 1 : 0,
        transition: "opacity 150ms cubic-bezier(0.25, 0.1, 0.25, 1.0)"
      }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        height: 28,
        borderRadius: uiRadius.lg,
        background: theme.bg.surface,
        border: `1px solid ${theme.border.default}`,
        boxShadow: (() => {
          const hex = theme.bg.page.replace("#", "")
          const r = parseInt(hex.substring(0, 2), 16)
          const g = parseInt(hex.substring(2, 4), 16)
          const b = parseInt(hex.substring(4, 6), 16)
          const isDark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
          return isDark
            ? "0 8px 40px 0 rgb(0 0 0 / 0.28), 0 0 1px 0 rgb(0 0 0 / 0.28)"
            : "0 8px 40px 0 rgb(0 0 0 / 0.08), 0 0 1px 0 rgb(0 0 0 / 0.08)"
        })()
      }}>
        <div
          onMouseDown={handleDragStart}
          style={{
            width: 14,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isDragging ? "grabbing" : "grab",
            userSelect: "none",
            flexShrink: 0,
            opacity: isDragging ? 0.9 : 0.4,
            transition: `opacity ${uiMotion.durationFast} ${uiMotion.easingStandard}`
          }}
          onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.opacity = "0.8" }}
          onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.opacity = "0.4" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 3px)",
            gridTemplateRows: "repeat(3, 3px)",
            gap: 2
          }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  background: theme.text.secondary
                }}
              />
            ))}
          </div>
        </div>

        <div style={{
          width: 1,
          height: 16,
          background: theme.border.default,
          flexShrink: 0
        }} />

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: BUTTON_GAP,
          height: BUTTON_HEIGHT,
          padding: "0 4px",
          pointerEvents: "auto"
        }}>
          {quickActions.map((action) => {
            const isHovered = hoveredQuickId === action.id
            const label = t(`options.actions.quickAction.${action.type}` as never)
            const description = t(`options.actions.quickAction.${action.type}.description` as never)
            const tooltip = description !== `${action.type}.description` ? description : label
            return (
              <ToolbarTooltip key={action.id} label={tooltip}>
                <button
                  type="button"
                  aria-label={tooltip}
                  onMouseEnter={() => setHoveredQuickId(action.id)}
                  onMouseLeave={() => setHoveredQuickId(null)}
                  onClick={() => onQuickAction(action)}
                  style={{
                    width: BUTTON_HEIGHT,
                    height: BUTTON_HEIGHT,
                    borderRadius: uiRadius.sm,
                    border: "none",
                    background: isHovered ? theme.accent.primary : "transparent",
                    color: isHovered ? theme.text.inverse : theme.text.primary,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    outline: "none",
                    padding: 0,
                    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                  }}>
                  <ActionIcon
                    icon={action.icon}
                    size={16}
                    color={isHovered ? theme.text.inverse : theme.text.primary}
                  />
                </button>
              </ToolbarTooltip>
            )
          })}

          <ToolbarActionMenu
            actions={actions}
            onActionClick={handleActionClick}
            theme={theme}
            onClose={onClose}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                onClose()
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
