import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebouncedCallback } from "use-debounce"

import { DEFAULT_CUSTOM_MODEL_PROVIDER } from "@/shared/defaults"
import { saveSettings } from "@/shared/storage"
import {
  requestModelsDev,
  getModelsForProvider,
  getAllProviders,
  getModelParamSupport,
  type ModelsDevData,
  type ModelsDevProviderInfo,
  type ModelParamSupport
} from "@/shared/models-dev"
import { MESSAGE_TYPES } from "@/shared/constants"
import type {
  ExtensionSettings,
  ProviderConfig,
  ModelParams,
  ApiTestResponse,
  FetchModelsResponse
} from "@/shared/types"
import { useI18n } from "@/shared/i18n/context"

export function createProviderDraft(): ProviderConfig {
  return {
    id: `provider-${Date.now()}`,
    name: "",
    apiKey: "",
    model: "",
    modelParams: DEFAULT_CUSTOM_MODEL_PROVIDER.modelParams
  }
}

export function useProviderManager(
  settings: ExtensionSettings,
  setSettings: React.Dispatch<React.SetStateAction<ExtensionSettings>>
) {
  const { t } = useI18n()

  // --- State ---
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [showProviderSelect, setShowProviderSelect] = useState(false)
  const [providerDraft, setProviderDraft] = useState<ProviderConfig>(createProviderDraft())
  const [pendingDeleteProviderId, setPendingDeleteProviderId] = useState<string | null>(null)
  const [modelsDevData, setModelsDevData] = useState<ModelsDevData | null>(null)
  const [modelSearchQuery, setModelSearchQuery] = useState("")
  const [providerSearchQuery, setProviderSearchQuery] = useState("")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // --- Debounced save ---
  const debouncedSaveSettings = useDebouncedCallback(
    (settings: ExtensionSettings) => {
      void saveSettings(settings)
    },
    400
  )

  // --- Load models.dev data ---
  useEffect(() => {
    void requestModelsDev().then(setModelsDevData)
  }, [])

  // --- Derived state ---
  const selectedProvider = selectedProviderId
    ? settings.providers.find((s) => s.id === selectedProviderId)
    : null

  const allProviders = useMemo(() => {
    if (!modelsDevData) return []
    return getAllProviders(modelsDevData)
  }, [modelsDevData])

  const filteredProviders = useMemo(() => {
    if (!providerSearchQuery.trim()) return allProviders
    const query = providerSearchQuery.trim().toLowerCase()
    return allProviders.filter(
      (p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)
    )
  }, [allProviders, providerSearchQuery])

  const isProviderDraftValid =
    Boolean(providerDraft.name.trim()) &&
    Boolean(providerDraft.apiKey.trim()) &&
    Boolean(providerDraft.model.trim()) &&
    (Boolean(providerDraft.modelsDevId) || Boolean(providerDraft.apiBaseUrl?.trim()))

  // --- Save helpers (shared with parent) ---
  const saveSettingsNow = useCallback(
    (updater: (current: ExtensionSettings) => ExtensionSettings) => {
      setSettings((current) => {
        const next = updater(current)
        void saveSettings(next)
        return next
      })
    },
    [setSettings]
  )

  const saveSettingsDebounced = useCallback(
    (updater: (current: ExtensionSettings) => ExtensionSettings) => {
      setSettings((current) => {
        const next = updater(current)
        debouncedSaveSettings(next)
        return next
      })
    },
    [setSettings, debouncedSaveSettings]
  )

  // --- Provider CRUD ---
  const openCreateProvider = useCallback(() => {
    setShowProviderSelect(true)
    setProviderSearchQuery("")
  }, [])

  const selectProviderAndCreate = useCallback(() => {
    const newProvider = createProviderDraft()
    saveSettingsNow((current) => ({
      ...current,
      providers: [...current.providers, newProvider],
      activeProviderId: current.activeProviderId || newProvider.id
    }))
    setSelectedProviderId(newProvider.id)
    setProviderDraft(newProvider)
    setShowProviderSelect(false)
    setModels([])
    setFetchError(null)
    setTestResult(null)
    setModelSearchQuery("")
    setProviderSearchQuery("")
  }, [saveSettingsNow])

  const selectModelsDevProvider = useCallback(
    (providerInfo: ModelsDevProviderInfo) => {
      const newProvider = createProviderDraft()
      newProvider.name = providerInfo.name
      newProvider.modelsDevId = providerInfo.id
      if (providerInfo.api) {
        newProvider.apiBaseUrl = providerInfo.api
      }
      saveSettingsNow((current) => ({
        ...current,
        providers: [...current.providers, newProvider],
        activeProviderId: current.activeProviderId || newProvider.id
      }))
      setSelectedProviderId(newProvider.id)
      setProviderDraft(newProvider)
      setShowProviderSelect(false)
      setModels([])
      setFetchError(null)
      setTestResult(null)
      setModelSearchQuery("")
      setProviderSearchQuery("")
    },
    [saveSettingsNow]
  )

  const closeConnectionEditor = useCallback(() => {
    setSelectedProviderId(null)
    setProviderDraft(createProviderDraft())
    setModels([])
    setFetchError(null)
    setTestResult(null)
    setModelSearchQuery("")
  }, [])

  const selectProvider = useCallback((provider: ProviderConfig) => {
    setSelectedProviderId(provider.id)
    setProviderDraft({ ...provider, modelParams: { ...provider.modelParams } })
    setModels([])
    setFetchError(null)
    setTestResult(null)
    setModelSearchQuery("")
  }, [])

  const saveProviderDraft = useCallback(() => {
    if (!isProviderDraftValid || !selectedProviderId) return

    const normalizedDraft: ProviderConfig = {
      ...providerDraft,
      name: providerDraft.name.trim(),
      apiBaseUrl: providerDraft.apiBaseUrl?.trim() || undefined,
      apiKey: providerDraft.apiKey.trim(),
      model: providerDraft.model.trim()
    }

    saveSettingsNow((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === selectedProviderId ? normalizedDraft : provider
      )
    }))
  }, [isProviderDraftValid, selectedProviderId, providerDraft, saveSettingsNow])

  const updateProviderField = useCallback(
    (field: string, value: string) => {
      if (!selectedProviderId) return

      setProviderDraft((current) => ({ ...current, [field]: value }))

      saveSettingsDebounced((current) => ({
        ...current,
        providers: current.providers.map((provider) =>
          provider.id === selectedProviderId ? { ...provider, [field]: value } : provider
        )
      }))
    },
    [selectedProviderId, saveSettingsDebounced]
  )

  const updateProviderModelParam = useCallback(
    (key: keyof ModelParams, value: number) => {
      if (!selectedProviderId) return

      setProviderDraft((current) => ({
        ...current,
        modelParams: { ...current.modelParams, [key]: value }
      }))

      saveSettingsDebounced((current) => ({
        ...current,
        providers: current.providers.map((provider) =>
          provider.id === selectedProviderId
            ? { ...provider, modelParams: { ...provider.modelParams, [key]: value } }
            : provider
        )
      }))
    },
    [selectedProviderId, saveSettingsDebounced]
  )

  const toggleProviderActive = useCallback(
    (providerId: string) => {
      saveSettingsNow((current) => {
        if (current.activeProviderId === providerId) return current
        return { ...current, activeProviderId: providerId }
      })
    },
    [saveSettingsNow]
  )

  const deleteProvider = useCallback(
    (providerId: string) => {
      saveSettingsNow((current) => {
        const remainingProviders = current.providers.filter((p) => p.id !== providerId)
        const activeProviderId =
          current.activeProviderId === providerId
            ? (remainingProviders[0]?.id ?? "")
            : current.activeProviderId
        return { ...current, providers: remainingProviders, activeProviderId }
      })

      const remaining = settings.providers.filter((p) => p.id !== providerId)
      if (remaining.length > 0) {
        setSelectedProviderId(remaining[0].id)
        setProviderDraft({ ...remaining[0], modelParams: { ...remaining[0].modelParams } })
      } else {
        setSelectedProviderId(null)
        setProviderDraft(createProviderDraft())
      }

      setPendingDeleteProviderId(null)
    },
    [settings.providers, saveSettingsNow]
  )

  // --- Test connection ---
  const handleTestConnection = useCallback(() => {
    const trimmedKey = providerDraft.apiKey.trim()
    const trimmedModel = providerDraft.model.trim()
    const trimmedUrl = providerDraft.apiBaseUrl?.trim()

    if (!trimmedKey || !trimmedModel) {
      setTestResult({ success: false, message: t("options.connection.missingUrlKeyModel") })
      return
    }
    if (!providerDraft.modelsDevId && !trimmedUrl) {
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
          modelsDevId: providerDraft.modelsDevId
        }
      },
      (response: ApiTestResponse | undefined) => {
        setTesting(false)
        if (chrome.runtime.lastError) {
          setTestResult({
            success: false,
            message: t("options.connection.commError", [chrome.runtime.lastError.message ?? ""])
          })
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
  }, [providerDraft, t])

  // --- Fetch models ---
  const handleFetchModels = useCallback(() => {
    const trimmedUrl = providerDraft.apiBaseUrl?.trim()
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
          apiKey: providerDraft.apiKey.trim()
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
          if (!providerDraft.model.trim() || !response.models.includes(providerDraft.model.trim())) {
            setProviderDraft((current) => ({ ...current, model: response.models![0] }))
          }
        } else {
          setFetchError(response.error ?? t("options.connection.fetchModelsError"))
        }
      }
    )
  }, [providerDraft, t])

  // --- Model data helpers ---
  const devModels = useMemo(() => {
    if (!modelsDevData || !providerDraft.modelsDevId) return []
    return getModelsForProvider(modelsDevData, providerDraft.modelsDevId)
  }, [modelsDevData, providerDraft.modelsDevId])

  const paramSupport = useMemo((): ModelParamSupport => {
    if (!modelsDevData || !providerDraft.modelsDevId) {
      return { maxTokens: true, temperature: true, topP: true, presencePenalty: true, frequencyPenalty: true }
    }
    return getModelParamSupport(modelsDevData, providerDraft.modelsDevId, providerDraft.model)
  }, [modelsDevData, providerDraft.modelsDevId, providerDraft.model])

  return {
    // State
    selectedProviderId,
    showProviderSelect,
    providerDraft,
    pendingDeleteProviderId,
    modelsDevData,
    modelSearchQuery,
    providerSearchQuery,
    testing,
    testResult,
    models,
    fetchingModels,
    fetchError,

    // Derived
    selectedProvider,
    allProviders,
    filteredProviders,
    isProviderDraftValid,
    devModels,
    paramSupport,

    // Setters
    setSelectedProviderId,
    setShowProviderSelect,
    setProviderDraft,
    setPendingDeleteProviderId,
    setModelSearchQuery,
    setProviderSearchQuery,
    setModels,
    setFetchError,
    setTestResult,

    // Actions
    openCreateProvider,
    selectProviderAndCreate,
    selectModelsDevProvider,
    closeConnectionEditor,
    selectProvider,
    saveProviderDraft,
    updateProviderField,
    updateProviderModelParam,
    toggleProviderActive,
    deleteProvider,
    handleTestConnection,
    handleFetchModels,

    // Save helpers (exposed for parent to reuse)
    saveSettingsNow,
    saveSettingsDebounced
  }
}
