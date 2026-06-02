import { DEFAULT_CUSTOM_MODEL_SERVICE, DEFAULT_SETTINGS } from "@/shared/defaults"
import { PROVIDERS } from "@/shared/providers"
import type { ExtensionSettings, LanguagePreference, ModelParams, ModelServiceConfig, ProviderType, ThemePreference, UserIconData } from "@/shared/types"

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

function validateModelParams(value: unknown): ModelParams {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  return {
    maxTokens: typeof record.maxTokens === "number" && Number.isFinite(record.maxTokens) ? record.maxTokens : DEFAULT_CUSTOM_MODEL_SERVICE.modelParams.maxTokens,
    temperature: typeof record.temperature === "number" && Number.isFinite(record.temperature) ? record.temperature : DEFAULT_CUSTOM_MODEL_SERVICE.modelParams.temperature,
    topP: typeof record.topP === "number" && Number.isFinite(record.topP) ? record.topP : DEFAULT_CUSTOM_MODEL_SERVICE.modelParams.topP,
    presencePenalty:
      typeof record.presencePenalty === "number" && Number.isFinite(record.presencePenalty)
        ? record.presencePenalty
        : DEFAULT_CUSTOM_MODEL_SERVICE.modelParams.presencePenalty,
    frequencyPenalty:
      typeof record.frequencyPenalty === "number" && Number.isFinite(record.frequencyPenalty)
        ? record.frequencyPenalty
        : DEFAULT_CUSTOM_MODEL_SERVICE.modelParams.frequencyPenalty
  }
}

const VALID_PROVIDERS: ProviderType[] = ["openai", "anthropic", "google", "deepseek", "openrouter", "openai-compatible"]

function validateProvider(value: unknown, oldValue?: unknown): ProviderType {
  if (typeof value === "string" && VALID_PROVIDERS.includes(value as ProviderType)) {
    return value as ProviderType
  }
  // Migration: old type → new provider
  if (oldValue === "official-premium" || oldValue === "official-free") return "openai"
  if (oldValue === "custom") return "openai-compatible"
  return "openai-compatible"
}

function validateModelServices(items: unknown[]): ModelServiceConfig[] {
  return items
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const record = item as Record<string, unknown>
      const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `service-${Date.now()}-${index}`
      const provider = validateProvider(record.provider, record.type)
      const meta = PROVIDERS[provider]

      return {
        id,
        provider,
        name: typeof record.name === "string" ? record.name : DEFAULT_CUSTOM_MODEL_SERVICE.name,
        apiKey: typeof record.apiKey === "string" ? record.apiKey : DEFAULT_CUSTOM_MODEL_SERVICE.apiKey,
        model: typeof record.model === "string" ? record.model : DEFAULT_CUSTOM_MODEL_SERVICE.model,
        apiBaseUrl: typeof record.apiBaseUrl === "string"
          ? record.apiBaseUrl
          : meta.defaultBaseUrl || undefined,
        modelParams: validateModelParams(record.modelParams),
        icon: typeof record.icon === "string" ? record.icon : undefined,
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

  const modelServices = Array.isArray(saved.modelServices) ? validateModelServices(saved.modelServices) : DEFAULT_SETTINGS.modelServices
  const activeModelServiceId =
    typeof saved.activeModelServiceId === "string" && modelServices.some((service) => service.id === saved.activeModelServiceId)
      ? saved.activeModelServiceId
      : modelServices[0]?.id ?? DEFAULT_SETTINGS.activeModelServiceId

  const telemetryEnabled = typeof saved.telemetryEnabled === "boolean" ? saved.telemetryEnabled : DEFAULT_SETTINGS.telemetryEnabled

  const validLanguages: LanguagePreference[] = ["system", "en", "zh_CN"]
  const language = validLanguages.includes(saved.language as LanguagePreference) ? (saved.language as LanguagePreference) : DEFAULT_SETTINGS.language

  return {
    modelServices,
    activeModelServiceId,
    theme,
    language,
    actions,
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

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  try {
    await chrome.storage.sync.set({
      [SETTINGS_KEY]: settings
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

export function getActiveModelService(settings: ExtensionSettings): ModelServiceConfig | null {
  return settings.modelServices.find((service) => service.id === settings.activeModelServiceId) ?? null
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
