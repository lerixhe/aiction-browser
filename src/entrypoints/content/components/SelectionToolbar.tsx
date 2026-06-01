import { useCallback, useLayoutEffect, useRef } from "react"

import PillActionMenu from "@/entrypoints/content/components/PillActionMenu"
import { useUiTheme } from "@/shared/ui/theme"
import { uiLayer, uiTypography } from "@/shared/ui/tokens"
import type { ActionTemplate, SelectionAnchor } from "@/shared/types"

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
  onAction: (template: string, text: string) => void
  onClose: () => void
}

const CURSOR_CLEARANCE = 20
const DOWNWARD_TOLERANCE = 8

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
  onAction,
  onClose
}: Props) {
  const theme = useUiTheme()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<{ x: number; y: number } | null>(null)
  const directionRef = useRef<SelectionDirection>(SelectionDirection.BOTTOM_RIGHT)

  const updatePosition = useCallback(() => {
    if (!visible || !toolbarRef.current || !posRef.current) return

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

    requestAnimationFrame(() => {
      updatePosition()
    })
  }, [visible, anchor, selectionStart, updatePosition])

  const handleActionClick = (action: ActionTemplate) => {
    window.getSelection()?.removeAllRanges()
    onAction(action.template, "")
  }

  if (!visible || !anchor || actions.length === 0) {
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
      <div style={{ position: "relative" }}>
        <PillActionMenu
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
  )
}
