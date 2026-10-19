import { trackEvent } from "@/shared/analytics"
import { useI18n } from "@/shared/i18n/context"
import { saveSettings } from "@/shared/storage"
import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { uiThemes } from "@/shared/ui/tokens"
import { useUiThemeName } from "@/shared/ui/theme"
import type { ExtensionSettings } from "@/shared/types"
import { FieldGroup, SectionCard, SettingRow } from "./ui"

interface AboutSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

/** 关于：版本信息 + 社区 + 遥测开关（唯一即时项），卡片不带保存条 */
export function AboutSection({ settings, saveSettingsNow }: AboutSectionProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  /**
   * 遥测开关本身的事件（关闭率是隐私信任指标）。
   * 上报顺序是要紧的：
   * - 关闭：**先上报再落盘**——一旦落盘，`trackEvent` 会被 `isTelemetryEnabled()` 拦掉；
   * - 开启：**先落盘再上报**——落盘前开关还是 false，上报同样会被拦掉。
   */
  const handleTelemetryToggle = async () => {
    const next = !settings.telemetryEnabled

    if (!next) {
      await trackEvent("telemetry_toggled", { enabled: false, source: "options" })
      saveSettingsNow((current) => ({ ...current, telemetryEnabled: false }))
      return
    }

    saveSettingsNow((current) => ({ ...current, telemetryEnabled: true }))
    try {
      // 幂等重写一次：等设置真正落盘后再上报（saveSettingsNow 内部的写入无法 await）
      await saveSettings({ ...settings, telemetryEnabled: true })
    } catch {
      // 写入失败时不强行上报，避免「开关没开却报了开启」
      return
    }
    void trackEvent("telemetry_toggled", { enabled: true, source: "options" })
  }

  const features = [
    t("options.about.feature1"),
    t("options.about.feature2"),
    t("options.about.feature3"),
    t("options.about.feature4"),
    t("options.about.feature5")
  ]

  return (
    <SectionCard title={t("options.about.title")} description={t("options.about.description")}>
      <FieldGroup>
        <SettingRow title="AIction" desc={t("options.about.tagline")}>
          <span style={{ fontSize: 12, color: theme.text.secondary }}>
            v{chrome.runtime.getManifest().version}
          </span>
        </SettingRow>

        <SettingRow title={t("options.about.communityTitle")} desc={t("options.about.communityDesc")}>
          <span style={{ fontSize: 12, color: theme.text.secondary }}>{t("options.about.emailLabel")}</span>
          <a
            className="opt-btn opt-btn--secondary opt-btn--sm"
            href="https://github.com/lerixhe/aiction-browser"
            target="_blank"
            rel="noopener noreferrer">
            {t("options.about.viewRepo")}
          </a>
        </SettingRow>

        <SettingRow title={t("options.about.featuresTitle")} width="wide">
          <ul className="opt-bullets">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </SettingRow>

        <SettingRow
          title={t("options.about.telemetryTitle")}
          desc={t("options.about.telemetryDesc")}
          width="narrow">
          <span style={{ fontSize: 12, color: theme.text.secondary }}>
            {settings.telemetryEnabled ? t("options.about.telemetryEnabled") : t("options.about.telemetryDisabled")}
          </span>
          <ToggleSwitch
            checked={settings.telemetryEnabled}
            onChange={() => {
              void handleTelemetryToggle()
            }}
            theme={theme}
          />
        </SettingRow>
      </FieldGroup>
    </SectionCard>
  )
}
