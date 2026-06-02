import { useState } from "react"
import { uiRadius, uiTypography, type UiTheme } from "@/shared/ui/tokens"

export function ProviderLogoById({
  providerId,
  name,
  size = 24,
  theme
}: {
  providerId: string
  name: string
  size?: number
  theme: UiTheme
}) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: uiRadius.sm,
          background: theme.bg.surfaceMuted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.5,
          fontWeight: uiTypography.fontWeight.semibold,
          color: theme.accent.primary,
          flexShrink: 0
        }}>
        {name.charAt(0)}
      </div>
    )
  }

  return (
    <img
      src={`https://models.dev/logos/${providerId}.svg`}
      width={size}
      height={size}
      onError={() => setError(true)}
      style={{
        borderRadius: uiRadius.sm,
        flexShrink: 0
      }}
    />
  )
}
