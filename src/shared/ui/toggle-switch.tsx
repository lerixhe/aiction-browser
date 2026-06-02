import { uiMotion } from "@/shared/ui/tokens"

interface ToggleSwitchProps {
  checked: boolean
  onChange: () => void
  theme: any
  stopPropagation?: boolean
}

export function ToggleSwitch({ checked, onChange, theme, stopPropagation = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation()
        onChange()
      }}
      style={{
        position: "relative",
        width: 28,
        height: 16,
        borderRadius: 8,
        border: "none",
        background: checked ? theme.accent.primary : theme.border.default,
        cursor: "pointer",
        transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
        padding: 0,
        flexShrink: 0
      }}>
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 14 : 2,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: `left ${uiMotion.durationFast} ${uiMotion.easingStandard}`
        }}
      />
    </button>
  )
}
