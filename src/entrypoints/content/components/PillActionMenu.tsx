import { type UiTheme, uiMotion, uiRadius, uiShadow, uiTypography } from "@/shared/ui/tokens"
import { createFocusRing } from "@/shared/ui/styles"
import { ActionIcon } from "@/shared/ui/iconify"
import type { ActionTemplate } from "@/shared/types"

const PILL_HEIGHT = 28
const PILL_GAP = 6

function isDarkTheme(theme: UiTheme): boolean {
  const bgColor = theme.bg.page
  const hex = bgColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.5
}

interface PillActionMenuProps {
  actions: ActionTemplate[]
  hoveredActionId: string | null
  onHoverChange: (actionId: string | null) => void
  onActionClick: (action: ActionTemplate) => void
  theme: UiTheme
  onKeyDown?: (event: React.KeyboardEvent) => void
}

export default function PillActionMenu({
  actions,
  hoveredActionId,
  onHoverChange,
  onActionClick,
  theme,
  onKeyDown
}: PillActionMenuProps) {
  return (
    <div
      role="toolbar"
      onKeyDown={onKeyDown}
      style={{
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
              width: PILL_HEIGHT,
              height: PILL_HEIGHT,
              borderRadius: uiRadius.sm,
              border: "none",
              background: isHovered ? theme.accent.primary : theme.bg.surface,
              color: isHovered ? theme.text.inverse : theme.accent.primary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              outline: "none",
              boxShadow: isHovered ? createFocusRing(theme.accent.primary) : "none",
              padding: 0,
              transform: isHovered ? "scale(1.04)" : "scale(1)",
              transition: `transform 150ms ${uiMotion.easingSpring}, background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
              animation: `pill-item-enter 200ms ${uiMotion.easingSpring} ${index * 30}ms both`,
              pointerEvents: "auto"
            }}>
            {action.icon ? (
              <ActionIcon icon={action.icon} size={16} color={isHovered ? theme.text.inverse : theme.accent.primary} />
            ) : (
              <span style={{ fontSize: 10, color: isHovered ? theme.text.inverse : theme.text.secondary }}>?</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
