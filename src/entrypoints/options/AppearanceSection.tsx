import { trackEvent } from "@/shared/analytics"
import { useI18n } from "@/shared/i18n/context"
import type { ExtensionSettings, LanguagePreference, ThemePreference } from "@/shared/types"
import { FieldGroup, SectionCard, SegmentedControl, SettingRow } from "./ui"

interface AppearanceSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

/** 外观：全是即时项（分段选择），因此卡片不带保存条 */
export function AppearanceSection({ settings, saveSettingsNow }: AppearanceSectionProps) {
  const { t } = useI18n()

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: "auto", label: t("options.appearance.themeAuto") },
    { value: "light", label: t("options.appearance.themeLight") },
    { value: "dark", label: t("options.appearance.themeDark") }
  ]

  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: "system", label: t("options.appearance.languageSystem") },
    { value: "en", label: "English" },
    { value: "zh_CN", label: "简体中文" }
  ]

  return (
    <SectionCard title={t("options.appearance.cardTitle")} description={t("options.appearance.cardDesc")}>
      <FieldGroup>
        <SettingRow title={t("options.appearance.themeTitle")} desc={t("options.appearance.themeDesc")}>
          <SegmentedControl
            value={settings.theme}
            options={themeOptions}
            ariaLabel={t("options.appearance.themeTitle")}
            onValueChange={(value) => {
              const fromTheme = settings.theme
              saveSettingsNow((current) => ({ ...current, theme: value }))
              void trackEvent("theme_changed", { from_theme: fromTheme, to_theme: value })
            }}
          />
        </SettingRow>

        <SettingRow title={t("options.appearance.languageTitle")} desc={t("options.appearance.languageDesc")}>
          <SegmentedControl
            value={settings.language}
            options={languageOptions}
            ariaLabel={t("options.appearance.languageTitle")}
            onValueChange={(value) => {
              const fromLanguage = settings.language
              saveSettingsNow((current) => ({ ...current, language: value }))
              void trackEvent("language_changed", { from_language: fromLanguage, to_language: value })
            }}
          />
        </SettingRow>
      </FieldGroup>
    </SectionCard>
  )
}
