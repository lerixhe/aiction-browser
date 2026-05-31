import { useEffect, useMemo, useState } from "react"

import PillActionMenu from "@/entrypoints/content/components/PillActionMenu"
import { BrandIcon } from "@/shared/ui/icons"
import { useUiTheme } from "@/shared/ui/theme"
import { uiLayout, uiLayer, uiMotion, uiRadius, uiShadow, uiTypography } from "@/shared/ui/tokens"
import { createFocusRing } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ActionTemplate, SelectionAnchor } from "@/shared/types"

interface Props {
  visible: boolean
  anchor: SelectionAnchor | null
  actions: ActionTemplate[]
  onAction: (template: string, text: string) => void
  onClose: () => void
}

const TRIGGER_SIZE = 25

type RingAction = { id: string; label: string; template: string }

export default function SelectionToolbar({
  visible,
  anchor,
  actions,
  onAction,
  onClose
}: Props) {
  const theme = useUiTheme()
  const { t } = useI18n()
  const [ringOpen, setRingOpen] = useState(false)
  const [ringHovered, setRingHovered] = useState<string | null>(null)
  const [triggerPressed, setTriggerPressed] = useState(false)

  const allActions: RingAction[] = useMemo(() =>
    actions.map((a) => ({ id: a.id, label: a.label, template: a.template }))
    , [actions])

  const position = useMemo(() => {
    if (!anchor) {
      return { top: 0, left: 0 }
    }

    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const OFFSET_X = 12
    const OFFSET_Y = 12

    const minTop = uiLayout.edgeInset
    const maxTop = Math.max(minTop, viewportHeight - TRIGGER_SIZE - uiLayout.edgeInset)
    const minLeft = uiLayout.edgeInset
    const maxLeft = Math.max(minLeft, viewportWidth - TRIGGER_SIZE - uiLayout.edgeInset)

    let top = anchor.mouseY - TRIGGER_SIZE - OFFSET_Y
    let left = anchor.mouseX + OFFSET_X

    if (left + TRIGGER_SIZE > viewportWidth - uiLayout.edgeInset) {
      left = anchor.mouseX - TRIGGER_SIZE - OFFSET_X
    }

    top = Math.min(Math.max(minTop, top), maxTop)
    left = Math.min(Math.max(minLeft, left), maxLeft)

    return { top, left }
  }, [anchor])

  const handleTriggerEnter = () => {
    setRingOpen(true)
  }

  const handleActionClick = (action: RingAction) => {
    setRingOpen(false)
    setRingHovered(null)
    window.getSelection()?.removeAllRanges()
    onAction(action.template, "")
  }

  useEffect(() => {
    if (!visible) {
      setRingOpen(false)
      setRingHovered(null)
    }
  }, [visible])

  if (!visible || !anchor) {
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
      <button
        type="button"
        aria-label={ringOpen ? t("toolbar.collapseMenu") : t("toolbar.expandMenu")}
        aria-expanded={ringOpen}
        onMouseEnter={handleTriggerEnter}
        onClick={() => {
          if (ringOpen) {
            setRingOpen(false)
            setRingHovered(null)
          } else {
            setRingOpen(true)
          }
        }}
        onMouseDown={() => setTriggerPressed(true)}
        onMouseUp={() => setTriggerPressed(false)}
        onFocus={handleTriggerEnter}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            if (ringOpen) {
              setRingOpen(false)
              setRingHovered(null)
            } else {
              onClose()
            }
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setRingOpen((prev) => !prev)
          }
        }}
        style={{
          width: TRIGGER_SIZE,
          height: TRIGGER_SIZE,
          background: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          border: "none",
          padding: 0,
          outline: "none",
          boxShadow: triggerPressed ? uiShadow.md : `${uiShadow.lg}, ${ringOpen ? createFocusRing(theme.accent.primary) : "none"}`,
          borderRadius: uiRadius.sm,
          transform: triggerPressed ? "scale(0.92)" : ringOpen ? "scale(1.08)" : "scale(1)",
          transition: `transform 200ms ${uiMotion.easingSpring}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}`
        }}>
        <BrandIcon size={TRIGGER_SIZE} />
      </button>

      {ringOpen && (
        <PillActionMenu
          actions={actions}
          hoveredActionId={ringHovered}
          onHoverChange={setRingHovered}
          onActionClick={handleActionClick}
          theme={theme}
          triggerSize={TRIGGER_SIZE}
        />
      )}
    </div>
  )
}
