import { type CSSProperties, useEffect } from "react"
import type { UiThemeName } from "~/shared/ui/tokens"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiThemes, uiTypography, uiLayer } from "~/shared/ui/tokens"
import { createButtonStyle, createCardStyle, createOverlayStyle } from "~/shared/ui/styles"

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  themeName: UiThemeName
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, themeName }: ConfirmDialogProps) {
  const theme = uiThemes[themeName]
  const titleId = "confirm-dialog-title"
  const descriptionId = "confirm-dialog-description"

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  const overlayStyle: CSSProperties = {
    ...createOverlayStyle(theme),
    zIndex: uiLayer.overlay,
    animation: `fadeIn ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  }

  const cardStyle: CSSProperties = {
    ...createCardStyle(theme),
    maxWidth: 400,
    width: "calc(100% - 48px)",
    padding: `${uiSpace[28]}px`,
    borderRadius: uiRadius.lg,
    boxShadow: uiShadow.xl,
    animation: `slideUp ${uiMotion.durationNormal} ${uiMotion.easingSpring}`
  }

  const cancelBtnStyle = createButtonStyle(theme, "secondary")
  const confirmBtnStyle = createButtonStyle(theme, "danger")

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}>
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontSize: uiTypography.fontSize.xxl,
            fontWeight: uiTypography.fontWeight.bold,
            letterSpacing: uiTypography.letterSpacing.tight,
            color: theme.text.primary
          }}>
          {title}
        </h2>
        <p
          id={descriptionId}
          style={{
            margin: `${uiSpace[8]}px 0 0`,
            fontSize: uiTypography.fontSize.md,
            color: theme.text.secondary,
            lineHeight: 1.55
          }}>
          {message}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: uiSpace[12],
            marginTop: uiSpace[24]
          }}>
          <button style={cancelBtnStyle} onClick={onCancel}>
            取消
          </button>
          <button style={confirmBtnStyle} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97) }
          to { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  )
}
