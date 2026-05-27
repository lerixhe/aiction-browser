import { useMemo } from "react"

import { type UiTheme, uiMotion, uiRadius, uiShadow, uiTypography } from "~/shared/ui/tokens"
import { createFocusRing } from "~/shared/ui/styles"
import type { ActionTemplate } from "~/shared/types"

const PILL_HEIGHT = 32
const PILL_PAD_X = 14
const CHAR_WIDTH = 7.5
const PILL_GAP = 6

interface PillActionMenuProps {
  actions: ActionTemplate[]
  hoveredActionId: string | null
  onHoverChange: (actionId: string | null) => void
  onActionClick: (action: ActionTemplate) => void
  theme: UiTheme
  triggerSize: number
}

function estimateWidth(label: string) {
  return label.length * CHAR_WIDTH + PILL_PAD_X * 2
}

export default function PillActionMenu({
  actions,
  hoveredActionId,
  onHoverChange,
  onActionClick,
  theme,
  triggerSize
}: PillActionMenuProps) {
  const barOffsetX = useMemo(() => {
    const totalWidth = actions.reduce((sum, action) => sum + estimateWidth(action.label) + PILL_GAP, -PILL_GAP)
    return -(totalWidth - triggerSize) / 2
  }, [actions, triggerSize])

  return (
    <div
      style={{
        position: "absolute",
        left: barOffsetX,
        top: -(PILL_HEIGHT + 16),
        display: "flex",
        gap: PILL_GAP,
        padding: "6px 8px",
        borderRadius: uiRadius.lg,
        background: theme.bg.glass,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `0.5px solid ${theme.border.hairline}`,
        boxShadow: uiShadow.xl,
        pointerEvents: "auto",
        animation: `pill-bar-enter 250ms ${uiMotion.easingSpring} forwards`
      }}>
      <style>{`
        @keyframes pill-bar-enter {
          from {
            opacity: 0;
            transform: translateY(6px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes pill-item-enter {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>

      {actions.map((action, index) => {
        const isHovered = hoveredActionId === action.id

        return (
          <button
            key={action.id}
            type="button"
            title={action.label}
            aria-label={action.label}
            onMouseEnter={() => onHoverChange(action.id)}
            onMouseLeave={() => onHoverChange(null)}
            onClick={() => onActionClick(action)}
            onFocus={() => onHoverChange(action.id)}
            onBlur={() => onHoverChange(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onActionClick(action)
              }
            }}
            style={{
              height: PILL_HEIGHT,
              borderRadius: uiRadius.pill,
              border: "none",
              background: isHovered ? theme.accent.primary : "transparent",
              color: isHovered ? theme.text.inverse : theme.text.primary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: uiTypography.fontSize.sm,
              fontWeight: uiTypography.fontWeight.medium,
              fontFamily: uiTypography.fontFamily,
              whiteSpace: "nowrap",
              outline: "none",
              boxShadow: isHovered ? createFocusRing(theme.accent.primary) : "none",
              padding: `0 ${PILL_PAD_X}px`,
              transform: isHovered ? "scale(1.04)" : "scale(1)",
              transition: `transform 150ms ${uiMotion.easingSpring}, background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
              animation: `pill-item-enter 200ms ${uiMotion.easingSpring} ${index * 30}ms both`,
              pointerEvents: "auto"
            }}>
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
