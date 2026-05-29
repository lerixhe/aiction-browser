import { type JSX, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import { hasTextPlaceholder } from "@/shared/prompt"
import { BrandIcon } from "@/shared/ui/icons"
import { trackEvent } from "@/shared/analytics"
import { DEFAULT_CUSTOM_MODEL_SERVICE, DEFAULT_SETTINGS } from "@/shared/defaults"
import { getSettings, normalizeSettings, saveSettings } from "@/shared/storage"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createButtonStyle, createCardStyle, createFieldLabelStyle, createFocusRing, createInputStyle as createSharedInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { getAvatarPalette, getAvatarDisplayText } from "@/shared/ui/avatar"
import type { ActionTemplate, ExtensionSettings, ThemePreference, ToolbarMode, ApiTestResponse, FetchModelsResponse, ModelServiceConfig } from "@/shared/types"
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
        width: 44,
        height: 24,
        borderRadius: 12,
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
          left: checked ? 23 : 3,
          width: 18,
          height: 18,
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

function AppearanceIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth={1.3} />
      <path d="M10 2.5C10 2.5 6 6 6 10C6 14 10 17.5 10 17.5" stroke={color} strokeWidth={1.3} />
      <line x1="3" y1="10" x2="17" y2="10" stroke={color} strokeWidth={1.3} />
    </svg>
  )
}

function ConnectionIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 6C4 4.9 4.9 4 6 4H14C15.1 4 16 4.9 16 6V14C16 15.1 15.1 16 14 16H6C4.9 16 4 15.1 4 14V6Z" stroke={color} strokeWidth={1.3} />
      <path d="M7 10H13M10 7V13" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  )
}

function ActionsIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 12.5L8.5 8.5L11.5 11.5L15.5 5.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 5.5H15.5V8.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BackupIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3V11" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M7.5 8.5L10 11L12.5 8.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 13.5V14C4 15.1 4.9 16 6 16H14C15.1 16 16 15.1 16 14V13.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

function AboutIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth={1.3} />
      <path d="M10 9V14" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="0.75" fill={color} />
    </svg>
  )
}

const sections: { key: Section; label: string; icon: typeof AppearanceIcon }[] = [
  { key: "appearance", label: "外观", icon: AppearanceIcon },
  { key: "connection", label: "API提供商", icon: ConnectionIcon },
  { key: "actions", label: "动作指令", icon: ActionsIcon },
  { key: "backup", label: "备份与迁移", icon: BackupIcon },
  { key: "about", label: "关于", icon: AboutIcon }
]

function createCustomServiceDraft(): ModelServiceConfig {
  return {
    ...DEFAULT_CUSTOM_MODEL_SERVICE,
    id: `service-${Date.now()}`
  }
}

export default function OptionsPage() {
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]
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
  const [editingIconActionId, setEditingIconActionId] = useState<string | null>(null)
  const [actionIconEditText, setActionIconEditText] = useState("")
  const [draggedActionIndex, setDraggedActionIndex] = useState<number | null>(null)
  const [dragOverActionIndex, setDragOverActionIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void getSettings().then((loaded) => {
      setSettings(loaded)
      setThemeReady(true)
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
      setTestResult({ success: false, message: "请填写 API Base URL、API Key 和 Model 后再测试。" })
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
          setTestResult({ success: false, message: `扩展通信失败：${chrome.runtime.lastError.message}` })
          return
        }
        if (!response) {
          setTestResult({ success: false, message: "后台未返回响应。" })
          return
        }
        const latencyInfo = response.latencyMs != null ? ` (${response.latencyMs}ms)` : ""
        if (response.success) {
          setTestResult({ success: true, message: `连接成功${latencyInfo}` })
        } else {
          setTestResult({ success: false, message: response.error ?? "测试失败" })
        }
      }
    )
  }

  const handleFetchModels = () => {
    const trimmedUrl = serviceDraft.apiBaseUrl.trim()
    if (!trimmedUrl) {
      setFetchError("请先填写 API Base URL")
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
          setFetchError(`通信失败：${chrome.runtime.lastError.message}`)
          return
        }
        if (!response) {
          setFetchError("后台未返回响应。")
          return
        }
        if (response.success && response.models && response.models.length > 0) {
          setModels(response.models)
          setFetchError(null)
          if (!serviceDraft.model.trim() || !response.models.includes(serviceDraft.model.trim())) {
            setServiceDraft((current) => ({ ...current, model: response.models![0] }))
          }
        } else {
          setFetchError(response.error ?? "未找到可用模型")
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

    setBackupStatus({ success: true, message: "配置已导出为 JSON 文件。" })
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
      const message = error instanceof Error ? error.message : "无法解析文件"
      setBackupStatus({ success: false, message: `导入失败：${message}` })
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
        setBackupStatus({ success: true, message: "配置已导入并保存。" })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "未知错误"
        setBackupStatus({ success: false, message: `导入保存失败：${message}` })
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
    border: `1px solid ${selected ? theme.accent.primary : theme.border.default}`,
    borderRadius: uiRadius.md,
    background: selected ? theme.bg.surfaceAlt : theme.bg.surface,
    padding: uiSpace[14],
    textAlign: "left",
    cursor: "pointer",
    boxShadow: selected ? createFocusRing(theme.accent.primary) : "none",
    transition: `border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}, transform 150ms ${uiMotion.easingSpring}, background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
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
        主题配色
      </h2>
      <p
        style={{
          margin: `0 0 ${uiSpace[16]}px`,
          color: theme.text.secondary,
          fontSize: uiTypography.fontSize.md
        }}>
        浅色、深色或跟随系统（需浏览器支持）
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
          const labels: Record<ThemePreference, string> = { auto: "跟随系统", light: "浅色", dark: "深色" }

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
                background: isSelected ? theme.bg.surface : "transparent",
                color: isSelected ? theme.text.primary : theme.text.secondary,
                cursor: "pointer",
                fontSize: uiTypography.fontSize.sm,
                fontWeight: isSelected ? uiTypography.fontWeight.semibold : uiTypography.fontWeight.regular,
                fontFamily: uiTypography.fontFamily,
                outline: "none",
                boxShadow: isSelected ? createFocusRing(theme.accent.primary) : "none",
                transition: `all ${uiMotion.durationFast} ${uiMotion.easingStandard}`
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

            动作指令菜单样式
          </h2>
          <p
            style={{
              margin: `0 0 ${uiSpace[16]}px`,
              color: theme.text.secondary,
              fontSize: uiTypography.fontSize.md
            }}>
            触发按钮展开后的动作指令菜单样式
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: uiSpace[12]
            }}>
            {(
              [
                { value: "explode", label: "环形按钮排列", description: "灵动展开，趣味反馈" },
                { value: "pill", label: "胶囊工具栏", description: "经典设计，沉稳直观" }
              ] satisfies { value: ToolbarMode; label: string; description: string }[]
            ).map((option) => {
              const isSelected = settings.toolbarMode === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    saveSettingsNow((current) => ({ ...current, toolbarMode: option.value }))
                  }}
                  aria-pressed={isSelected}
                  style={createSelectableCardStyle(isSelected)}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: uiSpace[8]
                    }}>
                    <span
                      style={{
                        color: theme.text.primary,
                        fontSize: uiTypography.fontSize.md,
                        fontWeight: uiTypography.fontWeight.semibold,
                        fontFamily: uiTypography.fontFamily
                      }}>
                      {option.label}
                    </span>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: isSelected ? theme.accent.primary : theme.border.default,
                        flexShrink: 0
                      }}
                    />
                  </div>
                  <div
                    style={{
                      color: theme.text.secondary,
                      fontSize: uiTypography.fontSize.sm,
                      lineHeight: 1.6,
                      fontFamily: uiTypography.fontFamily
                    }}>
                    {option.description}
                  </div>
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
                {connectionView === "create" ? "添加自定义服务" : "编辑自定义服务"}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: theme.text.secondary,
                  fontSize: uiTypography.fontSize.md
                }}>
                配置服务名称、模型接口和采样参数
              </p>
            </div>
            <button type="button" onClick={closeConnectionEditor} style={secondaryBtnStyle}>
              返回列表
            </button>
          </div>

          <div style={{ marginBottom: uiSpace[16] }}>
            <label htmlFor="service-name" style={fieldLabelStyle}>服务名称</label>
            <input
              id="service-name"
              value={serviceDraft.name}
              onFocus={() => setFocusedField("service-name")}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => {
                setServiceDraft((current) => ({ ...current, name: event.target.value }))
              }}
              placeholder="例如：OpenAI 主账号"
              style={createInputStyle("service-name")}
            />
          </div>

          <div style={{ marginBottom: uiSpace[16] }}>
            <label htmlFor="service-api-base-url" style={fieldLabelStyle}>API Base URL</label>
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
            <label htmlFor="service-api-key" style={fieldLabelStyle}>API Key</label>
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
              <label htmlFor="service-model" style={fieldLabelStyle}>Model</label>
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
                {fetchingModels ? "获取中..." : "获取模型"}
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
                  手动输入
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
              {testing ? "测试中..." : "测试连通性"}
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
              模型参数
            </h3>
            <p
              style={{
                margin: `0 0 ${uiSpace[16]}px`,
                color: theme.text.secondary,
                fontSize: uiTypography.fontSize.sm
              }}>
              适用于解释、翻译等文本处理场景的采样参数
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: `${uiSpace[12]}px ${uiSpace[16]}px`
              }}>
              {(
                [
                  { key: "maxTokens" as const, label: "Max Tokens", placeholder: "1024", min: 1, max: 128000, step: 1, desc: "最大输出 token 数" },
                  { key: "temperature" as const, label: "Temperature", placeholder: "0.3", min: 0, max: 2, step: 0.1, desc: "采样温度，越低越确定" },
                  { key: "topP" as const, label: "Top P", placeholder: "0.9", min: 0, max: 1, step: 0.05, desc: "核采样概率阈值" },
                  { key: "presencePenalty" as const, label: "Presence Penalty", placeholder: "0", min: -2, max: 2, step: 0.1, desc: "存在惩罚" },
                  { key: "frequencyPenalty" as const, label: "Frequency Penalty", placeholder: "0", min: -2, max: 2, step: 0.1, desc: "频率惩罚" }
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
              保存服务
            </button>
            <button type="button" onClick={closeConnectionEditor} style={secondaryBtnStyle}>
              取消
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
                API提供商列表
              </h2>
              <p
                style={{
                  margin: 0,
                  color: theme.text.secondary,
                  fontSize: uiTypography.fontSize.md
                }}>
                支持添加多个API提供商，可快速切换以满足不同场景需求。
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
              添加自定义服务
            </button>
          </div>

          {settings.modelServices.length === 0 ? (
            <div
              style={{ ...emptyStateStyle, padding: `${uiSpace[28]}px ${uiSpace[16]}px` }}>
              还没有添加任何自定义服务，点击上方按钮开始配置。
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
                              title="点击自定义图标文字"
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
                                placeholder="最多4字"
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: 48,
                                  height: 30,
                                  fontSize: uiTypography.fontSize.sm,
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
                          <span style={{ fontSize: uiTypography.fontSize.xs, color: theme.text.secondary }}>自定义服务</span>
                        </div>
                        <div style={{ color: theme.text.secondary, fontSize: uiTypography.fontSize.sm, lineHeight: 1.6, wordBreak: "break-all" }}>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: uiSpace[8], flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <ToggleSwitch checked={isActive} onChange={() => toggleServiceActive(service.id)} theme={theme} />
                        <button type="button" onClick={() => openEditService(service.id)} style={secondaryBtnStyle}>
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteServiceId(service.id)}
                          style={{ ...secondaryBtnStyle, color: theme.state.error, borderColor: theme.state.error }}>
                          删除
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

  const renderActions = () => (
    <section style={{ ...cardStyle }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: uiSpace[16] }}>
        <div>
          <h2
            style={{
              margin: `0 0 ${uiSpace[4]}px`,
              fontSize: uiTypography.fontSize.lg,
              fontWeight: uiTypography.fontWeight.semibold,
              letterSpacing: uiTypography.letterSpacing.tight
            }}>
            动作指令列表
          </h2>
          <p style={{ margin: 0, color: theme.text.secondary, fontSize: uiTypography.fontSize.md }}>
            自定义选区操作指令
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            saveSettingsNow((current) => ({
              ...current,
              actions: [
                ...current.actions,
                {
                  id: `custom-${Date.now()}`,
                  label: "新动作",
                  template: "帮我处理以下内容「{text}」",
                  enabled: true,
                  iconText: ""
                }
              ]
            }))
          }}
          onMouseDown={() => setPressedBtn("add-action")}
          onMouseUp={() => setPressedBtn(null)}
          onMouseLeave={() => setPressedBtn(null)}
          style={{
            ...primaryBtnStyle,
            display: "flex",
            alignItems: "center",
            gap: uiSpace[4],
            transform: pressedBtn === "add-action" ? "scale(0.96)" : "scale(1)"
          }}>
          <PlusIcon size={14} color={theme.text.inverse} />
          新增动作
        </button>
      </div>

      <p style={{ marginTop: 0, marginBottom: uiSpace[12], color: theme.text.secondary, fontSize: uiTypography.fontSize.sm }}>
        模板必须包含 <code style={{ background: theme.bg.surfaceMuted, padding: "2px 6px", borderRadius: 4, fontSize: uiTypography.fontSize.xs }}>{"{text}"}</code> 占位符，用来注入用户选中的文本。
      </p>

      {settings.actions.map((item, index) => {
        const invalid = !hasTextPlaceholder(item.template)
        const displayText = getAvatarDisplayText(item.iconText, item.label)
        const isEditingIcon = editingIconActionId === item.id
        const isDragging = draggedActionIndex === index
        const isDragOver = dragOverActionIndex === index

        return (
          <div
            key={item.id}
            draggable
            onDragStart={() => handleActionDragStart(index)}
            onDragOver={(e) => handleActionDragOver(e, index)}
            onDragEnd={handleActionDragEnd}
            style={{
              border: `1px solid ${invalid ? theme.state.warning : isDragOver ? theme.accent.primary : theme.border.hairline}`,
              borderRadius: uiRadius.md,
              padding: uiSpace[14],
              marginBottom: uiSpace[10],
              background: invalid ? theme.state.warningBg : isDragging ? theme.bg.surfaceMuted : theme.bg.surface,
              boxShadow: invalid ? "none" : uiShadow.sm,
              transition: `box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}, background ${uiMotion.durationFast} ${uiMotion.easingStandard}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
              opacity: isDragging ? 0.6 : 1,
              transform: isDragOver ? "translateY(2px)" : "none"
            }}>
            <div style={{ display: "grid", gridTemplateColumns: "20px 30px 140px 1fr auto", gap: uiSpace[8], alignItems: "center" }}>
              <div
                style={{
                  cursor: "grab",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.text.secondary,
                  opacity: 0.6,
                  padding: `${uiSpace[2]}px 0`
                }}
                title="拖拽排序">
                <DragHandleIcon size={14} color={theme.text.secondary} />
              </div>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingIconActionId(item.id)
                    setActionIconEditText(item.iconText ?? "")
                  }}
                  title="点击自定义图标文字"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: uiRadius.sm,
                    border: "none",
                    background: getAvatarPalette(item.iconText, item.label, themeName === "dark").background,
                    color: getAvatarPalette(item.iconText, item.label, themeName === "dark").color,
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
                    value={actionIconEditText}
                    onChange={(e) => setActionIconEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        saveSettingsNow((current) => ({
                          ...current,
                          actions: current.actions.map((a, i) =>
                            i === index ? { ...a, iconText: actionIconEditText.trim() } : a
                          )
                        }))
                        setEditingIconActionId(null)
                      } else if (e.key === "Escape") {
                        setEditingIconActionId(null)
                      }
                    }}
                    onBlur={() => {
                      saveSettingsNow((current) => ({
                        ...current,
                        actions: current.actions.map((a, i) =>
                          i === index ? { ...a, iconText: actionIconEditText.trim() } : a
                        )
                      }))
                      setEditingIconActionId(null)
                    }}
                    placeholder="最多4字"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: 48,
                      height: 30,
                      fontSize: uiTypography.fontSize.sm,
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
              </div>
              <input
                aria-label="动作名称"
                value={item.label}
                onFocus={() => setFocusedField(`${item.id}-label`)}
                onBlur={() => setFocusedField(null)}
                onChange={(event) => {
                  updateCustomAction(index, { label: event.target.value })
                }}
                placeholder="按钮名称"
                style={createInputStyle(`${item.id}-label`)}
              />
              <input
                aria-label="动作模板"
                value={item.template}
                onFocus={() => setFocusedField(`${item.id}-template`)}
                onBlur={() => setFocusedField(null)}
                onChange={(event) => {
                  updateCustomAction(index, { template: event.target.value })
                }}
                placeholder="模板，必须包含 {text}"
                style={createInputStyle(`${item.id}-template`)}
              />
              <div style={{ display: "flex", alignItems: "center", gap: uiSpace[8] }}>
                <ToggleSwitch
                  checked={item.enabled !== false}
                  onChange={() => updateCustomAction(index, { enabled: item.enabled === false ? true : false })}
                  theme={theme}
                />
                <button
                  type="button"
                  onClick={() => {
                    saveSettingsNow((current) => ({
                      ...current,
                      actions: current.actions.filter((action) => action.id !== item.id)
                    }))
                  }}
                  style={{ ...secondaryBtnStyle, color: theme.state.error, borderColor: theme.state.error }}>
                  删除
                </button>
              </div>
            </div>
            {invalid ? (
              <div style={{ marginTop: uiSpace[8], color: theme.state.warning, fontSize: uiTypography.fontSize.sm, fontWeight: uiTypography.fontWeight.medium }}>
                模板缺少 {"{text}"} 占位符。
              </div>
            ) : null}
          </div>
        )
      })}

      {settings.actions.length === 0 ? (
        <div style={emptyStateStyle}>
          还没有动作，点击上方「新增动作」开始创建。
        </div>
      ) : null}
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
          配置数据
        </h2>
        <p style={{ margin: 0, color: theme.text.secondary, fontSize: uiTypography.fontSize.md }}>
          导入与导出配置
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
            导出配置
          </h3>
          <p style={{ margin: `0 0 ${uiSpace[14]}px`, color: theme.text.secondary, fontSize: uiTypography.fontSize.sm, lineHeight: 1.6 }}>
            导出配置便于迁移或备份，文件中可能包含key等敏感信息，请妥善保存。
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
            导出 JSON 文件
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
            导入配置
          </h3>
          <p style={{ margin: `0 0 ${uiSpace[14]}px`, color: theme.text.secondary, fontSize: uiTypography.fontSize.sm, lineHeight: 1.6 }}>
            从已导出的 JSON 文件恢复设置，导入后会覆盖当前配置。
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
            选择备份文件
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
          关于我们
        </h2>
        <p
          style={{
            margin: `0 0 ${uiSpace[16]}px`,
            color: theme.text.secondary,
            fontSize: uiTypography.fontSize.md,
            lineHeight: 1.7
          }}>
          Aiction 是一款轻量级 Chrome 扩展，帮助你在浏览网页时随时获取 AI 辅助。选中任意文本即可快速提问、翻译、总结或自定义指令，让 AI 成为你的浏览助手。
        </p>

        <div
          style={{
            marginTop: uiSpace[8]
          }}>
          <div style={{ fontWeight: uiTypography.fontWeight.semibold, fontSize: uiTypography.fontSize.md, color: theme.text.primary, marginBottom: uiSpace[8] }}>
            主要功能
          </div>
          <div
            style={{
              fontSize: uiTypography.fontSize.md,
              color: theme.text.secondary,
              lineHeight: 1.7
            }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: uiSpace[4] }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              选中网页文本，即刻唤起 AI 工具栏
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: uiSpace[4] }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              内置翻译、总结、解释等常用指令
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: uiSpace[4] }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              支持自定义动作指令，灵活扩展
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: uiSpace[4] }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              兼容 OpenAI、Claude、Gemini 等主流大模型
            </div>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
              对话式交互，持续追问不中断
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
            联系我们
          </div>
          <div>Email：lerixhe@gmail.com</div>
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
          版本信息
        </h2>
        <div
          style={{
            fontSize: uiTypography.fontSize.md,
            color: theme.text.secondary,
            lineHeight: 1.7
          }}>
          <div>当前版本：v{chrome.runtime.getManifest().version}</div>
          <div>开源协议：GPL-3.0</div>
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
          协助改善用户体验
        </h2>
        <p
          style={{
            margin: `0 0 ${uiSpace[16]}px`,
            color: theme.text.secondary,
            fontSize: uiTypography.fontSize.md,
            lineHeight: 1.7
          }}>
          开启遥测数据后，我们会收集匿名使用统计（如功能使用频率、AI 响应性能），帮助改进产品体验。数据不包含任何个人信息、选中文本内容或 API Key。
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
              协助改善用户体验
            </div>
            <div
              style={{
                fontSize: uiTypography.fontSize.sm,
                color: theme.text.secondary
              }}>
              {settings.telemetryEnabled ? "已开启" : "已关闭"}
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

  const sidebarWidth = 320

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
            padding: `${uiSpace[20]}px ${uiSpace[32]}px ${uiSpace[12]}px`
          }}>
          <BrandIcon size={32} />
          <span
            style={{
              fontSize: uiTypography.fontSize.xl,
              fontWeight: uiTypography.fontWeight.bold,
              letterSpacing: uiTypography.letterSpacing.tight
            }}>
            设置
          </span>
        </div>

        {/* Nav items */}
        <div style={{ padding: `${uiSpace[4]}px ${uiSpace[32]}px`, flex: 1 }}>
          {sections.map((section) => {
            const isActive = activeSection === section.key
            const isHovered = hoveredNav === section.key
            const Icon = section.icon

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
                  gap: uiSpace[8],
                  width: "100%",
                  padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                  marginBottom: 4,
                  border: "none",
                  borderRadius: uiRadius.sm,
                  background: isActive ? theme.bg.surfaceMuted : isHovered ? theme.bg.surfaceAlt : "transparent",
                  color: isActive ? theme.text.primary : theme.text.secondary,
                  cursor: "pointer",
                  fontFamily: uiTypography.fontFamily,
                  fontSize: uiTypography.fontSize.md,
                  fontWeight: isActive ? uiTypography.fontWeight.semibold : uiTypography.fontWeight.regular,
                  outline: "none",
                  boxShadow: isActive ? createFocusRing(theme.accent.primary) : "none",
                  textAlign: "left",
                  transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
                  position: "relative"
                }}>
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: 2,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 16,
                      borderRadius: 1.5,
                      background: theme.accent.primary
                    }}
                  />
                )}
                <Icon size={18} color={isActive ? theme.accent.primary : theme.text.secondary} />
                {section.label}
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
          © 2026 Aiction All rights reserved.
        </div>
      </nav>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column"
        }}>
        <div
          style={{
            maxWidth: 1000,
            minWidth: 400,
            width: "100%",
            margin: "0 auto",
            padding: `${uiSpace[32]}px ${uiSpace[32]}px ${uiSpace[20]}px`,
            boxSizing: "border-box",
            flex: 1
          }}>
          {/* Section header */}
          <div style={{ marginBottom: uiSpace[24] }}>
            <h1
              style={{
                margin: 0,
                fontSize: uiTypography.fontSize.title,
                fontWeight: uiTypography.fontWeight.bold,
                letterSpacing: uiTypography.letterSpacing.tight
              }}>
              {sections.find((s) => s.key === activeSection)?.label}
            </h1>
          </div>

          {/* Section content */}
          {sectionContent[activeSection]()}

          {pendingImportSettings ? (
            <ConfirmDialog
              title="导入配置"
              message="确定导入这份备份并覆盖当前所有设置吗？当前未保存的修改也会被替换。"
              confirmLabel="导入并覆盖"
              onConfirm={confirmImportSettings}
              onCancel={() => setPendingImportSettings(null)}
              themeName={themeName}
            />
          ) : null}

          {pendingDeleteServiceId ? (
            <ConfirmDialog
              title="删除自定义服务"
              message="确定删除这个自定义服务吗？如果它当前已启用，系统会自动启用下一个服务。"
              confirmLabel="删除服务"
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
