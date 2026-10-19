import { DEFAULT_ACTIONS, DEFAULT_CUSTOM_MODEL_PROVIDER, DEFAULT_SETTINGS, DEFAULT_TTS_SETTINGS } from "@/shared/defaults"
import { migrateLegacyActionTemplate } from "@/shared/prompt"
import type { ActionTemplate, ExtensionSettings, LanguagePreference, ModelParams, ProviderConfig, QuickAction, QuickActionType, ThemePreference, TtsProvider, TtsSettings, UserIconData } from "@/shared/types"

export { DEFAULT_SETTINGS }

const SETTINGS_KEY = "aiction:settings"
const USER_ICONS_KEY = "aiction:icons"

function validateActions(items: unknown[]): ExtensionSettings["actions"] {
  return items
    .filter((item) => Boolean((item as Record<string, unknown>)?.id) && Boolean((item as Record<string, unknown>)?.label) && Boolean((item as Record<string, unknown>)?.template))
    .map((item) => {
      const record = item as Record<string, unknown>
      return {
        id: String(record.id),
        label: String(record.label),
        // 旧模板中的 {text} 占位符自动迁移为 {selection}
        template: migrateLegacyActionTemplate(String(record.template)),
        enabled: typeof record.enabled === "boolean" ? record.enabled : true,
        icon: typeof record.icon === "string" ? record.icon : undefined
      }
    })
}

/**
 * 内置动作的历史默认值指纹表（仅用于老用户升级）。
 * 字段值仍等于「当前默认」或「任一历史默认」时，视为用户未自定义该字段，可升级为新默认；
 * 否则一律保留用户值——避免改版覆盖用户自己改过的 label / template。
 * 每次替换内置动作的默认 label / template，都要把被替换掉的旧值追加到这里。
 * 注意：存储里的旧模板已由 migrateLegacyActionTemplate 把 {text} 迁移为 {selection}，
 * 所以这里的指纹统一按 {selection} 形式书写。
 */
const LEGACY_BUILTIN_DEFAULTS: Record<string, Array<Partial<Pick<ActionTemplate, "label" | "template">>>> = {
  explain: [{ label: "解释", template: "帮我解释选中内容「{selection}」" }],
  translate: [{ label: "翻译", template: "请将以下内容翻译为简体中文：\n{selection}" }]
}

/**
 * 内置动作内容升级：label 与 template 各自独立判定（用户只改了其中一项时，另一项仍可升级）。
 * 非内置 id（自定义动作）原样返回。
 */
function upgradeBuiltinAction(action: ActionTemplate): ActionTemplate {
  const current = DEFAULT_ACTIONS.find((item) => item.id === action.id)
  if (!current) return action

  const history = LEGACY_BUILTIN_DEFAULTS[action.id] ?? []
  const isUntouchedDefault = (value: string, field: "label" | "template") =>
    value === current[field] || history.some((entry) => entry[field] === value)

  return {
    ...action,
    label: isUntouchedDefault(action.label, "label") ? current.label : action.label,
    template: isUntouchedDefault(action.template, "template") ? current.template : action.template
  }
}

const VALID_QUICK_ACTION_TYPES: QuickActionType[] = ["copyToClipboard", "speakText"]

function validateQuickActions(items: unknown[]): QuickAction[] {
  return items
    .filter((item) => {
      const record = item as Record<string, unknown>
      return typeof record.id === "string" && typeof record.type === "string" && VALID_QUICK_ACTION_TYPES.includes(record.type as QuickActionType)
    })
    .map((item) => {
      const record = item as Record<string, unknown>
      return {
        id: String(record.id),
        type: record.type as QuickActionType,
        icon: typeof record.icon === "string" ? record.icon : "",
        enabled: typeof record.enabled === "boolean" ? record.enabled : true
      }
    })
}

const VALID_TTS_PROVIDERS: TtsProvider[] = ["system", "edge"]

function normalizeTts(value: unknown): TtsSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  // 逐字段合并默认值：新增配置项时旧用户也能拿到默认值
  return {
    provider: VALID_TTS_PROVIDERS.includes(record.provider as TtsProvider)
      ? (record.provider as TtsProvider)
      : DEFAULT_TTS_SETTINGS.provider,
    edgeVoice:
      typeof record.edgeVoice === "string" && record.edgeVoice.trim()
        ? record.edgeVoice.trim()
        : DEFAULT_TTS_SETTINGS.edgeVoice,
    rate:
      typeof record.rate === "number" && Number.isFinite(record.rate) && record.rate >= 0.5 && record.rate <= 2
        ? record.rate
        : DEFAULT_TTS_SETTINGS.rate,
    autoLocale: typeof record.autoLocale === "boolean" ? record.autoLocale : DEFAULT_TTS_SETTINGS.autoLocale
  }
}

function validateModelParams(value: unknown): ModelParams {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  // 一次性迁移：只丢弃旧版参数键（temperature/topP/presencePenalty/frequencyPenalty），
  // 新格式的已填充项全部保留——否则每次刷新都会把填充值重置
  const params: ModelParams = {}

  if (typeof record.maxTokens === "number" && Number.isFinite(record.maxTokens)) {
    params.maxTokens = record.maxTokens
  }
  if (typeof record.contextSize === "number" && Number.isFinite(record.contextSize)) {
    params.contextSize = record.contextSize
  }
  if (typeof record.reasoning === "boolean") {
    params.reasoning = record.reasoning
  }
  if (
    record.reasoningEffort === "low" ||
    record.reasoningEffort === "medium" ||
    record.reasoningEffort === "high"
  ) {
    params.reasoningEffort = record.reasoningEffort
  }
  if (typeof record.structuredOutputs === "boolean") {
    params.structuredOutputs = record.structuredOutputs
  }

  return params
}

function validateProviders(items: unknown[]): ProviderConfig[] {
  return items
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const record = item as Record<string, unknown>
      const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `service-${Date.now()}-${index}`

      return {
        id,
        name: typeof record.name === "string" ? record.name : DEFAULT_CUSTOM_MODEL_PROVIDER.name,
        apiKey: typeof record.apiKey === "string" ? record.apiKey : DEFAULT_CUSTOM_MODEL_PROVIDER.apiKey,
        model: typeof record.model === "string" ? record.model : DEFAULT_CUSTOM_MODEL_PROVIDER.model,
        apiBaseUrl: typeof record.apiBaseUrl === "string" ? record.apiBaseUrl : undefined,
        modelParams: validateModelParams(record.modelParams),
        modelsDevId: typeof record.modelsDevId === "string" ? record.modelsDevId : undefined
      }
    })
}

export function normalizeSettings(value: unknown): ExtensionSettings {
  const saved = value as Partial<ExtensionSettings> & { customActions?: unknown[] } | undefined

  if (!saved || typeof saved !== "object") {
    return DEFAULT_SETTINGS
  }

  const validThemes: ThemePreference[] = ["auto", "light", "dark"]
  const theme = validThemes.includes(saved.theme as ThemePreference) ? (saved.theme as ThemePreference) : DEFAULT_SETTINGS.theme

  const actions = (
    Array.isArray(saved.actions)
      ? validateActions(saved.actions)
      : Array.isArray(saved.customActions)
        ? validateActions(saved.customActions)
        : DEFAULT_SETTINGS.actions
  ).map(upgradeBuiltinAction)

  const quickActions = (() => {
    const savedActions = Array.isArray(saved.quickActions)
      ? validateQuickActions(saved.quickActions)
      : DEFAULT_SETTINGS.quickActions

    const savedIds = new Set(savedActions.map((a) => a.id))
    const missingDefaults = DEFAULT_SETTINGS.quickActions.filter((a) => !savedIds.has(a.id))

    return [...savedActions, ...missingDefaults]
  })()

  const providers = Array.isArray(saved.providers) ? validateProviders(saved.providers) : DEFAULT_SETTINGS.providers
  const activeProviderId =
    typeof saved.activeProviderId === "string" && providers.some((provider) => provider.id === saved.activeProviderId)
      ? saved.activeProviderId
      : providers[0]?.id ?? DEFAULT_SETTINGS.activeProviderId

  const telemetryEnabled = typeof saved.telemetryEnabled === "boolean" ? saved.telemetryEnabled : DEFAULT_SETTINGS.telemetryEnabled

  const tts = normalizeTts(saved.tts)

  // 合并默认值：旧用户存储无 systemPrompt 字段时也能拿到默认模板
  const systemPrompt = typeof saved.systemPrompt === "string" ? saved.systemPrompt : DEFAULT_SETTINGS.systemPrompt

  const validLanguages: LanguagePreference[] = ["system", "en", "zh_CN"]
  const language = validLanguages.includes(saved.language as LanguagePreference) ? (saved.language as LanguagePreference) : DEFAULT_SETTINGS.language

  return {
    providers,
    activeProviderId,
    theme,
    language,
    actions,
    quickActions,
    tts,
    telemetryEnabled,
    systemPrompt
  }
}

export async function getSettings(): Promise<ExtensionSettings> {
  let result: Record<string, unknown>
  try {
    result = await chrome.storage.sync.get(SETTINGS_KEY)
  } catch {
    return DEFAULT_SETTINGS
  }

  const saved = result[SETTINGS_KEY] as Partial<ExtensionSettings> & { customActions?: unknown[] } | undefined

  if (!saved) {
    return DEFAULT_SETTINGS
  }

  return normalizeSettings(saved)
}

const THEME_CACHE_KEY = "aiction:theme"

export function trimProviders(providers: ProviderConfig[]): ProviderConfig[] {
  return providers.map((provider) => ({
    ...provider,
    name: provider.name.trim(),
    apiBaseUrl: provider.apiBaseUrl?.trim() || undefined,
    apiKey: provider.apiKey.trim(),
    model: provider.model.trim()
  }))
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  try {
    await chrome.storage.sync.set({
      [SETTINGS_KEY]: {
        ...settings,
        providers: trimProviders(settings.providers)
      }
    })
    localStorage.setItem(THEME_CACHE_KEY, settings.theme)
  } catch {
    // Extension context may have been invalidated
  }
}

export function getThemeFromCache(): "auto" | "light" | "dark" {
  const value = localStorage.getItem(THEME_CACHE_KEY)
  if (value === "light" || value === "dark" || value === "auto") return value
  return "auto"
}

export function getActiveProvider(settings: ExtensionSettings): ProviderConfig | null {
  return settings.providers.find((provider) => provider.id === settings.activeProviderId) ?? null
}

// User icon functions
export async function getUserIcons(): Promise<Record<string, UserIconData>> {
  try {
    const result = await chrome.storage.sync.get(USER_ICONS_KEY)
    const icons = result[USER_ICONS_KEY]
    if (icons && typeof icons === "object") {
      return icons as Record<string, UserIconData>
    }
  } catch {
    // Extension context may have been invalidated
  }
  return {}
}

export async function saveUserIcon(iconName: string, data: UserIconData): Promise<void> {
  try {
    const icons = await getUserIcons()
    icons[iconName] = data
    await chrome.storage.sync.set({ [USER_ICONS_KEY]: icons })
  } catch {
    // Extension context may have been invalidated
  }
}

export async function loadAndRegisterUserIcons(): Promise<void> {
  const { addIcon } = await import("@iconify/react")
  const icons = await getUserIcons()
  for (const [name, data] of Object.entries(icons)) {
    addIcon(name, { body: data.body, width: data.width ?? 24, height: data.height ?? 24 })
  }
}
