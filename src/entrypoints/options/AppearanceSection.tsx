import type { CSSProperties } from "react"

import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { trackEvent } from "@/shared/analytics"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createCardStyle, createFieldLabelStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ExtensionSettings, LanguagePreference, ThemePreference } from "@/shared/types"

interface AppearanceSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

export function AppearanceSection({ settings, saveSettingsNow }: AppearanceSectionProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const cardStyle: CSSProperties = {
    ...createCardStyle(theme)
  }

  return (
    <section style={{ ...cardStyle, marginBottom: uiSpace[16] }}>
      <h2
        style={{
          margin: `0 0 ${uiSpace[4]}px`,
          fontSize: uiTypography.fontSize.lg,
          fontWeight: uiTypography.fontWeight.semibold,
          letterSpacing: uiTypography.letterSpacing.tight
        }}>
        {t("options.appearance.themeTitle")}
      </h2>
      <p
        style={{
          margin: `0 0 ${uiSpace[16]}px`,
          color: theme.text.secondary,
          fontSize: uiTypography.fontSize.md
        }}>
        {t("options.appearance.themeDesc")}
      </p>

      <div
        style={{
          display: "inline-flex",
          background: theme.bg.surfaceMuted,
          borderRadius: uiRadius.sm,
          padding: 3,
          gap: 2
        }}>
        {(["auto", "light", "dark"] as ThemePreference[]).map((value) => {
          const isSelected = settings.theme === value
          const labels: Record<ThemePreference, string> = { auto: t("options.appearance.themeAuto"), light: t("options.appearance.themeLight"), dark: t("options.appearance.themeDark") }

          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                const fromTheme = settings.theme
                saveSettingsNow((current) => ({ ...current, theme: value }))
                void trackEvent("theme_changed", { from_theme: fromTheme, to_theme: value })
              }}
              style={{
                padding: `${uiSpace[6]}px ${uiSpace[16]}px`,
                border: "none",
                borderRadius: uiRadius.sm - 1,
                background: isSelected ? `${theme.accent.primary}14` : "transparent",
                color: isSelected ? theme.accent.primary : theme.text.primary,
                cursor: "pointer",
                fontSize: uiTypography.fontSize.sm,
                fontWeight: isSelected ? uiTypography.fontWeight.semibold : uiTypography.fontWeight.regular,
                fontFamily: uiTypography.fontFamily,
                outline: "none",
                boxShadow: "none",
                transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}`
              }}>
              {labels[value]}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: uiSpace[20] }}>
        <div
          style={{
            borderTop: `0.5px solid ${theme.border.hairline}`,
            paddingTop: uiSpace[20],
            marginBottom: uiSpace[20]
          }}>
          <h2
            style={{
              margin: `0 0 ${uiSpace[4]}px`,
              fontSize: uiTypography.fontSize.lg,
              fontWeight: uiTypography.fontWeight.semibold,
              letterSpacing: uiTypography.letterSpacing.tight
            }}>
            {t("options.appearance.languageTitle")}
          </h2>
          <p
            style={{
              margin: `0 0 ${uiSpace[16]}px`,
              color: theme.text.secondary,
              fontSize: uiTypography.fontSize.md
            }}>
            {t("options.appearance.languageDesc")}
          </p>

          <div
            style={{
              display: "inline-flex",
              background: theme.bg.surfaceMuted,
              borderRadius: uiRadius.sm,
              padding: 3,
              gap: 2
            }}>
            {(["system", "en", "zh_CN"] as LanguagePreference[]).map((value) => {
              const isSelected = settings.language === value
              const labels: Record<LanguagePreference, string> = {
                system: t("options.appearance.languageSystem"),
                en: "English",
                zh_CN: "简体中文"
              }

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    const fromLang = settings.language
                    saveSettingsNow((current) => ({ ...current, language: value }))
                    void trackEvent("language_changed", { from_language: fromLang, to_language: value })
                  }}
                  style={{
                    padding: `${uiSpace[6]}px ${uiSpace[16]}px`,
                    border: "none",
                    borderRadius: uiRadius.sm - 1,
                    background: isSelected ? `${theme.accent.primary}14` : "transparent",
                    color: isSelected ? theme.accent.primary : theme.text.primary,
                    cursor: "pointer",
                    fontSize: uiTypography.fontSize.sm,
                    fontWeight: isSelected ? uiTypography.fontWeight.semibold : uiTypography.fontWeight.regular,
                    fontFamily: uiTypography.fontFamily,
                    outline: "none",
                    boxShadow: "none",
                    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                  }}>
                  {labels[value]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}