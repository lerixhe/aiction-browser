import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebouncedCallback } from "use-debounce"

import { DEFAULT_CUSTOM_MODEL_PROVIDER } from "@/shared/defaults"
import { saveSettings } from "@/shared/storage"
import { trackEvent } from "@/shared/analytics"
import {
  requestModelsDev,
  getModelsForProvider,
  getAllProviders,
  getModelParamSupport,
  ALL_PARAMS_UNKNOWN,
  type ModelsDevData,
  type ModelsDevProviderInfo,
  type ModelParamSupport
} from "@/shared/models-dev"
import { requestOpenRouterModels, findOpenRouterModel } from "@/shared/openrouter"
import { resolveProviderNpm } from "@/shared/model-params"
import { MESSAGE_TYPES } from "@/shared/constants"
import type {
  ExtensionSettings,
  ProviderConfig,
  ModelParams,
  ApiTestResponse,
  FetchModelsResponse,
  OpenRouterModelInfo
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
  const [smartFilling, setSmartFilling] = useState(false)
  const [smartFillStatus, setSmartFillStatus] = useState<{ count: number; notice?: string | null } | null>(null)

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
    void trackEvent("provider_created", { provider_type: "custom", provider_count: settings.providers.length + 1 })
  }, [saveSettingsNow, settings.providers.length])

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
      void trackEvent("provider_created", { provider_type: "models_dev", provider_name: providerInfo.name, provider_count: settings.providers.length + 1 })
    },
    [saveSettingsNow, settings.providers.length]
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

  /** 模型参数与模型绑定：切换/修改模型时清空已填充参数 */
  const updateProviderModel = useCallback(
    (model: string) => {
      if (!selectedProviderId) return

      setProviderDraft((current) => ({ ...current, model, modelParams: {} }))

      saveSettingsDebounced((current) => ({
        ...current,
        providers: current.providers.map((provider) =>
          provider.id === selectedProviderId
            ? { ...provider, model, modelParams: {} }
            : provider
        )
      }))
    },
    [selectedProviderId, saveSettingsDebounced]
  )

  const updateProviderModelParam = useCallback(
    (key: keyof ModelParams, value: ModelParams[keyof ModelParams]) => {
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
      const fromProviderId = settings.activeProviderId
      const fromProvider = settings.providers.find((p) => p.id === fromProviderId)
      const toProvider = settings.providers.find((p) => p.id === providerId)
      saveSettingsNow((current) => {
        if (current.activeProviderId === providerId) return current
        return { ...current, activeProviderId: providerId }
      })
      void trackEvent("provider_switched", {
        from_provider: fromProvider?.name || fromProviderId || "none",
        to_provider: toProvider?.name || providerId,
        provider_count: settings.providers.length
      })
    },
    [settings, saveSettingsNow]
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

  // --- 智能填充参数 ---
  // 数据源优先级：models.dev（有 modelsDevId 时）> OpenRouter /models
  // 只填充「未填充」的项，用户已填的永不覆盖；点击后永远提示「成功补充 X 个」(X>=0)
  //
  // 思考模式 / effort 的默认值策略（中性默认，不替用户做价值预设）：
  // - reasoning：默认**不填**（空白 = 跟随端点默认）。仅当 provider 路径存在官方
  //   「关闭思考」映射（@ai-sdk/openai / @ai-sdk/deepseek / @openrouter/ai-sdk-provider）时
  //   才自动填禁用——注意这是 provider 级判定，无法区分模型（o1 不可关、DeepSeek-R1 不可关，
  //   但 gpt-5 可关），模型级数据源缺失。
  // - reasoningEffort：仅当「明确支持调整 effort」时默认填最低档 low：
  //   ① OpenRouter 显式声明 supported_parameters 含 reasoning_effort（模型级强信号）；
  //   ② OpenAI 系 provider（@ai-sdk/openai）且模型为推理模型（models.dev 数据源）。
  //   其余保持空白： Claude thinking（budget 模式）、Gemini thinking、DeepSeek-R1
  //   等不接受 reasoning_effort 参数，盲填会直接 400。
  const handleSmartFillParams = useCallback(async () => {
    if (smartFilling) return
    setSmartFilling(true)
    setSmartFillStatus(null)

    try {
      const modelId = providerDraft.model.trim()
      if (!modelId) {
        setSmartFillStatus({ count: 0, notice: t("options.connection.smartFillNoModel") })
        return
      }

      // 1) models.dev 元数据（优先）
      const devModel = providerDraft.modelsDevId
        ? modelsDevData?.[providerDraft.modelsDevId]?.models[modelId]
        : undefined

      // 2) OpenRouter 兜底（仅当 models.dev 无该模型时请求）
      let orModel: OpenRouterModelInfo | undefined
      let sourceError: string | null = null
      if (!devModel) {
        try {
          const list = await requestOpenRouterModels()
          orModel = findOpenRouterModel(list, modelId)
        } catch (error) {
          sourceError = String((error as Error)?.message ?? error)
        }
      }

      if (!devModel && !orModel) {
        setSmartFillStatus({
          count: 0,
          notice: sourceError ?? t("options.connection.smartFillNotFound")
        })
        return
      }

      const devKeyed = devModel as (typeof devModel & { structured_output?: boolean }) | undefined
      const orParams = new Set(orModel?.supportedParameters ?? [])

      const supported = {
        maxTokens:
          typeof devKeyed?.limit?.output === "number" ||
          orParams.has("max_tokens") ||
          // 未知的模型默认可填（用户自行决定）
          (!devKeyed && !orModel),
        contextSize: true, // 输入裁剪为应用层能力，恒可用
        reasoning: devKeyed?.reasoning === true || orParams.has("reasoning")
      }

      // provider 级信号：npm 路径是否存在官方「关闭思考」映射
      const npm = resolveProviderNpm(providerDraft, modelsDevData ?? undefined)
      const explicitReasoningOff =
        npm === "@ai-sdk/openai" ||
        npm === "@ai-sdk/deepseek" ||
        npm === "@openrouter/ai-sdk-provider"
      // 强信号：明确接受 reasoning_effort 参数
      const explicitEffortAdjust =
        orParams.has("reasoning_effort") ||
        (npm === "@ai-sdk/openai" && devKeyed?.reasoning === true)

      const current = providerDraft.modelParams
      const fills: Array<[keyof ModelParams, NonNullable<ModelParams[keyof ModelParams]>]> = []

      // maxTokens：models.dev 的 limit.output 优先，OpenRouter 的 top_provider.max_completion_tokens 兑底
      const maxTokensValue =
        typeof devKeyed?.limit?.output === "number"
          ? devKeyed.limit.output
          : orModel?.maxCompletionTokens
      if (typeof maxTokensValue === "number" && maxTokensValue > 0 && current.maxTokens === undefined) {
        fills.push(["maxTokens", maxTokensValue])
      }
      if (current.contextSize === undefined) {
        const contextSize =
          typeof devKeyed?.limit?.context === "number" ? devKeyed.limit.context : orModel?.contextLength
        if (typeof contextSize === "number" && contextSize > 0) {
          fills.push(["contextSize", contextSize])
        }
      }
      // 思考模式：仅当 provider 明确支持关闭语义时自动填禁用，其余保持空白
      if (supported.reasoning && explicitReasoningOff && current.reasoning === undefined) {
        fills.push(["reasoning", false])
      }
      // reasoningEffort：明确支持调整 effort 时默认填最低档 low，其余保持空白
      if (explicitEffortAdjust && current.reasoningEffort === undefined) {
        fills.push(["reasoningEffort", "low" as const])
      }

      for (const [key, value] of fills) {
        updateProviderModelParam(key, value)
      }

      setSmartFillStatus({ count: fills.length, notice: sourceError })
    } finally {
      setSmartFilling(false)
    }
  }, [providerDraft, modelsDevData, smartFilling, updateProviderModelParam, t])

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
            setProviderDraft((current) => ({ ...current, model: response.models![0], modelParams: {} }))
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
      return ALL_PARAMS_UNKNOWN
    }
    return getModelParamSupport(modelsDevData, providerDraft.modelsDevId, providerDraft.model)
  }, [modelsDevData, providerDraft.modelsDevId, providerDraft.model])

  const modelOutputLimit = useMemo((): number | undefined => {
    if (!modelsDevData || !providerDraft.modelsDevId) return undefined
    const model = modelsDevData[providerDraft.modelsDevId]?.models[providerDraft.model]
    return model?.limit?.output
  }, [modelsDevData, providerDraft.modelsDevId, providerDraft.model])

  const modelContextLimit = useMemo((): number | undefined => {
    if (!modelsDevData || !providerDraft.modelsDevId) return undefined
    const model = modelsDevData[providerDraft.modelsDevId]?.models[providerDraft.model]
    return model?.limit?.context
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
    modelOutputLimit,
    modelContextLimit,
    smartFilling,
    smartFillStatus,

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
    updateProviderModel,
    updateProviderModelParam,
    toggleProviderActive,
    deleteProvider,
    handleTestConnection,
    handleFetchModels,
    handleSmartFillParams,

    // Save helpers (exposed for parent to reuse)
    saveSettingsNow,
    saveSettingsDebounced
  }
}
