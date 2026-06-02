import { type JSX, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { addIcon } from "@iconify/react"

import { NavIcon, ActionIcon } from "@/shared/ui/iconify"
import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { hasTextPlaceholder } from "@/shared/prompt"
import { BrandIcon } from "@/shared/ui/icons"
import { trackEvent } from "@/shared/analytics"
import { DEFAULT_CUSTOM_MODEL_SERVICE, DEFAULT_SETTINGS } from "@/shared/defaults"
import { getSettings, normalizeSettings, saveSettings, saveUserIcon, getUserIcons } from "@/shared/storage"
import { requestModelsDev, getModelsForProvider, getAllProviders, getModelParamSupport, type ModelsDevData, type ModelsDevModel, type ModelsDevProviderInfo, type ModelParamSupport } from "@/shared/models-dev"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createButtonStyle, createCardStyle, createFieldLabelStyle, createFocusRing, createInputStyle as createSharedInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { getAvatarPalette, getAvatarDisplayText } from "@/shared/ui/avatar"
import { ACTION_ICON_LIBRARY, type IconEntry } from "@/shared/ui/icon-library"
import { BUNDLED_TABLER_ICONS } from "@/shared/ui/bundled-icons"
import { useI18n } from "@/shared/i18n/context"
import type { ActionTemplate, ExtensionSettings, LanguagePreference, ThemePreference, ApiTestResponse, FetchModelsResponse, ProviderConfig, UserIconData, ModelParams } from "@/shared/types"
import { MESSAGE_TYPES } from "@/shared/constants"
import { ConfirmDialog } from "@/entrypoints/options/ConfirmDialog"

type Section = "appearance" | "connection" | "actions" | "backup" | "about"

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

function ProviderLogoById({ providerId, name, size = 24, theme }: { providerId: string; name: string; size?: number; theme: any }) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: uiRadius.sm,
        background: theme.bg.surfaceMuted,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        fontWeight: uiTypography.fontWeight.semibold,
        color: theme.accent.primary,
        flexShrink: 0
      }}>
        {name.charAt(0)}
      </div>
    )
  }

  return (
    <img
      src={`https://models.dev/logos/${providerId}.svg`}
      width={size}
      height={size}
      onError={() => setError(true)}
      style={{
        borderRadius: uiRadius.sm,
        flexShrink: 0
      }}
    />
  )
}

function createServiceDraft(): ProviderConfig {
  return {
    id: `service-${Date.now()}`,
    name: "",
    apiKey: "",
    model: "",
    modelParams: DEFAULT_CUSTOM_MODEL_SERVICE.modelParams
  }
}

export default function OptionsPage() {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  // Check if an icon is in the bundled set
  const isBundledIcon = (iconName: string): boolean => {
    if (!iconName.startsWith("tabler:")) return false
    const name = iconName.replace("tabler:", "")
    return name in (BUNDLED_TABLER_ICONS.icons as Record<string, { body: string }>)
  }

  // Handle icon selection: copy from bundled or fetch from API
  const handleIconSelect = async (iconName: string) => {
    if (isBundledIcon(iconName)) {
      // Copy from bundled icons to user icons
      const name = iconName.replace("tabler:", "")
      const iconData = (BUNDLED_TABLER_ICONS.icons as Record<string, { body: string }>)[name]
      if (iconData) {
        await saveUserIcon(iconName, {
          body: iconData.body,
          width: BUNDLED_TABLER_ICONS.width,
          height: BUNDLED_TABLER_ICONS.height
        })
      }
    } else {
      // Fetch from Iconify API
      try {
        const response = await fetch(`https://api.iconify.design/${iconName}.svg?height=24`)
        if (response.ok) {
          const svgText = await response.text()
          // Extract body from SVG (remove outer svg tag)
          const bodyMatch = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
          if (bodyMatch) {
            await saveUserIcon(iconName, { body: bodyMatch[1], width: 24, height: 24 })
            addIcon(iconName, { body: bodyMatch[1], width: 24, height: 24 })
          }
        }
      } catch (error) {
        console.error("Failed to fetch icon:", error)
      }
    }
  }

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
  const [pendingImportUserIcons, setPendingImportUserIcons] = useState<Record<string, UserIconData> | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [showProviderSelect, setShowProviderSelect] = useState(false)
  const [serviceDraft, setServiceDraft] = useState<ProviderConfig>(createServiceDraft())
  const [pendingDeleteServiceId, setPendingDeleteServiceId] = useState<string | null>(null)
  const [modelsDevData, setModelsDevData] = useState<ModelsDevData | null>(null)
  const [modelSearchQuery, setModelSearchQuery] = useState("")
  const [providerSearchQuery, setProviderSearchQuery] = useState("")
  const [editingIconServiceId, setEditingIconServiceId] = useState<string | null>(null)
  const [iconEditText, setIconEditText] = useState("")
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconSearchQuery, setIconSearchQuery] = useState("")
  const [iconSearchResults, setIconSearchResults] = useState<string[]>([])
  const [iconSearchLoading, setIconSearchLoading] = useState(false)
  const iconSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [draggedActionIndex, setDraggedActionIndex] = useState<number | null>(null)
  const [dragOverActionIndex, setDragOverActionIndex] = useState<number | null>(null)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const iconPickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void getSettings().then((loaded) => {
      setSettings(loaded)
      setThemeReady(true)
      if (loaded.actions.length > 0) {
        setSelectedActionId(loaded.actions[0].id)
      }
      if (loaded.providers.length > 0) {
        const first = loaded.providers[0]
        setSelectedServiceId(first.id)
        setServiceDraft({ ...first, modelParams: { ...first.modelParams } })
      }
    })
    void chrome.storage.local.get("optionsActiveSection").then((result) => {
      const saved = result.optionsActiveSection as Section | undefined
      if (saved && ["appearance", "connection", "actions", "backup", "about"].includes(saved)) {
        setActiveSection(saved)
      }
      setLoaded(true)
    })
    void requestModelsDev().then(setModelsDevData)
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

  useEffect(() => {
    if (!showIconPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setShowIconPicker(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showIconPicker])

  useEffect(() => {
    if (!iconSearchQuery.trim()) {
      setIconSearchResults([])
      setIconSearchLoading(false)
      return
    }
    setIconSearchLoading(true)
    if (iconSearchTimerRef.current) clearTimeout(iconSearchTimerRef.current)
    iconSearchTimerRef.current = setTimeout(() => {
      const q = iconSearchQuery.trim()
      if (/^[a-z0-9]+:[a-z0-9-]+$/i.test(q)) {
        setIconSearchResults([q])
        setIconSearchLoading(false)
        return
      }
      fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=64`)
        .then((res) => res.json())
        .then((data: { icons?: string[] }) => {
          setIconSearchResults(data.icons ?? [])
        })
        .catch(() => {
          setIconSearchResults([])
        })
        .finally(() => {
          setIconSearchLoading(false)
        })
    }, 300)
    return () => {
      if (iconSearchTimerRef.current) clearTimeout(iconSearchTimerRef.current)
    }
  }, [iconSearchQuery])

  const hasInvalidCustomTemplate = useMemo(() => {
    return settings.actions.some((item) => !hasTextPlaceholder(item.template))
  }, [settings.actions])

  const selectedService = selectedServiceId
    ? settings.providers.find((s) => s.id === selectedServiceId)
    : null

  const allProviders = useMemo(() => {
    if (!modelsDevData) return []
    return getAllProviders(modelsDevData)
  }, [modelsDevData])

  const filteredProviders = useMemo(() => {
    if (!providerSearchQuery.trim()) return allProviders
    const query = providerSearchQuery.trim().toLowerCase()
    return allProviders.filter((p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query))
  }, [allProviders, providerSearchQuery])

  const isServiceDraftValid =
    Boolean(serviceDraft.name.trim()) &&
    Boolean(serviceDraft.apiKey.trim()) &&
    Boolean(serviceDraft.model.trim()) &&
    (Boolean(serviceDraft.modelsDevId) || Boolean(serviceDraft.apiBaseUrl?.trim()))

  const saveSettingsNow = (updater: (current: ExtensionSettings) => ExtensionSettings) => {
    setSettings((current) => {
      const next = updater(current)

      void saveSettings({
        ...next,
        providers: next.providers.map((service) => ({
          ...service,
          name: service.name.trim(),
          apiBaseUrl: service.apiBaseUrl?.trim() || undefined,
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
    const trimmedKey = serviceDraft.apiKey.trim()
    const trimmedModel = serviceDraft.model.trim()
    const trimmedUrl = serviceDraft.apiBaseUrl?.trim()

    if (!trimmedKey || !trimmedModel) {
      setTestResult({ success: false, message: t("options.connection.missingUrlKeyModel") })
      return
    }
    if (!serviceDraft.modelsDevId && !trimmedUrl) {
      setTestResult({ success: false, message: t("options.connection.missingUrlKeyModel") })
      return
    }

    setTesting(true)
    setTestResult(null)

    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.API_TEST_REQUEST,
        payload: {
          apiBaseUrl: trimmedUrl || "",
          apiKey: trimmedKey,
          model: trimmedModel,
          modelsDevId: serviceDraft.modelsDevId
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
    const trimmedUrl = serviceDraft.apiBaseUrl?.trim()
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
    setSelectedServiceId(null)
    setServiceDraft(createServiceDraft())
    setSaving(true)
    setBackupStatus(null)

    // Save user icons if present
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
        providers: pendingImportSettings.providers.map((service) => ({
          ...service,
          name: service.name.trim(),
          apiBaseUrl: service.apiBaseUrl?.trim() || undefined,
          apiKey: service.apiKey.trim(),
          model: service.model.trim()
        }))
      })
    )
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
        setPendingImportUserIcons(null)
      })
  }

  const openCreateService = () => {
    setShowProviderSelect(true)
    setProviderSearchQuery("")
  }

  const selectProviderAndCreate = () => {
    const newService = createServiceDraft()
    saveSettingsNow((current) => ({
      ...current,
      providers: [...current.providers, newService],
      activeProviderId: current.activeProviderId || newService.id
    }))
    setSelectedServiceId(newService.id)
    setServiceDraft(newService)
    setShowProviderSelect(false)
    setModels([])
    setFetchError(null)
    setTestResult(null)
    setModelSearchQuery("")
    setProviderSearchQuery("")
  }

  const selectModelsDevProvider = (providerInfo: ModelsDevProviderInfo) => {
    const newService = createServiceDraft()
    newService.name = providerInfo.name
    newService.modelsDevId = providerInfo.id
    if (providerInfo.api) {
      newService.apiBaseUrl = providerInfo.api
    }
    saveSettingsNow((current) => ({
      ...current,
      providers: [...current.providers, newService],
      activeProviderId: current.activeProviderId || newService.id
    }))
    setSelectedServiceId(newService.id)
    setServiceDraft(newService)
    setShowProviderSelect(false)
    setModels([])
    setFetchError(null)
    setTestResult(null)
    setModelSearchQuery("")
    setProviderSearchQuery("")
  }

  const closeConnectionEditor = () => {
    setSelectedServiceId(null)
    setServiceDraft(createServiceDraft())
    setModels([])
    setFetchError(null)
    setTestResult(null)
    setModelSearchQuery("")
  }

  const saveServiceDraft = () => {
    if (!isServiceDraftValid || !selectedServiceId) {
      return
    }

    const normalizedDraft: ProviderConfig = {
      ...serviceDraft,
      name: serviceDraft.name.trim(),
      apiBaseUrl: serviceDraft.apiBaseUrl?.trim() || undefined,
      apiKey: serviceDraft.apiKey.trim(),
      model: serviceDraft.model.trim()
    }

    saveSettingsNow((current) => ({
      ...current,
      providers: current.providers.map((provider) => (provider.id === selectedServiceId ? normalizedDraft : provider))
    }))
  }

  const updateServiceField = (field: string, value: string) => {
    if (!selectedServiceId) return
    
    setServiceDraft((current) => ({ ...current, [field]: value }))
    
    saveSettingsNow((current) => ({
      ...current,
      providers: current.providers.map((service) =>
        service.id === selectedServiceId ? { ...service, [field]: value } : service
      )
    }))
  }

  const updateServiceModelParam = (key: keyof ModelParams, value: number) => {
    if (!selectedServiceId) return
    
    setServiceDraft((current) => ({
      ...current,
      modelParams: { ...current.modelParams, [key]: value }
    }))
    
    saveSettingsNow((current) => ({
      ...current,
      providers: current.providers.map((service) =>
        service.id === selectedServiceId
          ? { ...service, modelParams: { ...service.modelParams, [key]: value } }
          : service
      )
    }))
  }

  const toggleServiceActive = (serviceId: string) => {
    saveSettingsNow((current) => {
      // 单选模式：如果点击的是已启用的，不允许禁用
      if (current.activeProviderId === serviceId) {
        return current
      }
      // 启用新的，自动禁用旧的
      return { ...current, activeProviderId: serviceId }
    })
  }

  const deleteService = (serviceId: string) => {
    saveSettingsNow((current) => {
      const remainingServices = current.providers.filter((service) => service.id !== serviceId)
      const activeProviderId =
        current.activeProviderId === serviceId ? (remainingServices[0]?.id ?? "") : current.activeProviderId

      return {
        ...current,
        providers: remainingServices,
        activeProviderId
      }
    })
    
    // 自动选中下一个provider
    const remaining = settings.providers.filter((s) => s.id !== serviceId)
    if (remaining.length > 0) {
      setSelectedServiceId(remaining[0].id)
      setServiceDraft({ ...remaining[0], modelParams: { ...remaining[0].modelParams } })
    } else {
      setSelectedServiceId(null)
    setServiceDraft(createServiceDraft())
    }
    
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
    <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: `${uiSpace[20]}px ${uiSpace[24]}px ${uiSpace[16]}px`, borderBottom: `0.5px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2
          style={{
            margin: 0,
            fontSize: uiTypography.fontSize.lg,
            fontWeight: uiTypography.fontWeight.semibold,
            letterSpacing: uiTypography.letterSpacing.tight
          }}>
          {t("options.connection.listTitle")}
        </h2>
        <button
          type="button"
          onClick={openCreateService}
          onMouseDown={() => setPressedBtn("add-service")}
          onMouseUp={() => setPressedBtn(null)}
          onMouseLeave={() => setPressedBtn(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: uiSpace[6],
            padding: `${uiSpace[6]}px ${uiSpace[14]}px`,
            borderRadius: uiRadius.sm,
            cursor: "pointer",
            background: theme.accent.primary,
            border: "none",
            transition: `all ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
            fontFamily: uiTypography.fontFamily,
            fontSize: uiTypography.fontSize.sm,
            fontWeight: uiTypography.fontWeight.medium,
            color: "#fff",
            transform: pressedBtn === "add-service" ? "scale(0.96)" : "scale(1)"
          }}>
          <PlusIcon size={14} color="#fff" />
          <span>{t("options.connection.addProvider")}</span>
        </button>
      </div>

      {/* Main content: left list + right detail */}
      <div style={{ display: "flex", minHeight: 420 }}>
        {/* Left: Provider list */}
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
            {settings.providers.length === 0 ? (
              <div style={{ ...emptyStateStyle, margin: uiSpace[8], fontSize: uiTypography.fontSize.sm }}>
                {t("options.connection.emptyServiceList")}
              </div>
            ) : (
              settings.providers.map((service) => {
                const isSelected = selectedServiceId === service.id
                const isActive = settings.activeProviderId === service.id
                const displayName = service.name || "Custom"

                return (
                  <div
                    key={service.id}
                    onClick={() => {
                      setSelectedServiceId(service.id)
                      setServiceDraft({ ...service, modelParams: { ...service.modelParams } })
                      setModels([])
                      setFetchError(null)
                      setTestResult(null)
                      setModelSearchQuery("")
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: uiSpace[8],
                      padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                      marginBottom: 2,
                      borderRadius: uiRadius.sm,
                      cursor: "pointer",
                      background: isSelected ? `${theme.accent.primary}14` : "transparent",
                      transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                    }}>
                    {/* Provider Logo */}
                    {service.modelsDevId ? (
                      <ProviderLogoById providerId={service.modelsDevId} name={displayName} size={28} theme={theme} />
                    ) : (
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: uiRadius.sm,
                        background: theme.bg.surfaceMuted,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: uiTypography.fontWeight.semibold,
                        color: theme.accent.primary,
                        flexShrink: 0
                      }}>
                        {displayName.charAt(0)}
                      </div>
                    )}

                    {/* Name */}
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
                      {displayName}
                    </span>

                    {/* Toggle */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <ToggleSwitch
                        checked={isActive}
                        onChange={() => toggleServiceActive(service.id)}
                        theme={theme}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div style={{ flex: 1, padding: uiSpace[24], overflowY: "auto" }}>
          {!selectedService ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: theme.text.secondary,
                fontSize: uiTypography.fontSize.md
              }}>
              {t("options.connection.selectProvider")}
            </div>
          ) : (
            <div>
              {/* Provider badge */}
              <div style={{ display: "flex", alignItems: "center", gap: uiSpace[10], marginBottom: uiSpace[16], padding: `${uiSpace[10]}px ${uiSpace[14]}px`, background: theme.bg.surfaceMuted, borderRadius: uiRadius.md, border: `1px solid ${theme.border.hairline}` }}>
                {serviceDraft.modelsDevId ? (
                  <ProviderLogoById providerId={serviceDraft.modelsDevId} name={serviceDraft.name || "Custom"} size={28} theme={theme} />
                ) : (
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: uiRadius.sm,
                    background: theme.bg.surfaceMuted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: uiTypography.fontWeight.semibold,
                    color: theme.accent.primary,
                    flexShrink: 0
                  }}>
                    {(serviceDraft.name || "C").charAt(0)}
                  </div>
                )}
                <span style={{ fontSize: uiTypography.fontSize.md, fontWeight: uiTypography.fontWeight.semibold, color: theme.text.primary }}>
                  {serviceDraft.name || "Custom"}
                </span>
                {serviceDraft.modelsDevId && serviceDraft.apiBaseUrl ? (
                  <span style={{ fontSize: uiTypography.fontSize.xs, color: theme.text.secondary, marginLeft: "auto" }}>
                    {serviceDraft.apiBaseUrl}
                  </span>
                ) : null}
              </div>

              {/* Name */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <label htmlFor="service-name" style={fieldLabelStyle}>{t("options.connection.serviceName")}</label>
                <input
                  id="service-name"
                  value={serviceDraft.name}
                  onFocus={() => setFocusedField("service-name")}
                  onBlur={() => setFocusedField(null)}
                  onChange={(event) => {
                    updateServiceField("name", event.target.value)
                  }}
                  placeholder={t("options.connection.serviceNamePlaceholder")}
                  style={createInputStyle("service-name")}
                />
              </div>

              {/* API Base URL (for custom provider) */}
              {!serviceDraft.modelsDevId ? (
                <div style={{ marginBottom: uiSpace[16] }}>
                  <label htmlFor="service-api-base-url" style={fieldLabelStyle}>{t("options.connection.apiBaseUrl")}</label>
                  <input
                    id="service-api-base-url"
                    value={serviceDraft.apiBaseUrl ?? ""}
                    onFocus={() => setFocusedField("apiBaseUrl")}
                    onBlur={() => setFocusedField(null)}
                    onChange={(event) => {
                      updateServiceField("apiBaseUrl", event.target.value)
                    }}
                    placeholder="https://api.example.com/v1"
                    style={createInputStyle("apiBaseUrl")}
                  />
                </div>
              ) : null}

              {/* API Key */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <label htmlFor="service-api-key" style={fieldLabelStyle}>{t("options.connection.apiKey")}</label>
                <input
                  id="service-api-key"
                  type="password"
                  value={serviceDraft.apiKey}
                  onFocus={() => setFocusedField("apiKey")}
                  onBlur={() => setFocusedField(null)}
                  onChange={(event) => {
                    updateServiceField("apiKey", event.target.value)
                  }}
                  placeholder="sk-..."
                  style={createInputStyle("apiKey")}
                />
              </div>

              {/* Model */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: uiSpace[6] }}>
                  <label htmlFor="service-model" style={fieldLabelStyle}>{t("options.connection.model")}</label>
                  {!serviceDraft.modelsDevId ? (
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
                  ) : null}
                </div>
                {!serviceDraft.modelsDevId && models.length > 0 ? (
                  <div style={{ display: "flex", gap: uiSpace[8] }}>
                    <select
                      id="service-model"
                      value={serviceDraft.model}
                      onChange={(event) => {
                        updateServiceField("model", event.target.value)
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
                  <>
                    <input
                      id="service-model"
                      value={serviceDraft.model}
                      onFocus={() => setFocusedField("model")}
                      onBlur={() => setFocusedField(null)}
                      onChange={(event) => {
                        updateServiceField("model", event.target.value)
                      }}
                      placeholder="model-name"
                      style={createInputStyle("model")}
                    />
                    {/* Model suggestions from models.dev or fallback */}
                    {(() => {
                      const devModels = modelsDevData && serviceDraft.modelsDevId
                        ? getModelsForProvider(modelsDevData, serviceDraft.modelsDevId)
                        : []
                      const hasDevModels = devModels.length > 0
                      const query = modelSearchQuery.trim().toLowerCase()
                      const filtered = query
                        ? devModels.filter(
                            (m) =>
                              m.id.toLowerCase().includes(query) ||
                              m.name.toLowerCase().includes(query)
                          )
                        : devModels

                      if (!hasDevModels) return null

                      return (
                        <div style={{ marginTop: uiSpace[8] }}>
                          <input
                            type="text"
                            value={modelSearchQuery}
                            onChange={(e) => setModelSearchQuery(e.target.value)}
                            placeholder={t("options.connection.modelSearchPlaceholder")}
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              padding: `${uiSpace[4]}px ${uiSpace[8]}px`,
                              fontSize: uiTypography.fontSize.xs,
                              border: `1px solid ${theme.border.hairline}`,
                              borderRadius: uiRadius.sm,
                              background: theme.bg.surface,
                              color: theme.text.primary,
                              outline: "none",
                              marginBottom: uiSpace[6],
                              fontFamily: uiTypography.fontFamily
                            }}
                          />
                          {hasDevModels ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: uiSpace[2], maxHeight: 240, overflowY: "auto" }}>
                              {filtered.map((m) => {
                                const isSelected = serviceDraft.model === m.id
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      updateServiceField("model", m.id)
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: uiSpace[8],
                                      padding: `${uiSpace[4]}px ${uiSpace[10]}px`,
                                      border: `1px solid ${isSelected ? theme.accent.primary : "transparent"}`,
                                      borderRadius: uiRadius.sm,
                                      background: isSelected ? `${theme.accent.primary}14` : "transparent",
                                      color: isSelected ? theme.accent.primary : theme.text.primary,
                                      fontSize: uiTypography.fontSize.xs,
                                      cursor: "pointer",
                                      outline: "none",
                                      fontFamily: uiTypography.fontFamily,
                                      textAlign: "left",
                                      transition: `all ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
                                      lineHeight: 1.5
                                    }}>
                                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {m.name}
                                    </span>
                                    {m.reasoning ? (
                                      <span style={{
                                        padding: `1px ${uiSpace[4]}px`,
                                        borderRadius: uiRadius.pill,
                                        background: `${theme.accent.primary}18`,
                                        color: theme.accent.primary,
                                        fontSize: 10,
                                        fontWeight: uiTypography.fontWeight.medium,
                                        flexShrink: 0
                                      }}>
                                        reasoning
                                      </span>
                                    ) : null}
                                    {m.tool_call ? (
                                      <span style={{
                                        padding: `1px ${uiSpace[4]}px`,
                                        borderRadius: uiRadius.pill,
                                        background: `${theme.state.success ?? "#22c55e"}18`,
                                        color: theme.state.success ?? "#22c55e",
                                        fontSize: 10,
                                        fontWeight: uiTypography.fontWeight.medium,
                                        flexShrink: 0
                                      }}>
                                        tools
                                      </span>
                                    ) : null}
                                    {m.attachment ? (
                                      <span style={{
                                        padding: `1px ${uiSpace[4]}px`,
                                        borderRadius: uiRadius.pill,
                                        background: `${theme.state.warning ?? "#f59e0b"}18`,
                                        color: theme.state.warning ?? "#f59e0b",
                                        fontSize: 10,
                                        fontWeight: uiTypography.fontWeight.medium,
                                        flexShrink: 0
                                      }}>
                                        attach
                                      </span>
                                    ) : null}
                                  </button>
                                )
                              })}
                              {filtered.length === 0 ? (
                                <div style={{ textAlign: "center", padding: uiSpace[12], color: theme.text.secondary, fontSize: uiTypography.fontSize.xs }}>
                                  No models matching "{modelSearchQuery}"
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })()}
                  </>
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

              {/* Test connection */}
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

              {/* Model params */}
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

                {(() => {
                  const paramSupport = modelsDevData && serviceDraft.modelsDevId
                    ? getModelParamSupport(modelsDevData, serviceDraft.modelsDevId, serviceDraft.model)
                    : { maxTokens: true, temperature: true, topP: true, presencePenalty: true, frequencyPenalty: true }

                  const allParams = [
                    { key: "maxTokens" as const, label: "Max Tokens", placeholder: "1024", min: 1, max: 128000, step: 1, desc: t("options.connection.paramMaxTokens") },
                    { key: "temperature" as const, label: "Temperature", placeholder: "0.3", min: 0, max: 2, step: 0.1, desc: t("options.connection.paramTemperature") },
                    { key: "topP" as const, label: "Top P", placeholder: "0.9", min: 0, max: 1, step: 0.05, desc: t("options.connection.paramTopP") },
                    { key: "presencePenalty" as const, label: "Presence Penalty", placeholder: "0", min: -2, max: 2, step: 0.1, desc: t("options.connection.paramPresencePenalty") },
                    { key: "frequencyPenalty" as const, label: "Frequency Penalty", placeholder: "0", min: -2, max: 2, step: 0.1, desc: t("options.connection.paramFrequencyPenalty") }
                  ]

                  const supportedParams = allParams.filter((p) => paramSupport[p.key])

                  if (supportedParams.length === 0) {
                    return (
                      <div style={{ fontSize: uiTypography.fontSize.xs, color: theme.text.secondary, fontStyle: "italic" }}>
                        {t("options.connection.noSupportedParams")}
                      </div>
                    )
                  }

                  return (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: `${uiSpace[12]}px ${uiSpace[16]}px`
                      }}>
                      {supportedParams.map((param) => (
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
                              updateServiceModelParam(param.key, value)
                            }}
                            placeholder={param.placeholder}
                            style={createInputStyle(`modelParams-${param.key}`)}
                          />
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Delete button */}
              <div style={{ marginTop: uiSpace[20], borderTop: `0.5px solid ${theme.border.hairline}`, paddingTop: uiSpace[20] }}>
                <button
                  type="button"
                  onClick={() => setPendingDeleteServiceId(selectedServiceId)}
                  style={{
                    ...secondaryBtnStyle,
                    color: theme.state.error,
                    borderColor: theme.state.error
                  }}>
                  {t("options.connection.delete")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Provider selection modal */}
      {showProviderSelect ? (
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
              setShowProviderSelect(false)
              setProviderSearchQuery("")
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
                onClick={() => {
                  setShowProviderSelect(false)
                  setProviderSearchQuery("")
                }}
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
                onChange={(e) => setProviderSearchQuery(e.target.value)}
                placeholder={t("options.connection.searchProviders")}
                autoFocus
                style={{
                  ...createInputStyle("provider-search"),
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
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: uiSpace[12],
                alignContent: "start"
              }}>
              {/* Custom provider option */}
              <button
                type="button"
                onClick={() => selectProviderAndCreate()}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: uiSpace[8],
                  padding: uiSpace[16],
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
                    width: 48,
                    height: 48,
                    borderRadius: uiRadius.sm,
                    background: theme.bg.surfaceMuted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                  <PlusIcon size={24} color={theme.text.secondary} />
                </div>
                <span
                  style={{
                    fontSize: uiTypography.fontSize.sm,
                    fontWeight: uiTypography.fontWeight.semibold,
                    color: theme.text.primary,
                    textAlign: "center"
                  }}>
                  {t("options.connection.customProvider")}
                </span>
                <span
                  style={{
                    fontSize: uiTypography.fontSize.xs,
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
                  onClick={() => selectModelsDevProvider(provider)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: uiSpace[8],
                    padding: uiSpace[16],
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
                  <ProviderLogoById providerId={provider.id} name={provider.name} size={48} theme={theme} />
                  <span
                    style={{
                      fontSize: uiTypography.fontSize.sm,
                      fontWeight: uiTypography.fontWeight.semibold,
                      color: theme.text.primary,
                      textAlign: "center"
                    }}>
                    {provider.name}
                  </span>
                  <span
                    style={{
                      fontSize: uiTypography.fontSize.xs,
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
      ) : null}
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
      <div style={{ padding: `${uiSpace[20]}px ${uiSpace[24]}px ${uiSpace[16]}px`, borderBottom: `0.5px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2
          style={{
            margin: 0,
            fontSize: uiTypography.fontSize.lg,
            fontWeight: uiTypography.fontWeight.semibold,
            letterSpacing: uiTypography.letterSpacing.tight
          }}>
          {t("options.actions.title")}
        </h2>
        <button
          type="button"
          onClick={handleAddAction}
          onMouseDown={() => setPressedBtn("add-action")}
          onMouseUp={() => setPressedBtn(null)}
          onMouseLeave={() => setPressedBtn(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: uiSpace[6],
            padding: `${uiSpace[6]}px ${uiSpace[14]}px`,
            borderRadius: uiRadius.sm,
            cursor: "pointer",
            background: theme.accent.primary,
            border: "none",
            transition: `all ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
            fontFamily: uiTypography.fontFamily,
            fontSize: uiTypography.fontSize.sm,
            fontWeight: uiTypography.fontWeight.medium,
            color: "#fff",
            transform: pressedBtn === "add-action" ? "scale(0.96)" : "scale(1)"
          }}>
          <PlusIcon size={14} color="#fff" />
          <span>{t("options.actions.addAction")}</span>
        </button>
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
                        ref={iconPickerRef}
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          marginTop: uiSpace[8],
                          width: 320,
                          height: 200,
                          overflowY: "auto",
                          background: theme.bg.surface,
                          border: `1px solid ${theme.border.default}`,
                          borderRadius: uiRadius.md,
                          boxShadow: uiShadow.lg,
                          zIndex: 100,
                          padding: uiSpace[12]
                        }}>
                        <div style={{
                          marginBottom: uiSpace[8],
                          paddingBottom: uiSpace[8],
                          borderBottom: `0.5px solid ${theme.border.hairline}`
                        }}>
                          <span style={{ fontSize: uiTypography.fontSize.sm, fontWeight: uiTypography.fontWeight.semibold, color: theme.text.primary }}>
                            {t("options.actions.selectIcon")}
                          </span>
                        </div>

                        <input
                          type="text"
                          value={iconSearchQuery}
                          onChange={(e) => setIconSearchQuery(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              const q = iconSearchQuery.trim()
                              if (/^[a-z0-9]+:[a-z0-9-]+$/i.test(q)) {
                                await handleIconSelect(q)
                                saveSettingsNow((current) => ({
                                  ...current,
                                  actions: current.actions.map((a) =>
                                    a.id === selectedAction.id ? { ...a, icon: q } : a
                                  )
                                }))
                                setShowIconPicker(false)
                              }
                            }
                          }}
                          placeholder={t("options.actions.iconSearchPlaceholder")}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: `${uiSpace[6]}px ${uiSpace[8]}px`,
                            fontSize: uiTypography.fontSize.sm,
                            border: `1px solid ${theme.border.default}`,
                            borderRadius: uiRadius.sm,
                            background: theme.bg.surface,
                            color: theme.text.primary,
                            outline: "none",
                            marginBottom: uiSpace[8]
                          }}
                        />

                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(8, 1fr)",
                          gap: uiSpace[4]
                        }}>
                          {iconSearchQuery.trim() ? (
                            iconSearchLoading ? (
                              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: uiSpace[16], color: theme.text.secondary, fontSize: uiTypography.fontSize.xs }}>
                                {t("options.actions.iconSearching")}
                              </div>
                            ) : iconSearchResults.length > 0 ? (
                              iconSearchResults.map((iconName) => {
                                const isSelected = selectedAction.icon === iconName
                                return (
                                  <button
                                    key={iconName}
                                    type="button"
                                    title={iconName}
                                    onClick={async () => {
                                      await handleIconSelect(iconName)
                                      saveSettingsNow((current) => ({
                                        ...current,
                                        actions: current.actions.map((a) =>
                                          a.id === selectedAction.id ? { ...a, icon: iconName } : a
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
                                    <ActionIcon icon={iconName} size={18} color={isSelected ? theme.accent.primary : theme.text.secondary} />
                                  </button>
                                )
                              })
                            ) : (
                              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: uiSpace[16], color: theme.text.secondary, fontSize: uiTypography.fontSize.xs }}>
                                {t("options.actions.iconNoResults")}
                              </div>
                            )
                          ) : (
                            ACTION_ICON_LIBRARY.map((entry: IconEntry) => {
                              const isSelected = selectedAction.icon === entry.icon
                              return (
                                <button
                                  key={entry.icon}
                                  type="button"
                                  title={entry.label}
                                  onClick={async () => {
                                    await handleIconSelect(entry.icon)
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
                            })
                          )}
                        </div>
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
