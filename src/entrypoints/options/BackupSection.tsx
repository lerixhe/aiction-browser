import { useRef, useState } from "react"

import { trackEvent } from "@/shared/analytics"
import { useI18n } from "@/shared/i18n/context"
import { getUserIcons, normalizeSettings, saveSettings, saveUserIcon } from "@/shared/storage"
import type { ExtensionSettings, UserIconData } from "@/shared/types"
import { ConfirmDialog } from "@/entrypoints/options/ConfirmDialog"
import { Button, FieldGroup, SectionCard, SettingRow, StatusMessage } from "./ui"

interface BackupSectionProps {
  settings: ExtensionSettings
  setSettings: (settings: ExtensionSettings) => void
  onImportComplete: () => void
}

/** 备份与迁移：纯按钮操作（导出 / 导入），卡片不带保存条 */
export function BackupSection({ settings, setSettings, onImportComplete }: BackupSectionProps) {
  const { t } = useI18n()

  const [saving, setSaving] = useState(false)
  const [backupStatus, setBackupStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [pendingImportSettings, setPendingImportSettings] = useState<ExtensionSettings | null>(null)
  const [pendingImportUserIcons, setPendingImportUserIcons] = useState<Record<string, UserIconData> | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleExportSettings = async () => {
    const userIcons = await getUserIcons()
    const payload = {
      app: "aiction",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: normalizeSettings(settings),
      userIcons
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const date = new Date().toISOString().slice(0, 10)

    link.href = url
    link.download = `aiction-settings-${date}.json`
    link.click()
    URL.revokeObjectURL(url)

    setBackupStatus({ success: true, message: t("options.connection.configExported") })
    void trackEvent("settings_exported", {
      provider_count: settings.providers.length,
      action_count: settings.actions.length
    })
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    try {
      const content = await file.text()
      const parsed = JSON.parse(content) as
        | ExtensionSettings
        | { settings?: unknown; userIcons?: Record<string, UserIconData> }
      const imported = normalizeSettings("settings" in parsed ? parsed.settings : parsed)
      const userIcons = "userIcons" in parsed ? parsed.userIcons ?? {} : {}

      setPendingImportSettings(imported)
      setPendingImportUserIcons(userIcons)
      setBackupStatus(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("options.connection.parseFileError")
      setBackupStatus({ success: false, message: t("options.connection.importFailed", [message]) })
    }
  }

  const confirmImportSettings = () => {
    if (!pendingImportSettings) {
      return
    }

    setSettings(pendingImportSettings)
    setSaving(true)
    setBackupStatus(null)

    const saveUserIconsPromise = pendingImportUserIcons
      ? Promise.all(
          Object.entries(pendingImportUserIcons).map(([iconName, data]) => saveUserIcon(iconName, data))
        )
      : Promise.resolve()

    void saveUserIconsPromise
      .then(() =>
        saveSettings({
          ...pendingImportSettings,
          providers: pendingImportSettings.providers.map((provider) => ({
            ...provider,
            name: provider.name.trim(),
            apiBaseUrl: provider.apiBaseUrl?.trim() || undefined,
            apiKey: provider.apiKey.trim(),
            model: provider.model.trim()
          }))
        })
      )
      .then(() => {
        setBackupStatus({ success: true, message: t("options.connection.configImported") })
        void trackEvent("settings_imported", {
          provider_count: pendingImportSettings.providers.length,
          action_count: pendingImportSettings.actions.length,
          has_user_icons: Boolean(pendingImportUserIcons && Object.keys(pendingImportUserIcons).length > 0)
        })
        onImportComplete()
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : t("errors.unknownError")
        setBackupStatus({ success: false, message: t("options.connection.importSaveFailed", [message]) })
      })
      .finally(() => {
        setSaving(false)
        setPendingImportSettings(null)
        setPendingImportUserIcons(null)
      })
  }

  return (
    <>
      <SectionCard title={t("options.backup.title")} description={t("options.backup.cardDesc")}>
        <FieldGroup>
          <SettingRow title={t("options.backup.exportTitle")} desc={t("options.backup.exportRowDesc")}>
            <Button variant="primary" onClick={() => void handleExportSettings()}>
              {t("options.backup.exportButton")}
            </Button>
          </SettingRow>

          <SettingRow title={t("options.backup.importTitle")} desc={t("options.backup.importRowDesc")}>
            <Button variant="secondary" disabled={saving} onClick={handleImportClick}>
              {t("options.backup.importButton")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleImportFile(event)}
              style={{ display: "none" }}
            />
          </SettingRow>
        </FieldGroup>

        {backupStatus ? (
          <StatusMessage tone={backupStatus.success ? "success" : "error"}>{backupStatus.message}</StatusMessage>
        ) : null}
      </SectionCard>

      {pendingImportSettings ? (
        <ConfirmDialog
          title={t("options.backup.importConfirmTitle")}
          message={t("options.backup.importConfirmMessage")}
          confirmLabel={t("options.backup.importConfirmButton")}
          cancelLabel={t("options.connection.cancel")}
          onConfirm={confirmImportSettings}
          onCancel={() => setPendingImportSettings(null)}
        />
      ) : null}
    </>
  )
}
