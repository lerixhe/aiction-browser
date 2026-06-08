import { useState } from "react"

import { type UiTheme, uiLayer, uiMotion, uiRadius, uiTypography } from "@/shared/ui/tokens"
import { ActionIcon } from "@/shared/ui/iconify"
import type { ActionTemplate } from "@/shared/types"

const BUTTON_HEIGHT = 28
const BUTTON_GAP = 2

interface ToolbarActionMenuProps {
  actions: ActionTemplate[]
  onActionClick: (action: ActionTemplate) => void
  theme: UiTheme
  onClose: () => void
  onKeyDown?: (event: React.KeyboardEvent) => void
}

export function ToolbarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  return (
    <div
      style={{ position: "relative", display: "flex" }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setPos({
          top: rect.top - 6,
          left: rect.left + rect.width / 2
        })
        setShow(true)
      }}
      onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            transform: "translate(-50%, -100%)",
            zIndex: uiLayer.overlay,
            pointerEvents: "none",
            whiteSpace: "nowrap"
          }}>
          <div
            style={{
              background: "rgba(0, 0, 0, 0.8)",
              color: "#fff",
              fontSize: 11,
              fontWeight: uiTypography.fontWeight.medium,
              fontFamily: uiTypography.fontFamily,
              padding: "3px 8px",
              borderRadius: uiRadius.sm,
              lineHeight: 1.4
            }}>
            {label}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ToolbarActionMenu({
  actions,
  onActionClick,
  theme,
  onClose,
  onKeyDown
}: ToolbarActionMenuProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <div
      role="toolbar"
      onKeyDown={onKeyDown}
      style={{
        display: "flex",
        alignItems: "center",
        gap: BUTTON_GAP,
        height: BUTTON_HEIGHT,
        padding: "0 4px",
        pointerEvents: "auto"
      }}>
      {actions.map((action) => {
        const isHovered = hoveredId === action.id

        return (
          <ToolbarTooltip key={action.id} label={action.label}>
            <button
              type="button"
              aria-label={action.label}
              onMouseEnter={() => setHoveredId(action.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onActionClick(action)}
              onFocus={() => setHoveredId(action.id)}
              onBlur={() => setHoveredId(null)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onActionClick(action)
                }
              }}
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
              {action.icon ? (
                <ActionIcon
                  icon={action.icon}
                  size={16}
                  color={isHovered ? theme.text.inverse : theme.text.primary}
                />
              ) : (
                <span style={{ fontSize: 10, color: isHovered ? theme.text.inverse : theme.text.secondary }}>?</span>
              )}
            </button>
          </ToolbarTooltip>
        )
      })}

      <div
        style={{
          width: 1,
          height: 16,
          background: theme.border.default,
          margin: "0 2px",
          flexShrink: 0
        }}
      />

      <ToolbarTooltip label="Close">
        <button
          type="button"
          aria-label="Close toolbar"
          onMouseEnter={() => setHoveredId("__close__")}
          onMouseLeave={() => setHoveredId(null)}
          onClick={onClose}
          style={{
            width: BUTTON_HEIGHT,
            height: BUTTON_HEIGHT,
            borderRadius: uiRadius.sm,
            border: "none",
            background: hoveredId === "__close__" ? theme.state.errorBg : "transparent",
            color: hoveredId === "__close__" ? theme.state.error : theme.text.secondary,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
            padding: 0,
            transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}`
          }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </button>
      </ToolbarTooltip>
    </div>
  )
}
