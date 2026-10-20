import { trackEvent } from "@/shared/analytics"
import { AUTO_LANGUAGE, normalizeLanguagePreference } from "@/shared/i18n/preference"
import { SUPPORTED_LOCALES } from "@/shared/i18n/registry"
import { useI18n } from "@/shared/i18n/context"
import type { ExtensionSettings, LanguagePreference, ThemePreference } from "@/shared/types"
import { FieldGroup, SectionCard, SegmentedControl, SelectField, SettingRow } from "./ui"

interface AppearanceSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

/** 外观：全是即时项（主题用分段、语言用下拉），因此卡片不带保存条 */
export function AppearanceSection({ settings, saveSettingsNow }: AppearanceSectionProps) {
  const { t } = useI18n()

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: "auto", label: t("options.appearance.themeAuto") },
    { value: "light", label: t("options.appearance.themeLight") },
    { value: "dark", label: t("options.appearance.themeDark") }
  ]

  // 自动项置顶 + 注册表全量语言（顺序 = 注册表声明顺序 = 语言代码字母序）；
  // 语言数随语种增长（目前 10 个），分段选择放不下，故用下拉
  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: AUTO_LANGUAGE, label: t("options.appearance.languageAuto") },
    ...SUPPORTED_LOCALES.map((row) => ({ value: row.id, label: row.nativeName }))
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
          <SelectField
            value={settings.language}
            options={languageOptions}
            ariaLabel={t("options.appearance.languageTitle")}
            onValueChange={(value) => {
              // 下拉给的是 string，走 normalize 收窄（非法值直接忽略，不写存储）
              const next = normalizeLanguagePreference(value)
              if (!next) return
              const fromLanguage = settings.language
              saveSettingsNow((current) => ({ ...current, language: next }))
              void trackEvent("language_changed", { from_language: fromLanguage, to_language: next })
            }}
          />
        </SettingRow>
      </FieldGroup>
    </SectionCard>
  )
}
