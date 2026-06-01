import { type JSX, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import { NavIcon, ActionIcon } from "@/shared/ui/iconify"
import { hasTextPlaceholder } from "@/shared/prompt"
import { BrandIcon } from "@/shared/ui/icons"
import { trackEvent } from "@/shared/analytics"
import { DEFAULT_CUSTOM_MODEL_SERVICE, DEFAULT_SETTINGS } from "@/shared/defaults"
import { getSettings, normalizeSettings, saveSettings } from "@/shared/storage"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createButtonStyle, createCardStyle, createFieldLabelStyle, createFocusRing, createInputStyle as createSharedInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { getAvatarPalette, getAvatarDisplayText } from "@/shared/ui/avatar"
import { ACTION_ICON_LIBRARY, type IconEntry } from "@/shared/ui/icon-library"
import { useI18n } from "@/shared/i18n/context"
import type { ActionTemplate, ExtensionSettings, LanguagePreference, ThemePreference, ApiTestResponse, FetchModelsResponse, ModelServiceConfig } from "@/shared/types"
import { MESSAGE_TYPES } from "@/shared/constants"
import { ConfirmDialog } from "@/entrypoints/options/ConfirmDialog"

type Section = "appearance" | "connection" | "actions" | "backup" | "about"

function ToggleSwitch({ checked, onChange, theme }: { checked: boolean; onChange: () => void; theme: any }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        background: checked ? theme.accent.primary : theme.border.default,
        cursor: "pointer",
        transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
        padding: 0,
        flexShrink: 0
      }}>
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 19 : 3,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: `left ${uiMotion.durationFast} ${uiMotion.easingStandard}`
        }}
      />
    </button>
  )
}

function PlusIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3V13M3 8H13" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

function DragHandleIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5" cy="4" r="1.5" fill={color} />
      <circle cx="11" cy="4" r="1.5" fill={color} />
      <circle cx="5" cy="8" r="1.5" fill={color} />
      <circle cx="11" cy="8" r="1.5" fill={color} />
      <circle cx="5" cy="12" r="1.5" fill={color} />
      <circle cx="11" cy="12" r="1.5" fill={color} />
    </svg>
  )
}

function RefreshIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5M13.5 2.5V6.5H9.5" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function createCustomServiceDraft(): ModelServiceConfig {
  return {
    ...DEFAULT_CUSTOM_MODEL_SERVICE,
    id: `service-${Date.now()}`
  }
}

export default function OptionsPage() {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const sections: { key: Section; label: string; icon: string }[] = [
    { key: "appearance", label: t("options.nav.appearance"), icon: "tabler:palette" },
    { key: "connection", label: t("options.nav.connection"), icon: "tabler:api" },
    { key: "actions", label: t("options.nav.actions"), icon: "tabler:sparkles" },
    { key: "backup", label: t("options.nav.backup"), icon: "tabler:database-export" },
    { key: "about", label: t("options.nav.about"), icon: "tabler:info-circle" }
  ]
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [pressedBtn, setPressedBtn] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<Section>("appearance")
  const [loaded, setLoaded] = useState(false)
  const [themeReady, setThemeReady] = useState(false)
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)
  const [backupStatus, setBackupStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [pendingImportSettings, setPendingImportSettings] = useState<ExtensionSettings | null>(null)
  const [connectionView, setConnectionView] = useState<"list" | "create" | "edit">("list")
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [serviceDraft, setServiceDraft] = useState<ModelServiceConfig>(createCustomServiceDraft())
  const [pendingDeleteServiceId, setPendingDeleteServiceId] = useState<string | null>(null)
  const [editingIconServiceId, setEditingIconServiceId] = useState<string | null>(null)
  const [iconEditText, setIconEditText] = useState("")
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [draggedActionIndex, setDraggedActionIndex] = useState<number | null>(null)
  const [dragOverActionIndex, setDragOverActionIndex] = useState<number | null>(null)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void getSettings().then((loaded) => {
      setSettings(loaded)
      setThemeReady(true)
      if (loaded.actions.length > 0) {
        setSelectedActionId(loaded.actions[0].id)
      }
    })
    void chrome.storage.local.get("optionsActiveSection").then((result) => {
      const saved = result.optionsActiveSection as Section | undefined
      if (saved && ["appearance", "connection", "actions", "backup", "about"].includes(saved)) {
        setActiveSection(saved)
      }
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (loaded) {
      void chrome.storage.local.set({ optionsActiveSection: activeSection })
    }
  }, [activeSection, loaded])

  useEffect(() => {
    document.documentElement.style.margin = "0"
    document.documentElement.style.padding = "0"
    document.documentElement.style.height = "100%"
    document.body.style.margin = "0"
    document.body.style.padding = "0"
    document.body.style.height = "100%"
  }, [])

  const hasInvalidCustomTemplate = useMemo(() => {
    return settings.actions.some((item) => !hasTextPlaceholder(item.template))
  }, [settings.actions])

  const isEditingConnection = connectionView !== "list"
  const isServiceDraftValid =
    Boolean(serviceDraft.name.trim()) &&
    Boolean(serviceDraft.apiBaseUrl.trim()) &&
    Boolean(serviceDraft.apiKey.trim()) &&
    Boolean(serviceDraft.model.trim())

  const saveSettingsNow = (updater: (current: ExtensionSettings) => ExtensionSettings) => {
    setSettings((current) => {
      const next = updater(current)

      void saveSettings({
        ...next,
        modelServices: next.modelServices.map((service) => ({
          ...service,
          name: service.name.trim(),
          apiBaseUrl: service.apiBaseUrl.trim(),
          apiKey: service.apiKey.trim(),
          model: service.model.trim()
        }))
      })

      return next
    })
  }

  const updateCustomAction = (index: number, patch: Partial<ActionTemplate>) => {
    saveSettingsNow((current) => ({
      ...current,
      actions: current.actions.map((item, itemIndex) =>
        itemIndex === index
          ? {
            ...item,
            ...patch
          }
          : item
      )
    }))
  }

  const handleActionDragStart = (index: number) => {
    setDraggedActionIndex(index)
  }

  const handleActionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedActionIndex !== null && draggedActionIndex !== index) {
      setDragOverActionIndex(index)
    }
  }

  const handleActionDragEnd = () => {
    if (draggedActionIndex !== null && dragOverActionIndex !== null && draggedActionIndex !== dragOverActionIndex) {
      saveSettingsNow((current) => {
        const newActions = [...current.actions]
        const [draggedItem] = newActions.splice(draggedActionIndex, 1)
        newActions.splice(dragOverActionIndex, 0, draggedItem)
        return { ...current, actions: newActions }
      })
    }
    setDraggedActionIndex(null)
    setDragOverActionIndex(null)
  }

  const handleTestConnection = () => {
    const trimmedUrl = serviceDraft.apiBaseUrl.trim()
    const trimmedKey = serviceDraft.apiKey.trim()
    const trimmedModel = serviceDraft.model.trim()

    if (!trimmedUrl || !trimmedKey || !trimmedModel) {
      setTestResult({ success: false, message: t("options.connection.missingUrlKeyModel") })
      return
    }

    setTesting(true)
    setTestResult(null)

    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.API_TEST_REQUEST,
        payload: {
          apiBaseUrl: trimmedUrl,
          apiKey: trimmedKey,
          model: trimmedModel
        }
      },
      (response: ApiTestResponse | undefined) => {
        setTesting(false)
        if (chrome.runtime.lastError) {
          setTestResult({ success: false, message: t("options.connection.commError", [chrome.runtime.lastError.message ?? ""]) })
          return
        }
        if (!response) {
          setTestResult({ success: false, message: t("options.connection.noResponse") })
          return
        }
        const latencyInfo = response.latencyMs != null ? ` (${response.latencyMs}ms)` : ""
        if (response.success) {
          setTestResult({ success: true, message: t("options.connection.connectionSuccess", [latencyInfo]) })
        } else {
          setTestResult({ success: false, message: response.error ?? t("options.connection.testFailed") })
        }
      }
    )
  }

  const handleFetchModels = () => {
    const trimmedUrl = serviceDraft.apiBaseUrl.trim()
    if (!trimmedUrl) {
      setFetchError(t("options.connection.missingApiBaseUrl"))
      return
    }

    setFetchingModels(true)
    setFetchError(null)
    setModels([])

    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.FETCH_MODELS_REQUEST,
        payload: {
          apiBaseUrl: trimmedUrl,
          apiKey: serviceDraft.apiKey.trim()
        }
      },
      (response: FetchModelsResponse | undefined) => {
        setFetchingModels(false)
        if (chrome.runtime.lastError) {
          setFetchError(t("options.connection.commError", [chrome.runtime.lastError.message ?? ""]))
          return
        }
        if (!response) {
          setFetchError(t("options.connection.noResponse"))
          return
        }
        if (response.success && response.models && response.models.length > 0) {
          setModels(response.models)
          setFetchError(null)
          if (!serviceDraft.model.trim() || !response.models.includes(serviceDraft.model.trim())) {
            setServiceDraft((current) => ({ ...current, model: response.models![0] }))
          }
        } else {
          setFetchError(response.error ?? t("options.connection.fetchModelsError"))
        }
      }
    )
  }

  const handleExportSettings = () => {
    const payload = {
      app: "aiction",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: normalizeSettings(settings)
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
      const parsed = JSON.parse(content) as ExtensionSettings | { settings?: unknown }
      const imported = normalizeSettings("settings" in parsed ? parsed.settings : parsed)

      setPendingImportSettings(imported)
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
    setConnectionView("list")
    setEditingServiceId(null)
    setServiceDraft(createCustomServiceDraft())
    setSaving(true)
    setBackupStatus(null)

    void saveSettings({
      ...pendingImportSettings,
      modelServices: pendingImportSettings.modelServices.map((service) => ({
        ...service,
        name: service.name.trim(),
        apiBaseUrl: service.apiBaseUrl.trim(),
        apiKey: service.apiKey.trim(),
        model: service.model.trim()
      }))
    })
      .then(() => {
        setBackupStatus({ success: true, message: t("options.connection.configImported") })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : t("errors.unknownError")
        setBackupStatus({ success: false, message: t("options.connection.importSaveFailed", [message]) })
      })
      .finally(() => {
        setSaving(false)
        setPendingImportSettings(null)
      })
  }

  const openCreateService = () => {
    setConnectionView("create")
    setEditingServiceId(null)
    setServiceDraft(createCustomServiceDraft())
    setModels([])
    setFetchError(null)
    setTestResult(null)
  }

  const openEditService = (serviceId: string) => {
    const target = settings.modelServices.find((service) => service.id === serviceId)
    if (!target) {
      return
    }

    setConnectionView("edit")
    setEditingServiceId(serviceId)
    setServiceDraft({ ...target, modelParams: { ...target.modelParams } })
    setModels([])
    setFetchError(null)
    setTestResult(null)
  }

  const closeConnectionEditor = () => {
    setConnectionView("list")
    setEditingServiceId(null)
    setServiceDraft(createCustomServiceDraft())
    setModels([])
    setFetchError(null)
    setTestResult(null)
  }

  const saveServiceDraft = () => {
    if (!isServiceDraftValid) {
      return
    }

    const normalizedDraft: ModelServiceConfig = {
      ...serviceDraft,
      name: serviceDraft.name.trim(),
      apiBaseUrl: serviceDraft.apiBaseUrl.trim(),
      apiKey: serviceDraft.apiKey.trim(),
      model: serviceDraft.model.trim()
    }

    saveSettingsNow((current) => {
      if (connectionView === "edit" && editingServiceId) {
        return {
          ...current,
          modelServices: current.modelServices.map((service) => (service.id === editingServiceId ? normalizedDraft : service))
        }
      }

      return {
        ...current,
        modelServices: [...current.modelServices, normalizedDraft],
        activeModelServiceId: current.activeModelServiceId || normalizedDraft.id
      }
    })

    closeConnectionEditor()
  }

  const toggleServiceActive = (serviceId: string) => {
    saveSettingsNow((current) => {
      const isCurrentlyActive = current.activeModelServiceId === serviceId
      if (isCurrentlyActive) {
        const otherService = current.modelServices.find((s) => s.id !== serviceId)
        return { ...current, activeModelServiceId: otherService?.id ?? "" }
      }
      return { ...current, activeModelServiceId: serviceId }
    })
  }

  const deleteService = (serviceId: string) => {
    saveSettingsNow((current) => {
      const remainingServices = current.modelServices.filter((service) => service.id !== serviceId)
      const activeModelServiceId =
        current.activeModelServiceId === serviceId ? (remainingServices[0]?.id ?? "") : current.activeModelServiceId

      return {
        ...current,
        modelServices: remainingServices,
        activeModelServiceId
      }
    })
    setPendingDeleteServiceId(null)
  }

  // --- Shared styles ---

  const cardStyle: CSSProperties = {
    ...createCardStyle(theme)
  }

  const fieldLabelStyle: CSSProperties = {
    ...createFieldLabelStyle(theme)
  }

  const createInputStyle = (fieldName: string): CSSProperties => ({
    ...createSharedInputStyle(theme, focusedField === fieldName)
  })

  const primaryBtnStyle: CSSProperties = {
    ...createButtonStyle(theme, "primary")
  }

  const secondaryBtnStyle: CSSProperties = {
    ...createButtonStyle(theme, "secondary", { compact: true })
  }

  const createSelectableCardStyle = (selected: boolean): CSSProperties => ({
    border: `1px solid ${theme.border.default}`,
    borderRadius: uiRadius.md,
    background: selected ? `${theme.accent.primary}14` : theme.bg.surface,
    padding: uiSpace[14],
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "none",
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  })

  const insetCardStyle: CSSProperties = {
    border: `1px solid ${theme.border.hairline}`,
    borderRadius: uiRadius.md,
    padding: uiSpace[16],
    background: theme.bg.surfaceMuted
  }

  const emptyStateStyle: CSSProperties = {
    ...createStatusMessageStyle(theme, "info"),
    textAlign: "center",
    padding: `${uiSpace[24]}px ${uiSpace[16]}px`,
    border: `1px dashed ${theme.border.default}`,
    background: theme.bg.surfaceMuted,
    color: theme.text.secondary,
    fontSize: uiTypography.fontSize.md
  }

  const helperNoteStyle: CSSProperties = {
    ...createStatusMessageStyle(theme, "info"),
    lineHeight: 1.7
  }

  // --- Section renderers ---

  const renderAppearance = () => (
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
                saveSettingsNow((current) => ({ ...current, theme: value }))
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
                    saveSettingsNow((current) => ({ ...current, language: value }))
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

  const renderConnection = () => (
    <section style={{ ...cardStyle, marginBottom: uiSpace[16] }}>
      {isEditingConnection ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: uiSpace[16], marginBottom: uiSpace[20] }}>
            <div>
              <h2
                style={{
                  margin: `0 0 ${uiSpace[4]}px`,
                  fontSize: uiTypography.fontSize.lg,
                  fontWeight: uiTypography.fontWeight.semibold,
                  letterSpacing: uiTypography.letterSpacing.tight
                }}>
                {connectionView === "create" ? t("options.connection.createTitle") : t("options.connection.editTitle")}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: theme.text.secondary,
                  fontSize: uiTypography.fontSize.md
                }}>
                {t("options.connection.editorDesc")}
              </p>
            </div>
            <button type="button" onClick={closeConnectionEditor} style={secondaryBtnStyle}>
              {t("options.connection.backToList")}
            </button>
          </div>

          <div style={{ marginBottom: uiSpace[16] }}>
            <label htmlFor="service-name" style={fieldLabelStyle}>{t("options.connection.serviceName")}</label>
            <input
              id="service-name"
              value={serviceDraft.name}
              onFocus={() => setFocusedField("service-name")}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => {
                setServiceDraft((current) => ({ ...current, name: event.target.value }))
              }}
              placeholder={t("options.connection.serviceNamePlaceholder")}
              style={createInputStyle("service-name")}
            />
          </div>

          <div style={{ marginBottom: uiSpace[16] }}>
            <label htmlFor="service-api-base-url" style={fieldLabelStyle}>{t("options.connection.apiBaseUrl")}</label>
            <input
              id="service-api-base-url"
              value={serviceDraft.apiBaseUrl}
              onFocus={() => setFocusedField("apiBaseUrl")}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => {
                setServiceDraft((current) => ({ ...current, apiBaseUrl: event.target.value }))
              }}
              placeholder="https://api.openai.com/v1"
              style={createInputStyle("apiBaseUrl")}
            />
          </div>

          <div style={{ marginBottom: uiSpace[16] }}>
            <label htmlFor="service-api-key" style={fieldLabelStyle}>{t("options.connection.apiKey")}</label>
            <input
              id="service-api-key"
              type="password"
              value={serviceDraft.apiKey}
              onFocus={() => setFocusedField("apiKey")}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => {
                setServiceDraft((current) => ({ ...current, apiKey: event.target.value }))
              }}
              placeholder="sk-..."
              style={createInputStyle("apiKey")}
            />
          </div>

          <div style={{ marginBottom: uiSpace[16] }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: uiSpace[6] }}>
              <label htmlFor="service-model" style={fieldLabelStyle}>{t("options.connection.model")}</label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={fetchingModels}
                style={{
                  ...secondaryBtnStyle,
                  display: "flex",
                  alignItems: "center",
                  gap: uiSpace[4],
                  opacity: fetchingModels ? 0.5 : 1,
                  cursor: fetchingModels ? "not-allowed" : "pointer"
                }}>
                <RefreshIcon size={14} color={theme.text.primary} />
                {fetchingModels ? t("options.connection.fetching") : t("options.connection.fetchModels")}
              </button>
            </div>
            {models.length > 0 ? (
              <div style={{ display: "flex", gap: uiSpace[8] }}>
                <select
                  id="service-model"
                  value={serviceDraft.model}
                  onChange={(event) => {
                    setServiceDraft((current) => ({ ...current, model: event.target.value }))
                  }}
                  style={{ ...createInputStyle("model"), flex: 1, cursor: "pointer" }}>
                  {models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setModels([])}
                  style={secondaryBtnStyle}>
                  {t("options.connection.manualInput")}
                </button>
              </div>
            ) : (
              <input
                id="service-model"
                value={serviceDraft.model}
                onFocus={() => setFocusedField("model")}
                onBlur={() => setFocusedField(null)}
                onChange={(event) => {
                  setServiceDraft((current) => ({ ...current, model: event.target.value }))
                }}
                placeholder="gpt-4o-mini"
                style={createInputStyle("model")}
              />
            )}
            {fetchError ? (
              <div
                role="status"
                aria-live="polite"
                style={{ marginTop: uiSpace[8], ...createStatusMessageStyle(theme, "error") }}>
                {fetchError}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: uiSpace[10], marginBottom: uiSpace[16], flexWrap: "wrap" }}>
            <button
              disabled={testing}
              onClick={handleTestConnection}
              onMouseDown={() => setPressedBtn("test")}
              onMouseUp={() => setPressedBtn(null)}
              onMouseLeave={() => setPressedBtn(null)}
              style={{
                ...primaryBtnStyle,
                display: "flex",
                alignItems: "center",
                gap: uiSpace[6],
                opacity: testing ? 0.6 : 1,
                cursor: testing ? "not-allowed" : "pointer",
                background: testing ? theme.state.disabled : theme.accent.primary,
                transform: pressedBtn === "test" ? "scale(0.96)" : "scale(1)"
              }}>
              {testing ? t("options.connection.testing") : t("options.connection.testConnection")}
            </button>
            {testResult ? (
              <span
                role="status"
                aria-live="polite"
                style={{
                  ...createStatusMessageStyle(theme, testResult.success ? "success" : "error"),
                  borderRadius: uiRadius.pill,
                  fontWeight: uiTypography.fontWeight.medium,
                  lineHeight: 1.5
                }}>
                {testResult.message}
              </span>
            ) : null}
          </div>

          <div style={{ borderTop: `0.5px solid ${theme.border.hairline}`, paddingTop: uiSpace[20], marginTop: uiSpace[4] }}>
            <h3
              style={{
                margin: `0 0 ${uiSpace[4]}px`,
                fontSize: uiTypography.fontSize.md,
                fontWeight: uiTypography.fontWeight.semibold,
                letterSpacing: uiTypography.letterSpacing.tight
              }}>
              {t("options.connection.modelParams")}
            </h3>
            <p
              style={{
                margin: `0 0 ${uiSpace[16]}px`,
                color: theme.text.secondary,
                fontSize: uiTypography.fontSize.sm
              }}>
              {t("options.connection.modelParamsDesc")}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: `${uiSpace[12]}px ${uiSpace[16]}px`
              }}>
              {(
                [
                  { key: "maxTokens" as const, label: "Max Tokens", placeholder: "1024", min: 1, max: 128000, step: 1, desc: t("options.connection.paramMaxTokens") },
                  { key: "temperature" as const, label: "Temperature", placeholder: "0.3", min: 0, max: 2, step: 0.1, desc: t("options.connection.paramTemperature") },
                  { key: "topP" as const, label: "Top P", placeholder: "0.9", min: 0, max: 1, step: 0.05, desc: t("options.connection.paramTopP") },
                  { key: "presencePenalty" as const, label: "Presence Penalty", placeholder: "0", min: -2, max: 2, step: 0.1, desc: t("options.connection.paramPresencePenalty") },
                  { key: "frequencyPenalty" as const, label: "Frequency Penalty", placeholder: "0", min: -2, max: 2, step: 0.1, desc: t("options.connection.paramFrequencyPenalty") }
                ]
              ).map((param) => (
                <div key={param.key}>
                  <label htmlFor={`model-param-${param.key}`} style={{ ...fieldLabelStyle, marginBottom: uiSpace[4] }}>{param.label}</label>
                  <div style={{ fontSize: uiTypography.fontSize.xs, color: theme.text.secondary, marginBottom: uiSpace[6] }}>
                    {param.desc}
                  </div>
                  <input
                    id={`model-param-${param.key}`}
                    type="number"
                    value={serviceDraft.modelParams[param.key]}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    onFocus={() => setFocusedField(`modelParams-${param.key}`)}
                    onBlur={() => setFocusedField(null)}
                    onChange={(event) => {
                      const raw = event.target.value
                      const value = raw === "" ? DEFAULT_CUSTOM_MODEL_SERVICE.modelParams[param.key] : Number(raw)
                      setServiceDraft((current) => ({
                        ...current,
                        modelParams: { ...current.modelParams, [param.key]: value }
                      }))
                    }}
                    placeholder={param.placeholder}
                    style={createInputStyle(`modelParams-${param.key}`)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: uiSpace[12], marginTop: uiSpace[20], flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={saveServiceDraft}
              disabled={!isServiceDraftValid}
              style={{
                ...primaryBtnStyle,
                opacity: isServiceDraftValid ? 1 : 0.5,
                cursor: isServiceDraftValid ? "pointer" : "not-allowed"
              }}>
              {t("options.connection.saveService")}
            </button>
            <button type="button" onClick={closeConnectionEditor} style={secondaryBtnStyle}>
              {t("options.connection.cancel")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: uiSpace[16], marginBottom: uiSpace[20] }}>
            <div>
              <h2
                style={{
                  margin: `0 0 ${uiSpace[4]}px`,
                  fontSize: uiTypography.fontSize.lg,
                  fontWeight: uiTypography.fontWeight.semibold,
                  letterSpacing: uiTypography.letterSpacing.tight
                }}>
                {t("options.connection.listTitle")}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: theme.text.secondary,
                  fontSize: uiTypography.fontSize.md
                }}>
                {t("options.connection.listDesc")}
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateService}
              onMouseDown={() => setPressedBtn("add-service")}
              onMouseUp={() => setPressedBtn(null)}
              onMouseLeave={() => setPressedBtn(null)}
              style={{
                ...primaryBtnStyle,
                display: "flex",
                alignItems: "center",
                gap: uiSpace[4],
                transform: pressedBtn === "add-service" ? "scale(0.96)" : "scale(1)"
              }}>
              <PlusIcon size={14} color={theme.text.inverse} />
              {t("options.connection.addService")}
            </button>
          </div>

          {settings.modelServices.length === 0 ? (
            <div
              style={{ ...emptyStateStyle, padding: `${uiSpace[28]}px ${uiSpace[16]}px` }}>
              {t("options.connection.emptyServiceList")}
            </div>
          ) : (
            <div style={{ display: "grid", gap: uiSpace[12] }}>
              {settings.modelServices.map((service) => {
                const isActive = settings.activeModelServiceId === service.id

                const displayText = getAvatarDisplayText(service.iconText, service.name)
                const isEditingIcon = editingIconServiceId === service.id

                return (
                  <div
                    key={service.id}
                    style={createSelectableCardStyle(isActive)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: uiSpace[16] }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: uiSpace[8], marginBottom: uiSpace[6], flexWrap: "wrap" }}>
                          <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingIconServiceId(service.id)
                                setIconEditText(service.iconText ?? "")
                              }}
                              title={t("options.connection.iconTooltip")}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: uiRadius.sm,
                                border: "none",
                                background: getAvatarPalette(service.iconText, service.name, themeName === "dark").background,
                                color: getAvatarPalette(service.iconText, service.name, themeName === "dark").color,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: displayText.length >= 4 ? 8 : displayText.length > 1 ? 9 : 11,
                                fontWeight: uiTypography.fontWeight.semibold,
                                letterSpacing: uiTypography.letterSpacing.tight,
                                flexShrink: 0,
                                cursor: "pointer",
                                padding: 0,
                                outline: "none"
                              }}>
                              {isEditingIcon ? "" : displayText}
                            </button>
                            {isEditingIcon ? (
                              <input
                                autoFocus
                                maxLength={4}
                                value={iconEditText}
                                onChange={(e) => setIconEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    saveSettingsNow((current) => ({
                                      ...current,
                                      modelServices: current.modelServices.map((s) =>
                                        s.id === service.id ? { ...s, iconText: iconEditText.trim() } : s
                                      )
                                    }))
                                    setEditingIconServiceId(null)
                                  } else if (e.key === "Escape") {
                                    setEditingIconServiceId(null)
                                  }
                                }}
                                onBlur={() => {
                                  saveSettingsNow((current) => ({
                                    ...current,
                                    modelServices: current.modelServices.map((s) =>
                                      s.id === service.id ? { ...s, iconText: iconEditText.trim() } : s
                                    )
                                  }))
                                  setEditingIconServiceId(null)
                                }}
                                placeholder={t("options.connection.iconPlaceholder")}
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: 48,
                                  height: 30,
                                  fontSize: uiTypography.fontSize.md,
                                  border: `1px solid ${theme.border.default}`,
                                  borderRadius: uiRadius.sm,
                                  padding: `0 ${uiSpace[4]}px`,
                                  outline: "none",
                                  background: theme.bg.surface,
                                  color: theme.text.primary,
                                  zIndex: 10,
                                  boxShadow: uiShadow.md
                                }}
                              />
                            ) : null}
                          </span>
                          <span style={{ fontSize: uiTypography.fontSize.md, fontWeight: uiTypography.fontWeight.semibold, color: theme.text.primary }}>
                            {service.name}
                          </span>
                          <span style={{ fontSize: uiTypography.fontSize.xs, color: theme.text.secondary }}>{t("options.connection.customServiceBadge")}</span>
                        </div>
                        <div style={{ color: theme.text.secondary, fontSize: uiTypography.fontSize.sm, lineHeight: 1.6, wordBreak: "break-all" }}>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: uiSpace[8], flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <ToggleSwitch checked={isActive} onChange={() => toggleServiceActive(service.id)} theme={theme} />
                        <button type="button" onClick={() => openEditService(service.id)} style={secondaryBtnStyle}>
                          {t("options.connection.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteServiceId(service.id)}
                          style={{ ...secondaryBtnStyle, color: theme.state.error, borderColor: theme.state.error }}>
                          {t("options.connection.delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )

  const selectedAction = selectedActionId ? settings.actions.find((a) => a.id === selectedActionId) : null
  const selectedActionIndex = selectedActionId ? settings.actions.findIndex((a) => a.id === selectedActionId) : -1

  const handleAddAction = () => {
    const newId = `custom-${Date.now()}`
    saveSettingsNow((current) => ({
      ...current,
      actions: [
        ...current.actions,
        {
          id: newId,
          label: t("options.actions.newActionLabel"),
          template: t("options.actions.newActionTemplate"),
          enabled: true,
          iconText: ""
        }
      ]
    }))
    setSelectedActionId(newId)
  }

  const handleDeleteAction = (actionId: string) => {
    const index = settings.actions.findIndex((a) => a.id === actionId)
    saveSettingsNow((current) => ({
      ...current,
      actions: current.actions.filter((action) => action.id !== actionId)
    }))
    // Auto-select next or previous action
    const remaining = settings.actions.filter((a) => a.id !== actionId)
    if (remaining.length === 0) {
      setSelectedActionId(null)
    } else if (index < remaining.length) {
      setSelectedActionId(remaining[index].id)
    } else {
      setSelectedActionId(remaining[remaining.length - 1].id)
    }
  }

  const renderActions = () => (
    <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: `${uiSpace[20]}px ${uiSpace[24]}px ${uiSpace[16]}px`, borderBottom: `0.5px solid ${theme.border.hairline}` }}>
        <h2
          style={{
            margin: 0,
            fontSize: uiTypography.fontSize.lg,
            fontWeight: uiTypography.fontWeight.semibold,
            letterSpacing: uiTypography.letterSpacing.tight
          }}>
          {t("options.actions.title")}
        </h2>
      </div>

      {/* Main content: left list + right detail */}
      <div style={{ display: "flex", minHeight: 420 }}>
        {/* Left: Action list */}
        <div
          style={{
            width: 280,
            minWidth: 280,
            borderRight: `0.5px solid ${theme.border.hairline}`,
            display: "flex",
            flexDirection: "column"
          }}>
          {/* List items */}
          <div style={{ flex: 1, overflowY: "auto", padding: uiSpace[8] }}>
            {settings.actions.length === 0 ? (
              <div style={{ ...emptyStateStyle, margin: uiSpace[8], fontSize: uiTypography.fontSize.sm }}>
                {t("options.actions.emptyActions")}
              </div>
            ) : (
              settings.actions.map((item, index) => {
                const isSelected = selectedActionId === item.id
                const isDragging = draggedActionIndex === index
                const isDragOver = dragOverActionIndex === index
                const invalid = !hasTextPlaceholder(item.template)

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleActionDragStart(index)}
                    onDragOver={(e) => handleActionDragOver(e, index)}
                    onDragEnd={handleActionDragEnd}
                    onClick={() => setSelectedActionId(item.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: uiSpace[8],
                      padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                      marginBottom: 2,
                      borderRadius: uiRadius.sm,
                      cursor: "pointer",
                      background: isSelected ? `${theme.accent.primary}14` : isDragOver ? theme.bg.surfaceAlt : "transparent",
                      border: `1px solid ${invalid ? theme.state.warning : "transparent"}`,
                      opacity: isDragging ? 0.5 : 1,
                      transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                    }}>
                    {/* Drag handle */}
                    <div
                      style={{ cursor: "grab", display: "flex", flexShrink: 0, opacity: 0.4 }}
                      title={t("options.actions.dragHandle")}>
                      <DragHandleIcon size={12} color={theme.text.secondary} />
                    </div>

                    {/* Icon */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: uiRadius.sm,
                        background: theme.bg.surface,
                        color: theme.accent.primary,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}>
                      {item.icon ? (
                        <ActionIcon icon={item.icon} size={16} color={theme.accent.primary} />
                      ) : (
                        <span style={{ fontSize: 10, color: theme.text.secondary }}>?</span>
                      )}
                    </div>

                    {/* Label */}
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
                      {item.label}
                    </span>

                    {/* Enable toggle */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <ToggleSwitch
                        checked={item.enabled !== false}
                        onChange={() => updateCustomAction(index, { enabled: item.enabled === false ? true : false })}
                        theme={theme}
                      />
                    </div>
                  </div>
                )
              })
            )}

            {/* Add action button */}
            <button
              type="button"
              onClick={handleAddAction}
              onMouseDown={() => setPressedBtn("add-action")}
              onMouseUp={() => setPressedBtn(null)}
              onMouseLeave={() => setPressedBtn(null)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: uiSpace[8],
                padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                marginBottom: 2,
                borderRadius: uiRadius.sm,
                cursor: "pointer",
                background: "transparent",
                border: `1px dashed ${theme.border.default}`,
                width: "100%",
                boxSizing: "border-box",
                transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
                fontFamily: uiTypography.fontFamily,
                fontSize: uiTypography.fontSize.sm,
                color: theme.text.secondary,
                transform: pressedBtn === "add-action" ? "scale(0.98)" : "scale(1)"
              }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: uiRadius.sm,
                  border: `1px dashed ${theme.border.default}`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                <PlusIcon size={14} color={theme.text.secondary} />
              </div>
              <span>
                {t("options.actions.addAction")}
              </span>
            </button>
          </div>
        </div>

        {/* Right: Detail panel */}
        <div style={{ flex: 1, padding: uiSpace[24], overflowY: "auto" }}>
          {!selectedAction ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: theme.text.secondary,
                fontSize: uiTypography.fontSize.md
              }}>
              {t("options.actions.selectAction")}
            </div>
          ) : (
            <div>
              {/* Detail title */}
              <h3
                style={{
                  margin: `0 0 ${uiSpace[20]}px`,
                  fontSize: uiTypography.fontSize.md,
                  fontWeight: uiTypography.fontWeight.semibold,
                  color: theme.text.primary
                }}>
                {t("options.actions.detailTitle")}
              </h3>

              {/* Action name */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <label style={fieldLabelStyle}>{t("options.actions.actionName")}</label>
                <input
                  value={selectedAction.label}
                  onFocus={() => setFocusedField(`${selectedAction.id}-label`)}
                  onBlur={() => setFocusedField(null)}
                  onChange={(event) => {
                    updateCustomAction(selectedActionIndex, { label: event.target.value })
                  }}
                  placeholder={t("options.actions.actionNamePlaceholder")}
                  style={{ ...createInputStyle(`${selectedAction.id}-label`), fontSize: uiTypography.fontSize.sm }}
                />
              </div>

              {/* Icon */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <label style={fieldLabelStyle}>{t("options.connection.icon")}</label>
                <div style={{ display: "flex", alignItems: "center", gap: uiSpace[12] }}>
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      title={t("options.connection.iconTooltip")}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: uiRadius.sm,
                        border: `1px solid ${theme.border.default}`,
                        background: theme.bg.surface,
                        color: theme.accent.primary,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        padding: 0,
                        outline: "none"
                      }}>
                      {selectedAction.icon ? (
                        <ActionIcon icon={selectedAction.icon} size={20} color={theme.accent.primary} />
                      ) : (
                        <span style={{ fontSize: 14, color: theme.text.secondary }}>?</span>
                      )}
                    </button>

                    {showIconPicker ? (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          marginTop: uiSpace[8],
                          width: 320,
                          maxHeight: 400,
                          overflowY: "auto",
                          background: theme.bg.surface,
                          border: `1px solid ${theme.border.default}`,
                          borderRadius: uiRadius.md,
                          boxShadow: uiShadow.lg,
                          zIndex: 100,
                          padding: uiSpace[12]
                        }}>
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: uiSpace[8],
                          paddingBottom: uiSpace[8],
                          borderBottom: `0.5px solid ${theme.border.hairline}`
                        }}>
                          <span style={{ fontSize: uiTypography.fontSize.sm, fontWeight: uiTypography.fontWeight.semibold, color: theme.text.primary }}>
                            {t("options.actions.selectIcon")}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              saveSettingsNow((current) => ({
                                ...current,
                                actions: current.actions.map((a) =>
                                  a.id === selectedAction.id ? { ...a, icon: undefined } : a
                                )
                              }))
                              setShowIconPicker(false)
                            }}
                            style={{
                              fontSize: uiTypography.fontSize.xs,
                              color: theme.text.secondary,
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: `${uiSpace[2]}px ${uiSpace[6]}px`,
                              borderRadius: uiRadius.sm
                            }}>
                            {t("options.actions.clearIcon")}
                          </button>
                        </div>

                        {ACTION_ICON_LIBRARY.map((category) => (
                          <div key={category.name} style={{ marginBottom: uiSpace[12] }}>
                            <div style={{
                              fontSize: uiTypography.fontSize.xs,
                              color: theme.text.secondary,
                              marginBottom: uiSpace[6],
                              fontWeight: uiTypography.fontWeight.medium
                            }}>
                              {category.name}
                            </div>
                            <div style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(8, 1fr)",
                              gap: uiSpace[4]
                            }}>
                              {category.icons.map((entry: IconEntry) => {
                                const isSelected = selectedAction.icon === entry.icon
                                return (
                                  <button
                                    key={entry.icon}
                                    type="button"
                                    title={entry.label}
                                    onClick={() => {
                                      saveSettingsNow((current) => ({
                                        ...current,
                                        actions: current.actions.map((a) =>
                                          a.id === selectedAction.id ? { ...a, icon: entry.icon } : a
                                        )
                                      }))
                                      setShowIconPicker(false)
                                    }}
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: uiRadius.sm,
                                      border: isSelected ? `2px solid ${theme.accent.primary}` : `1px solid ${theme.border.hairline}`,
                                      background: isSelected ? `${theme.accent.primary}14` : "transparent",
                                      color: isSelected ? theme.accent.primary : theme.text.primary,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      cursor: "pointer",
                                      padding: 0,
                                      outline: "none",
                                      transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                                    }}>
                                    <ActionIcon icon={entry.icon} size={18} color={isSelected ? theme.accent.primary : theme.text.secondary} />
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <span style={{ fontSize: uiTypography.fontSize.sm, color: theme.text.secondary }}>
                    {selectedAction.icon ? t("options.actions.iconSelected") : t("options.connection.iconTooltip")}
                  </span>
                </div>
              </div>

              {/* Template */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <label style={fieldLabelStyle}>{t("options.actions.actionTemplate")}</label>
                <textarea
                  value={selectedAction.template}
                  onFocus={() => setFocusedField(`${selectedAction.id}-template`)}
                  onBlur={() => setFocusedField(null)}
                  onChange={(event) => {
                    updateCustomAction(selectedActionIndex, { template: event.target.value })
                  }}
                  placeholder={t("options.actions.actionTemplatePlaceholder")}
                  rows={4}
                  style={{
                    ...createInputStyle(`${selectedAction.id}-template`),
                    resize: "vertical",
                    minHeight: 80,
                    fontSize: uiTypography.fontSize.sm
                  } as CSSProperties}
                />
                <p style={{ margin: `${uiSpace[6]}px 0 0`, color: theme.text.secondary, fontSize: uiTypography.fontSize.xs }}>
                  {t("options.actions.templateHelp")}<code style={{ background: theme.bg.surfaceMuted, padding: "1px 4px", borderRadius: 3 }}>{"{text}"}</code>{t("options.actions.templateHelpSuffix")}
                </p>
                {!hasTextPlaceholder(selectedAction.template) ? (
                  <div style={{ marginTop: uiSpace[6], color: theme.state.warning, fontSize: uiTypography.fontSize.xs, fontWeight: uiTypography.fontWeight.medium }}>
                    {t("options.actions.missingPlaceholder")}
                  </div>
                ) : null}
              </div>

              {/* Enable toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${uiSpace[12]}px ${uiSpace[14]}px`,
                  border: `1px solid ${theme.border.hairline}`,
                  borderRadius: uiRadius.md,
                  background: theme.bg.surfaceMuted,
                  marginBottom: uiSpace[20]
                }}>
                <span style={{ fontSize: uiTypography.fontSize.sm, color: theme.text.primary }}>
                  {selectedAction.enabled === false ? t("options.actions.disabled") : t("options.actions.enabled")}
                </span>
                <ToggleSwitch
                  checked={selectedAction.enabled !== false}
                  onChange={() => updateCustomAction(selectedActionIndex, { enabled: selectedAction.enabled === false ? true : false })}
                  theme={theme}
                />
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleDeleteAction(selectedAction.id)}
                style={{
                  ...secondaryBtnStyle,
                  color: theme.state.error,
                  borderColor: theme.state.error
                }}>
                {t("options.actions.delete")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )

  const renderBackup = () => (
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
    </section>
  )

  const renderAbout = () => (
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

  const sectionContent: Record<Section, () => JSX.Element> = {
    appearance: renderAppearance,
    connection: renderConnection,
    actions: renderActions,
    backup: renderBackup,
    about: renderAbout
  }

  const sidebarWidth = 300

  if (!themeReady) return null

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: uiTypography.fontFamily,
        color: theme.text.primary,
        background: theme.bg.page,
        overflow: "hidden"
      }}>
      {/* Sidebar */}
      <nav
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          height: "100%",
          background: theme.bg.surface,
          borderRight: `0.5px solid ${theme.border.hairline}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
        {/* Sidebar header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: uiSpace[10],
            padding: `${uiSpace[24]}px ${uiSpace[32]}px ${uiSpace[16]}px`
          }}>
          <BrandIcon size={24} />
          <span
            style={{
              fontSize: uiTypography.fontSize.xxl,
              fontWeight: uiTypography.fontWeight.bold,
              letterSpacing: uiTypography.letterSpacing.tight
            }}>
            AIction
          </span>
          <span
            style={{
              fontSize: uiTypography.fontSize.sm,
              color: theme.text.secondary
            }}>
            v{chrome.runtime.getManifest().version}
          </span>
        </div>

        {/* Nav items */}
        <div style={{ padding: `${uiSpace[4]}px ${uiSpace[16]}px`, flex: 1 }}>
          {sections.map((section) => {
            const isActive = activeSection === section.key
            const isHovered = hoveredNav === section.key

            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                onMouseEnter={() => setHoveredNav(section.key)}
                onMouseLeave={() => setHoveredNav(null)}
                aria-current={isActive ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: uiSpace[10],
                  width: "100%",
                  padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                  marginBottom: 2,
                  border: "none",
                  borderRadius: uiRadius.sm,
                  background: isActive ? `${theme.accent.primary}14` : isHovered ? theme.bg.surfaceAlt : "transparent",
                  color: isActive ? theme.accent.primary : theme.text.primary,
                  cursor: "pointer",
                  fontFamily: uiTypography.fontFamily,
                  fontSize: uiTypography.fontSize.md,
                  fontWeight: uiTypography.fontWeight.regular,
                  outline: "none",
                  textAlign: "left",
                  transition: `background 200ms ease-linear, color 200ms ease-linear`,
                  position: "relative"
                }}>
                <NavIcon icon={section.icon} size={16} color={isActive ? theme.accent.primary : theme.text.secondary} />
                <span style={{ flex: 1 }}>{section.label}</span>
              </button>
            )
          })}
        </div>

        {/* Copyright */}
        <div
          style={{
            padding: `${uiSpace[16]}px ${uiSpace[32]}px`,
            borderTop: `0.5px solid ${theme.border.hairline}`,
            fontSize: uiTypography.fontSize.xs,
            color: theme.text.secondary,
            textAlign: "center"
          }}>
          {t("options.about.copyright")}
        </div>
      </nav>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(180deg, ${theme.accent.primary}15 0%, ${theme.bg.page} 300px)`
        }}>
        {/* Top bar */}
        <div
          style={{
            borderBottom: `0.5px solid ${theme.border.hairline}`,
            background: theme.bg.surface,
            position: "sticky",
            top: 0,
            zIndex: 10
          }}>
          <div
            style={{
              maxWidth: 1400,
              minWidth: 400,
              width: "100%",
              margin: "0 auto",
              padding: `0 ${uiSpace[32]}px`,
              boxSizing: "border-box"
            }}>
            <header
              style={{
                display: "flex",
                alignItems: "center",
                height: 56
              }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: uiTypography.fontSize.lg,
                  fontWeight: uiTypography.fontWeight.semibold,
                  letterSpacing: uiTypography.letterSpacing.tight
                }}>
                {sections.find((s) => s.key === activeSection)?.label}
              </h1>
            </header>
          </div>
        </div>

        <div
          style={{
            maxWidth: 1400,
            minWidth: 400,
            width: "100%",
            margin: "0 auto",
            padding: `${uiSpace[24]}px ${uiSpace[32]}px ${uiSpace[20]}px`,
            boxSizing: "border-box",
            flex: 1
          }}>
          {/* Section content */}
          {sectionContent[activeSection]()}

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

          {pendingDeleteServiceId ? (
            <ConfirmDialog
              title={t("options.backup.deleteServiceTitle")}
              message={t("options.backup.deleteServiceMessage")}
              confirmLabel={t("options.backup.deleteServiceButton")}
              cancelLabel={t("options.connection.cancel")}
              onConfirm={() => deleteService(pendingDeleteServiceId)}
              onCancel={() => setPendingDeleteServiceId(null)}
              themeName={themeName}
            />
          ) : null}


        </div>
      </div>
    </div>
  )
}
