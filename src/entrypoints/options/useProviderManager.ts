import { useCallback, useEffect, useMemo, useState } from "react"

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
import { providerTypeOf } from "@/shared/provider-type"
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
import { useDraftItemMap } from "./hooks/draft"

export function createProviderDraft(): ProviderConfig {
  return {
    id: `provider-${Date.now()}`,
    name: "",
    apiKey: "",
    model: "",
    modelParams: DEFAULT_CUSTOM_MODEL_PROVIDER.modelParams
  }
}

function isProviderValid(provider: ProviderConfig): boolean {
  return (
    Boolean(provider.name.trim()) &&
    Boolean(provider.apiKey.trim()) &&
    Boolean(provider.model.trim()) &&
    (Boolean(provider.modelsDevId) || Boolean(provider.apiBaseUrl?.trim()))
  )
}

/**
 * API 提供商管理（docs/OPTIONS_UI.md §3）：
 * - 即时项：启用开关、新增 / 删除提供商（直接改 settings）；
 * - 草稿项：显示名称、API Key、Model、接口地址、模型参数（含下拉）；
 *   草稿按提供商 id 保留在内存里，切换提供商不清空，只有保存 / 放弃 / 卸载才丢弃。
 */
export function useProviderManager(
  settings: ExtensionSettings,
  setSettings: React.Dispatch<React.SetStateAction<ExtensionSettings>>
) {
  const { t } = useI18n()

  // --- State ---
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [showProviderSelect, setShowProviderSelect] = useState(false)
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

  // --- 草稿（按提供商 id 保留） ---
  const drafts = useDraftItemMap<ProviderConfig>(settings.providers, (a, b) =>
    a.id === b.id &&
    a.name === b.name &&
    a.apiKey === b.apiKey &&
    a.model === b.model &&
    a.modelsDevId === b.modelsDevId &&
    (a.apiBaseUrl ?? "") === (b.apiBaseUrl ?? "") &&
    // modelParams 是浅拷贝链的产物、键顺序稳定；逐字段比较避免全字段 JSON 比较被键顺序污染
    JSON.stringify(a.modelParams ?? {}) === JSON.stringify(b.modelParams ?? {})
  )

  // --- Load models.dev data ---
  useEffect(() => {
    void requestModelsDev().then(setModelsDevData)
  }, [])

  // --- Derived state ---
  const selectedProvider = selectedProviderId
    ? settings.providers.find((item) => item.id === selectedProviderId)
    : null

  const providerDraft = (selectedProviderId ? drafts.getEffective(selectedProviderId) : null) ?? createProviderDraft()
  const providerDirty = selectedProviderId ? drafts.isDirty(selectedProviderId) : false
  const providerJustSaved = drafts.justSavedId === selectedProviderId

  const allProviders = useMemo(() => {
    if (!modelsDevData) return []
    return getAllProviders(modelsDevData)
  }, [modelsDevData])

  const filteredProviders = useMemo(() => {
    if (!providerSearchQuery.trim()) return allProviders
    const query = providerSearchQuery.trim().toLowerCase()
    return allProviders.filter(
      (provider) => provider.name.toLowerCase().includes(query) || provider.id.toLowerCase().includes(query)
    )
  }, [allProviders, providerSearchQuery])

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

  // --- Provider CRUD（即时项：新增 / 删除） ---
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
    setShowProviderSelect(false)
    setModels([])
    setFetchError(null)
    setTestResult(null)
    setModelSearchQuery("")
    setProviderSearchQuery("")
    void trackEvent("provider_created", {
      provider_type: "custom",
      provider_count: settings.providers.length + 1,
      source: "options"
    })
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
      setShowProviderSelect(false)
      setModels([])
      setFetchError(null)
      setTestResult(null)
      setModelSearchQuery("")
      setProviderSearchQuery("")
      void trackEvent("provider_created", {
        provider_type: "models_dev",
        models_dev_id: providerInfo.id,
        provider_count: settings.providers.length + 1,
        source: "options"
      })
    },
    [saveSettingsNow, settings.providers.length]
  )

  const selectProvider = useCallback((provider: ProviderConfig) => {
    // 草稿按 id 保留，切换时不做任何丢弃
    setSelectedProviderId(provider.id)
    setModels([])
    setFetchError(null)
    setTestResult(null)
    setModelSearchQuery("")
  }, [])

  const saveProviderDraft = useCallback(() => {
    if (!selectedProviderId) return
    const current = drafts.getEffective(selectedProviderId)
    if (!current || !isProviderValid(current)) return

    const normalized: ProviderConfig = {
      ...current,
      name: current.name.trim(),
      apiBaseUrl: current.apiBaseUrl?.trim() || undefined,
      apiKey: current.apiKey.trim(),
      model: current.model.trim()
    }

    saveSettingsNow((settingsNow) => ({
      ...settingsNow,
      providers: settingsNow.providers.map((provider) =>
        provider.id === selectedProviderId ? normalized : provider
      )
    }))
    drafts.markSaved(selectedProviderId)
  }, [selectedProviderId, drafts, saveSettingsNow])

  const discardProviderDraft = useCallback(() => {
    if (selectedProviderId) {
      drafts.discard(selectedProviderId)
    }
  }, [selectedProviderId, drafts])

  // --- 草稿字段更新 ---
  const updateProviderField = useCallback(
    (field: string, value: string) => {
      if (!selectedProviderId) return
      drafts.update(selectedProviderId, (current) => ({ ...current, [field]: value }))
    },
    [selectedProviderId, drafts]
  )

  /** 模型参数与模型绑定：切换/修改模型时清空已填充参数 */
  const updateProviderModel = useCallback(
    (model: string) => {
      if (!selectedProviderId) return
      drafts.update(selectedProviderId, (current) => ({ ...current, model, modelParams: {} }))
    },
    [selectedProviderId, drafts]
  )

  const updateProviderModelParam = useCallback(
    (key: keyof ModelParams, value: ModelParams[keyof ModelParams]) => {
      if (!selectedProviderId) return
      drafts.update(selectedProviderId, (current) => ({
        ...current,
        modelParams: { ...current.modelParams, [key]: value }
      }))
    },
    [selectedProviderId, drafts]
  )

  const toggleProviderActive = useCallback(
    (providerId: string) => {
      const fromProviderId = settings.activeProviderId
      const fromProvider = settings.providers.find((provider) => provider.id === fromProviderId)
      const toProvider = settings.providers.find((provider) => provider.id === providerId)
      saveSettingsNow((current) => {
        if (current.activeProviderId === providerId) return current
        return { ...current, activeProviderId: providerId }
      })
      void trackEvent("provider_switched", {
        // 不再上报展示名（自定义 provider 名可能是用户填写的文本）
        from_provider_type: providerTypeOf(fromProvider),
        to_provider_type: providerTypeOf(toProvider),
        ...(toProvider?.modelsDevId ? { to_models_dev_id: toProvider.modelsDevId } : {}),
        provider_count: settings.providers.length,
        source: "options"
      })
    },
    [settings, saveSettingsNow]
  )

  const deleteProvider = useCallback(
    (providerId: string) => {
      drafts.discard(providerId)
      saveSettingsNow((current) => {
        const remainingProviders = current.providers.filter((provider) => provider.id !== providerId)
        const activeProviderId =
          current.activeProviderId === providerId ? remainingProviders[0]?.id ?? "" : current.activeProviderId
        return { ...current, providers: remainingProviders, activeProviderId }
      })

      const remaining = settings.providers.filter((provider) => provider.id !== providerId)
      setSelectedProviderId(remaining.length > 0 ? remaining[0].id : null)
      setPendingDeleteProviderId(null)
    },
    [settings.providers, saveSettingsNow, drafts]
  )

  // --- 智能填充参数 ---
  // 数据源优先级：models.dev（有 modelsDevId 时）> OpenRouter /models
  // 只填充「未填充」的项，用户已填的永不覆盖；点击后永远提示「成功补充 X 个」(X>=0)
  //
  // 思考模式 / effort 的默认值策略（中性默认，不替用户做价值预设）：
  // - reasoning：默认**不填**（空白 = 跟随端点默认），见原注释；
  // - reasoningEffort：仅当「明确支持调整 effort」时默认填最低档 low。
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
        npm === "@ai-sdk/openai" || npm === "@ai-sdk/deepseek" || npm === "@openrouter/ai-sdk-provider"
      // 强信号：明确接受 reasoning_effort 参数
      const explicitEffortAdjust =
        orParams.has("reasoning_effort") || (npm === "@ai-sdk/openai" && devKeyed?.reasoning === true)

      const current = providerDraft.modelParams
      const fills: Array<[keyof ModelParams, NonNullable<ModelParams[keyof ModelParams]>]> = []

      // 上限类参数（maxTokens / contextSize）**刻意不自动填**，只做 UI 提示：
      // 数据源里的 limit.output / limit.context 是「某个 provider 副本」的元数据，不是模型的固有属性——
      // 同一个模型在不同 provider 上差异极大（如 deepseek-v4.1-flash 在 models.dev 里
      // 同时存在 131072 / 262144 / 384000 / 393216 / 943718 多档，取哪一档取决于匹配到哪个副本），
      // 而匹配到的副本未必等于用户实际用的端点。照搬填进 maxTokens 就是拿别人的上限顶本端点的硬上限，
      // 必然 400（"max_tokens (current value: 943718) must be between 0 and 393216"）；
      // 填 contextSize 同理会按错误的窗口静默裁剪输入。
      // 两项留空 = 跟随端点默认 / 不裁剪，语义清晰（模型是否推理、是否支持 effort 档位）的项才自动填。
      //
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
          modelsDevId: providerDraft.modelsDevId,
          // 带上草稿参数：测试走真实链路，maxTokens / reasoning 配错应当场暴露
          modelParams: providerDraft.modelParams
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
        // 端点的 warnings（参数被忽略 / 不支持）无论成败都展示：这是「能连但表现不对」的直接线索
        const warningSuffix =
          response.warnings && response.warnings.length > 0
            ? ` · ${t("options.connection.testWarnings", [response.warnings.join(" | ")])}`
            : ""
        const latencyInfo = response.latencyMs != null ? ` (${response.latencyMs}ms)` : ""
        if (response.success) {
          setTestResult({
            success: true,
            message: `${t("options.connection.connectionSuccess", [latencyInfo])}${warningSuffix}`
          })
        } else {
          setTestResult({
            success: false,
            message: `${response.error ?? t("options.connection.testFailed")}${warningSuffix}`
          })
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
            updateProviderModel(response.models[0])
          }
        } else {
          setFetchError(response.error ?? t("options.connection.fetchModelsError"))
        }
      }
    )
  }, [providerDraft, updateProviderModel, t])

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
    isProviderDraftValid: isProviderValid(providerDraft),
    devModels,
    paramSupport,
    modelOutputLimit,
    modelContextLimit,
    smartFilling,
    smartFillStatus,
    providerDirty,
    providerJustSaved,
    dirtyProviderIds: drafts.dirtyIds,

    // Setters
    setSelectedProviderId,
    setShowProviderSelect,
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
    selectProvider,
    saveProviderDraft,
    discardProviderDraft,
    updateProviderField,
    updateProviderModel,
    updateProviderModelParam,
    toggleProviderActive,
    deleteProvider,
    handleTestConnection,
    handleFetchModels,
    handleSmartFillParams,

    // Save helpers (exposed for parent to reuse)
    saveSettingsNow
  }
}
