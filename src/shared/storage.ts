import { DEFAULT_CUSTOM_MODEL_PROVIDER, DEFAULT_SETTINGS } from "@/shared/defaults"
import type { ExtensionSettings, LanguagePreference, ModelParams, ProviderConfig, QuickAction, QuickActionType, ThemePreference, UserIconData } from "@/shared/types"

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
        template: String(record.template),
        enabled: typeof record.enabled === "boolean" ? record.enabled : true,
        icon: typeof record.icon === "string" ? record.icon : undefined
      }
    })
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

function validateModelParams(value: unknown): ModelParams {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  return {
    maxTokens: typeof record.maxTokens === "number" && Number.isFinite(record.maxTokens) ? record.maxTokens : DEFAULT_CUSTOM_MODEL_PROVIDER.modelParams.maxTokens,
    temperature: typeof record.temperature === "number" && Number.isFinite(record.temperature) ? record.temperature : DEFAULT_CUSTOM_MODEL_PROVIDER.modelParams.temperature,
    topP: typeof record.topP === "number" && Number.isFinite(record.topP) ? record.topP : DEFAULT_CUSTOM_MODEL_PROVIDER.modelParams.topP,
    presencePenalty:
      typeof record.presencePenalty === "number" && Number.isFinite(record.presencePenalty)
        ? record.presencePenalty
        : DEFAULT_CUSTOM_MODEL_PROVIDER.modelParams.presencePenalty,
    frequencyPenalty:
      typeof record.frequencyPenalty === "number" && Number.isFinite(record.frequencyPenalty)
        ? record.frequencyPenalty
        : DEFAULT_CUSTOM_MODEL_PROVIDER.modelParams.frequencyPenalty
  }
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

  const actions = Array.isArray(saved.actions)
    ? validateActions(saved.actions)
    : Array.isArray(saved.customActions)
      ? validateActions(saved.customActions)
      : DEFAULT_SETTINGS.actions

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

  const validLanguages: LanguagePreference[] = ["system", "en", "zh_CN"]
  const language = validLanguages.includes(saved.language as LanguagePreference) ? (saved.language as LanguagePreference) : DEFAULT_SETTINGS.language

  return {
    providers,
    activeProviderId,
    theme,
    language,
    actions,
    quickActions,
    telemetryEnabled
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
