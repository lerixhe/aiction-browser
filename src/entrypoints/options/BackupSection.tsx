import { useRef, useState, type CSSProperties } from "react"

import { getUserIcons, normalizeSettings, saveSettings, saveUserIcon } from "@/shared/storage"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createButtonStyle, createCardStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ExtensionSettings, UserIconData } from "@/shared/types"
import { ConfirmDialog } from "@/entrypoints/options/ConfirmDialog"

interface BackupSectionProps {
  settings: ExtensionSettings
  setSettings: (settings: ExtensionSettings) => void
  onImportComplete: () => void
}

export function BackupSection({ settings, setSettings, onImportComplete }: BackupSectionProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const [saving, setSaving] = useState(false)
  const [pressedBtn, setPressedBtn] = useState<string | null>(null)
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
      const parsed = JSON.parse(content) as ExtensionSettings | { settings?: unknown; userIcons?: Record<string, UserIconData> }
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
          Object.entries(pendingImportUserIcons).map(([iconName, data]) =>
            saveUserIcon(iconName, data)
          )
        )
      : Promise.resolve()

    void saveUserIconsPromise.then(() =>
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

  // --- Shared styles ---
  const cardStyle: CSSProperties = {
    ...createCardStyle(theme)
  }

  const primaryBtnStyle: CSSProperties = {
    ...createButtonStyle(theme, "primary")
  }

  const insetCardStyle: CSSProperties = {
    border: `1px solid ${theme.border.hairline}`,
    borderRadius: uiRadius.md,
    padding: uiSpace[16],
    background: theme.bg.surfaceMuted
  }

  return (
    <section style={{ ...cardStyle }}>
      <div style={{ marginBottom: uiSpace[20] }}>
        <h2
          style={{
            margin: `0 0 ${uiSpace[4]}px`,
            fontSize: uiTypography.fontSize.lg,
            fontWeight: uiTypography.fontWeight.semibold,
            letterSpacing: uiTypography.letterSpacing.tight
          }}>
          {t("options.backup.title")}
        </h2>
        <p style={{ margin: 0, color: theme.text.secondary, fontSize: uiTypography.fontSize.md }}>
          {t("options.backup.desc")}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: uiSpace[16],
          marginBottom: uiSpace[16]
        }}>
        <div
          style={insetCardStyle}>
          <h3
            style={{
              margin: `0 0 ${uiSpace[6]}px`,
              fontSize: uiTypography.fontSize.md,
              fontWeight: uiTypography.fontWeight.semibold
            }}>
            {t("options.backup.exportTitle")}
          </h3>
          <p style={{ margin: `0 0 ${uiSpace[14]}px`, color: theme.text.secondary, fontSize: uiTypography.fontSize.sm, lineHeight: 1.6 }}>
            {t("options.backup.exportDesc")}
          </p>
          <button
            type="button"
            onClick={handleExportSettings}
            onMouseDown={() => setPressedBtn("export-settings")}
            onMouseUp={() => setPressedBtn(null)}
            onMouseLeave={() => setPressedBtn(null)}
            style={{
              ...primaryBtnStyle,
              transform: pressedBtn === "export-settings" ? "scale(0.96)" : "scale(1)"
            }}>
            {t("options.backup.exportButton")}
          </button>
        </div>

        <div
          style={insetCardStyle}>
          <h3
            style={{
              margin: `0 0 ${uiSpace[6]}px`,
              fontSize: uiTypography.fontSize.md,
              fontWeight: uiTypography.fontWeight.semibold
            }}>
            {t("options.backup.importTitle")}
          </h3>
          <p style={{ margin: `0 0 ${uiSpace[14]}px`, color: theme.text.secondary, fontSize: uiTypography.fontSize.sm, lineHeight: 1.6 }}>
            {t("options.backup.importDesc")}
          </p>
          <button
            type="button"
            onClick={handleImportClick}
            onMouseDown={() => setPressedBtn("import-settings")}
            onMouseUp={() => setPressedBtn(null)}
            onMouseLeave={() => setPressedBtn(null)}
            style={{
              ...createButtonStyle(theme, "secondary"),
              transform: pressedBtn === "import-settings" ? "scale(0.96)" : "scale(1)"
            }}>
            {t("options.backup.importButton")}
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={(event) => void handleImportFile(event)} style={{ display: "none" }} />
        </div>
      </div>

      {backupStatus ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: uiSpace[16],
            ...createStatusMessageStyle(theme, backupStatus.success ? "success" : "error")
          }}>
          {backupStatus.message}
        </div>
      ) : null}

      {pendingImportSettings ? (
        <ConfirmDialog
          title={t("options.backup.importConfirmTitle")}
          message={t("options.backup.importConfirmMessage")}
          confirmLabel={t("options.backup.importConfirmButton")}
          cancelLabel={t("options.connection.cancel")}
          onConfirm={confirmImportSettings}
          onCancel={() => setPendingImportSettings(null)}
          themeName={themeName}
        />
      ) : null}
    </section>
  )
}