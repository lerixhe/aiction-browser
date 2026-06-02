import { uiMotion, uiRadius, uiSpace, uiTypography, type UiTheme } from "@/shared/ui/tokens"
import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { ProviderLogoById } from "./ProviderLogo"
import type { ExtensionSettings, ProviderConfig } from "@/shared/types"
import { useI18n } from "@/shared/i18n/context"
import { createStatusMessageStyle } from "@/shared/ui/styles"

interface ProviderListProps {
  providers: ProviderConfig[]
  selectedProviderId: string | null
  activeProviderId: string
  theme: UiTheme
  onSelect: (provider: ProviderConfig) => void
  onToggleActive: (providerId: string) => void
}

export function ProviderList({
  providers,
  selectedProviderId,
  activeProviderId,
  theme,
  onSelect,
  onToggleActive
}: ProviderListProps) {
  const { t } = useI18n()

  const emptyStateStyle = {
    ...createStatusMessageStyle(theme, "info"),
    textAlign: "center" as const,
    padding: `${uiSpace[24]}px ${uiSpace[16]}px`,
    border: `1px dashed ${theme.border.default}`,
    background: theme.bg.surfaceMuted,
    color: theme.text.secondary,
    fontSize: uiTypography.fontSize.md
  }

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        borderRight: `0.5px solid ${theme.border.hairline}`,
        display: "flex",
        flexDirection: "column"
      }}>
      <div style={{ flex: 1, overflowY: "auto", padding: uiSpace[8] }}>
        {providers.length === 0 ? (
          <div style={{ ...emptyStateStyle, margin: uiSpace[8], fontSize: uiTypography.fontSize.sm }}>
            {t("options.connection.emptyServiceList")}
          </div>
        ) : (
          providers.map((provider) => {
            const isSelected = selectedProviderId === provider.id
            const isActive = activeProviderId === provider.id
            const displayName = provider.name || "Custom"

            return (
              <div
                key={provider.id}
                onClick={() => onSelect(provider)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: uiSpace[8],
                  padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                  marginBottom: 2,
                  borderRadius: uiRadius.sm,
                  cursor: "pointer",
                  background: isSelected ? `${theme.accent.primary}14` : "transparent",
                  transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                }}>
                {provider.modelsDevId ? (
                  <ProviderLogoById providerId={provider.modelsDevId} name={displayName} size={28} theme={theme} />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: uiRadius.sm,
                      background: theme.bg.surfaceMuted,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: uiTypography.fontWeight.semibold,
                      color: theme.accent.primary,
                      flexShrink: 0
                    }}>
                    {displayName.charAt(0)}
                  </div>
                )}

                <span
                  style={{
                    flex: 1,
                    fontSize: uiTypography.fontSize.sm,
                    fontWeight: isSelected ? uiTypography.fontWeight.semibold : uiTypography.fontWeight.regular,
                    color: theme.text.primary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                  {displayName}
                </span>

                <div onClick={(e) => e.stopPropagation()}>
                  <ToggleSwitch checked={isActive} onChange={() => onToggleActive(provider.id)} theme={theme} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
