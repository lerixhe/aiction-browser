import { useMemo } from "react"

import { type UiTheme, uiMotion, uiRadius, uiShadow, uiTypography } from "~/shared/ui/tokens"
import { createFocusRing } from "~/shared/ui/styles"
import type { ActionTemplate } from "~/shared/types"

const PILL_PAD_X = 14
const CHAR_WIDTH = 7.5
const EXPLODE_BUTTON_HEIGHT = 34
const EXPLODE_MIN_LABEL_WIDTH = 72
const EXPLODE_ITEM_GAP = 14
const EXPLODE_MAX_LABEL_WIDTH = 132
const EXPLODE_BASE_RADIUS = 40
const EXPLODE_RING_STEP = 40
const EXPLODE_CONTAINER_PADDING = 56

interface ExplodedActionMenuProps {
  actions: ActionTemplate[]
  hoveredActionId: string | null
  onHoverChange: (actionId: string | null) => void
  onActionClick: (action: ActionTemplate) => void
  theme: UiTheme
  triggerSize: number
}

type PositionedAction = ActionTemplate & {
  width: number
  top: number
  left: number
  zIndex: number
  delayMs: number
}

function estimateWidth(label: string) {
  return Math.min(label.length * CHAR_WIDTH + PILL_PAD_X * 2, EXPLODE_MAX_LABEL_WIDTH)
}

function getSlotCount(actionCount: number) {
  let slotCount = 4

  while (slotCount < actionCount) {
    slotCount *= 2
  }

  return slotCount
}

function getExplodeInnerRadius(slotCount: number) {
  const ringLevel = Math.max(0, Math.log2(slotCount / 4))
  return EXPLODE_BASE_RADIUS + ringLevel * EXPLODE_RING_STEP
}

function getPositionedActions(actions: ActionTemplate[]): PositionedAction[] {
  if (actions.length === 0) {
    return []
  }

  const slotCount = getSlotCount(actions.length)
  const innerRadius = getExplodeInnerRadius(slotCount)
  const containerSize = innerRadius * 2 + EXPLODE_BUTTON_HEIGHT + EXPLODE_CONTAINER_PADDING * 2
  const center = containerSize / 2
  const widths = actions.map((action) => Math.max(estimateWidth(action.label), EXPLODE_MIN_LABEL_WIDTH))

  return actions.map((action, index) => {
    const width = widths[index]
    const angle = -Math.PI / 2 + (index / slotCount) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const innerX = cos * innerRadius
    const innerY = sin * innerRadius
    const outwardOffsetX = cos * (width / 2 + EXPLODE_ITEM_GAP)
    const outwardOffsetY = sin * (EXPLODE_BUTTON_HEIGHT / 2 + EXPLODE_ITEM_GAP)
    const x = innerX + outwardOffsetX
    const y = innerY + outwardOffsetY

    return {
      ...action,
      width,
      left: center + x - width / 2,
      top: center + y - EXPLODE_BUTTON_HEIGHT / 2,
      zIndex: sin < -0.4 ? 3 : sin < 0.4 ? 2 : 1,
      delayMs: index * 42
    }
  })
}

export default function ExplodedActionMenu({
  actions,
  hoveredActionId,
  onHoverChange,
  onActionClick,
  theme,
  triggerSize
}: ExplodedActionMenuProps) {
  const positionedActions = useMemo(() => getPositionedActions(actions), [actions])
  const containerSize = useMemo(() => {
    const innerRadius = getExplodeInnerRadius(getSlotCount(actions.length))
    return innerRadius * 2 + EXPLODE_BUTTON_HEIGHT + EXPLODE_CONTAINER_PADDING * 2
  }, [actions.length])

  return (
    <div
      style={{
        position: "absolute",
        left: triggerSize / 2 - containerSize / 2,
        top: triggerSize / 2 - containerSize / 2,
        width: containerSize,
        height: containerSize,
        pointerEvents: "none"
      }}>
      <style>{`
        @keyframes explode-item-enter {
          from {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(0.42);
            filter: blur(8px);
          }
          65% {
            opacity: 1;
            transform: translate3d(var(--explode-x), var(--explode-y), 0) scale(1.06);
            filter: blur(0);
          }
          to {
            opacity: 1;
            transform: translate3d(var(--explode-x), var(--explode-y), 0) scale(1);
            filter: blur(0);
          }
        }
      `}</style>

      {positionedActions.map((action) => {
        const isHovered = hoveredActionId === action.id
        const offsetX = `${action.left + action.width / 2 - containerSize / 2}px`
        const offsetY = `${action.top + EXPLODE_BUTTON_HEIGHT / 2 - containerSize / 2}px`

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
              position: "absolute",
              left: containerSize / 2 - action.width / 2,
              top: containerSize / 2 - EXPLODE_BUTTON_HEIGHT / 2,
              zIndex: action.zIndex,
              height: EXPLODE_BUTTON_HEIGHT,
              minWidth: action.width,
              borderRadius: uiRadius.pill,
              border: `1px solid ${isHovered ? `${theme.accent.primary}55` : theme.border.hairline}`,
              background: isHovered ? theme.accent.primary : theme.bg.glass,
              color: isHovered ? theme.text.inverse : theme.text.primary,
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: uiTypography.fontSize.sm,
              fontWeight: uiTypography.fontWeight.medium,
              fontFamily: uiTypography.fontFamily,
              whiteSpace: "nowrap",
              outline: "none",
              boxShadow: isHovered ? `${uiShadow.xl}, ${createFocusRing(theme.accent.primary)}` : uiShadow.lg,
              padding: `0 ${PILL_PAD_X}px`,
              pointerEvents: "auto",
              transition: `transform ${uiMotion.durationFast} ${uiMotion.easingSpring}, background ${uiMotion.durationNormal} ${uiMotion.easingDecelerate}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}, box-shadow ${uiMotion.durationNormal} ${uiMotion.easingStandard}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
              transform: `translate3d(${offsetX}, ${offsetY}, 0) scale(${isHovered ? 1.06 : 1})`,
              transformOrigin: "center",
              animation: `explode-item-enter ${uiMotion.durationExpanded} ${uiMotion.easingSpring} ${action.delayMs}ms both`,
              ["--explode-x" as string]: offsetX,
              ["--explode-y" as string]: offsetY
            }}>
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
