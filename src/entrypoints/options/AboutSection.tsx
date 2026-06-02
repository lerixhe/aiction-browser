import type { CSSProperties } from "react"

import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { trackEvent } from "@/shared/analytics"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiRadius, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createCardStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ExtensionSettings } from "@/shared/types"

interface AboutSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

export function AboutSection({ settings, saveSettingsNow }: AboutSectionProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const cardStyle: CSSProperties = {
    ...createCardStyle(theme)
  }

  return (
    <>
      <section style={{ ...cardStyle, marginBottom: uiSpace[16] }}>
        <h2
          style={{
            margin: `0 0 ${uiSpace[4]}px`,
            fontSize: uiTypography.fontSize.lg,
            fontWeight: uiTypography.fontWeight.semibold,
            letterSpacing: uiTypography.letterSpacing.tight
          }}>
          {t("options.about.title")}
        </h2>
        <p
          style={{
            margin: `0 0 ${uiSpace[16]}px`,
            color: theme.text.secondary,
            fontSize: uiTypography.fontSize.md,
            lineHeight: 1.7
          }}>
          {t("options.about.description")}
        </p>

        <div
          style={{
            marginTop: uiSpace[8]
          }}>
          <div style={{ fontWeight: uiTypography.fontWeight.semibold, fontSize: uiTypography.fontSize.md, color: theme.text.primary, marginBottom: uiSpace[8] }}>
            {t("options.about.featuresTitle")}
          </div>
          <div
            style={{
              fontSize: uiTypography.fontSize.md,
              color: theme.text.secondary,
              lineHeight: 1.7
            }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: uiSpace[4] }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              {t("options.about.feature1")}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: uiSpace[4] }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              {t("options.about.feature2")}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: uiSpace[4] }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              {t("options.about.feature3")}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: uiSpace[4] }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              {t("options.about.feature4")}
            </div>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              {t("options.about.feature5")}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: uiSpace[16],
            fontSize: uiTypography.fontSize.md,
            color: theme.text.secondary,
            lineHeight: 1.7
          }}>
          <div style={{ fontWeight: uiTypography.fontWeight.semibold, color: theme.text.primary, marginBottom: uiSpace[4] }}>
            {t("options.about.contactTitle")}
          </div>
          <div>{t("options.about.emailLabel")}</div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginBottom: uiSpace[16] }}>
        <h2
          style={{
            margin: `0 0 ${uiSpace[16]}px`,
            fontSize: uiTypography.fontSize.lg,
            fontWeight: uiTypography.fontWeight.semibold,
            letterSpacing: uiTypography.letterSpacing.tight
          }}>
          {t("options.about.versionTitle")}
        </h2>
        <div
          style={{
            fontSize: uiTypography.fontSize.md,
            color: theme.text.secondary,
            lineHeight: 1.7
          }}>
          <div>{t("options.about.versionPrefix", [chrome.runtime.getManifest().version])}</div>
          <div>{t("options.about.license")}</div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginBottom: uiSpace[16] }}>
        <h2
          style={{
            margin: `0 0 ${uiSpace[4]}px`,
            fontSize: uiTypography.fontSize.lg,
            fontWeight: uiTypography.fontWeight.semibold,
            letterSpacing: uiTypography.letterSpacing.tight
          }}>
          {t("options.about.telemetryTitle")}
        </h2>
        <p
          style={{
            margin: `0 0 ${uiSpace[16]}px`,
            color: theme.text.secondary,
            fontSize: uiTypography.fontSize.md,
            lineHeight: 1.7
          }}>
          {t("options.about.telemetryDesc")}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `${uiSpace[14]}px ${uiSpace[16]}px`,
            border: `1px solid ${theme.border.hairline}`,
            borderRadius: uiRadius.md,
            background: theme.bg.surfaceMuted
          }}>
          <div>
            <div
              style={{
                fontSize: uiTypography.fontSize.md,
                fontWeight: uiTypography.fontWeight.semibold,
                color: theme.text.primary,
                marginBottom: uiSpace[2]
              }}>
              {t("options.about.telemetryToggle")}
            </div>
            <div
              style={{
                fontSize: uiTypography.fontSize.sm,
                color: theme.text.secondary
              }}>
              {settings.telemetryEnabled ? t("options.about.telemetryEnabled") : t("options.about.telemetryDisabled")}
            </div>
          </div>
          <ToggleSwitch
            checked={settings.telemetryEnabled}
            onChange={() => {
              const next = !settings.telemetryEnabled
              saveSettingsNow((current) => ({ ...current, telemetryEnabled: next }))
              void trackEvent("telemetry_toggled", { enabled: next })
            }}
            theme={theme}
          />
        </div>
      </section>
    </>
  )
}