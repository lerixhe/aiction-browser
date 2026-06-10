import { uiMotion, uiRadius, uiShadow, uiSpace, uiTypography, type UiTheme } from "@/shared/ui/tokens"
import { createButtonStyle, createInputStyle } from "@/shared/ui/styles"
import { ProviderLogoById } from "./ProviderLogo"
import type { ModelsDevProviderInfo } from "@/shared/models-dev"
import { useI18n } from "@/shared/i18n/context"

function PlusIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3V13M3 8H13" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

interface ProviderSelectModalProps {
  theme: UiTheme
  filteredProviders: ModelsDevProviderInfo[]
  providerSearchQuery: string
  focusedField: string | null
  onClose: () => void
  onSearchQueryChange: (query: string) => void
  onSelectCustom: () => void
  onSelectModelsDev: (provider: ModelsDevProviderInfo) => void
  onFocusField: (field: string) => void
  onBlurField: () => void
}

export function ProviderSelectModal({
  theme,
  filteredProviders,
  providerSearchQuery,
  focusedField,
  onClose,
  onSearchQueryChange,
  onSelectCustom,
  onSelectModelsDev,
  onFocusField,
  onBlurField
}: ProviderSelectModalProps) {
  const { t } = useI18n()

  const secondaryBtnStyle = createButtonStyle(theme, "secondary", { compact: true })
  const createInput = (fieldName: string) => createInputStyle(theme, focusedField === fieldName)

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(4px)"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}>
      <div
        style={{
          background: theme.bg.surface,
          borderRadius: uiRadius.lg,
          boxShadow: uiShadow.xl,
          width: "90%",
          maxWidth: 800,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
        {/* Modal header */}
        <div
          style={{
            padding: `${uiSpace[20]}px ${uiSpace[24]}px`,
            borderBottom: `0.5px solid ${theme.border.hairline}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: uiTypography.fontSize.lg,
                fontWeight: uiTypography.fontWeight.semibold,
                letterSpacing: uiTypography.letterSpacing.tight
              }}>
              {t("options.connection.selectProvider")}
            </h2>
            <p
              style={{
                margin: `${uiSpace[4]}px 0 0`,
                color: theme.text.secondary,
                fontSize: uiTypography.fontSize.sm
              }}>
              {t("options.connection.selectProviderDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...secondaryBtnStyle,
              padding: `${uiSpace[6]}px ${uiSpace[12]}px`
            }}>
            {t("options.connection.cancel")}
          </button>
        </div>

        {/* Search input */}
        <div style={{ padding: `${uiSpace[16]}px ${uiSpace[24]}px 0` }}>
          <input
            type="text"
            value={providerSearchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={t("options.connection.searchProviders")}
            autoFocus
            onFocus={() => onFocusField("provider-search")}
            onBlur={onBlurField}
            style={{
              ...createInput("provider-search"),
              width: "100%",
              boxSizing: "border-box"
            }}
          />
        </div>

        {/* Provider grid */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: uiSpace[24],
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: uiSpace[10],
            alignContent: "start"
          }}>
          {/* Custom provider option */}
          <button
            type="button"
            onClick={onSelectCustom}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: uiSpace[6],
              padding: `${uiSpace[12]}px ${uiSpace[8]}px`,
              border: `1px solid ${theme.border.default}`,
              borderRadius: uiRadius.md,
              background: theme.bg.surface,
              cursor: "pointer",
              transition: `all ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
              fontFamily: uiTypography.fontFamily
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.accent.primary
              e.currentTarget.style.background = `${theme.accent.primary}08`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.border.default
              e.currentTarget.style.background = theme.bg.surface
            }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: uiRadius.sm,
                background: theme.bg.surfaceMuted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
              <PlusIcon size={18} color={theme.text.secondary} />
            </div>
            <span
              style={{
                fontSize: uiTypography.fontSize.xs,
                fontWeight: uiTypography.fontWeight.semibold,
                color: theme.text.primary,
                textAlign: "center",
                lineHeight: uiTypography.lineHeight.tight
              }}>
              {t("options.connection.customProvider")}
            </span>
            <span
              style={{
                fontSize: 11,
                color: theme.text.secondary
              }}>
              OpenAI Compatible
            </span>
          </button>

          {/* Models.dev providers */}
          {filteredProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => onSelectModelsDev(provider)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: uiSpace[6],
                padding: `${uiSpace[12]}px ${uiSpace[8]}px`,
                border: `1px solid ${theme.border.default}`,
                borderRadius: uiRadius.md,
                background: theme.bg.surface,
                cursor: "pointer",
                transition: `all ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
                fontFamily: uiTypography.fontFamily
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.accent.primary
                e.currentTarget.style.background = `${theme.accent.primary}08`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.border.default
                e.currentTarget.style.background = theme.bg.surface
              }}>
              <ProviderLogoById providerId={provider.id} name={provider.name} size={36} theme={theme} />
              <span
                style={{
                  fontSize: uiTypography.fontSize.xs,
                  fontWeight: uiTypography.fontWeight.semibold,
                  color: theme.text.primary,
                  textAlign: "center",
                  lineHeight: uiTypography.lineHeight.tight
                }}>
                {provider.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: theme.text.secondary
                }}>
                {provider.modelCount} {t("options.connection.models")}
              </span>
            </button>
          ))}

          {/* Empty state */}
          {filteredProviders.length === 0 && providerSearchQuery.trim() ? (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: uiSpace[32],
                color: theme.text.secondary
              }}>
              {t("options.connection.noProvidersFound")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
