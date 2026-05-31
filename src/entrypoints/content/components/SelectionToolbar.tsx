import { useEffect, useMemo, useState } from "react"

import PillActionMenu from "@/entrypoints/content/components/PillActionMenu"
import { useUiTheme } from "@/shared/ui/theme"
import { uiLayout, uiLayer, uiTypography } from "@/shared/ui/tokens"
import type { ActionTemplate, SelectionAnchor } from "@/shared/types"

interface Props {
  visible: boolean
  anchor: SelectionAnchor | null
  actions: ActionTemplate[]
  onAction: (template: string, text: string) => void
  onClose: () => void
}

const PILL_HEIGHT = 28
const PILL_GAP = 6
const OFFSET_X = 12
const OFFSET_Y = 12

export default function SelectionToolbar({
  visible,
  anchor,
  actions,
  onAction,
  onClose
}: Props) {
  const theme = useUiTheme()
  const [hoveredActionId, setHoveredActionId] = useState<string | null>(null)

  const position = useMemo(() => {
    if (!anchor) {
      return { top: 0, left: 0 }
    }

    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    // Estimate pill bar width: actions.length * (PILL_HEIGHT + PILL_GAP) - PILL_GAP + padding (16px)
    const pillBarWidth = actions.length * (PILL_HEIGHT + PILL_GAP) - PILL_GAP + 16

    const minTop = uiLayout.edgeInset
    const maxTop = Math.max(minTop, viewportHeight - PILL_HEIGHT - uiLayout.edgeInset)
    const minLeft = uiLayout.edgeInset
    const maxLeft = Math.max(minLeft, viewportWidth - pillBarWidth - uiLayout.edgeInset)

    // Position above the cursor, horizontally centered on cursor
    let top = anchor.mouseY - PILL_HEIGHT - OFFSET_Y
    let left = anchor.mouseX - pillBarWidth / 2

    // Flip below if not enough space above
    if (top < minTop) {
      top = anchor.mouseY + OFFSET_Y
    }

    // Clamp horizontal position
    left = Math.min(Math.max(minLeft, left), maxLeft)

    return { top, left }
  }, [anchor, actions.length])

  const handleActionClick = (action: ActionTemplate) => {
    window.getSelection()?.removeAllRanges()
    onAction(action.template, "")
  }

  useEffect(() => {
    if (!visible) {
      setHoveredActionId(null)
    }
  }, [visible])

  if (!visible || !anchor || actions.length === 0) {
    return null
  }

  return (
    <div
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: uiLayer.overlay,
        pointerEvents: "auto",
        fontFamily: uiTypography.fontFamily
      }}>
      <PillActionMenu
        actions={actions}
        hoveredActionId={hoveredActionId}
        onHoverChange={setHoveredActionId}
        onActionClick={handleActionClick}
        theme={theme}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }
        }}
      />
    </div>
  )
}
