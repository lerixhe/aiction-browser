import type { ProviderType } from "./types"

export interface ProviderMeta {
  id: ProviderType
  name: string
  icon: string
  defaultBaseUrl: string
  requiresBaseUrl: boolean
  website: string
  fallbackModels: string[]
}

export const PROVIDERS: Record<ProviderType, ProviderMeta> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    icon: "simple-icons:openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresBaseUrl: false,
    website: "https://platform.openai.com",
    fallbackModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    icon: "simple-icons:anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresBaseUrl: false,
    website: "https://console.anthropic.com",
    fallbackModels: ["claude-sonnet-4-20250514", "claude-haiku-4-20250514", "claude-opus-4-20250514"],
  },
  google: {
    id: "google",
    name: "Google",
    icon: "simple-icons:google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresBaseUrl: false,
    website: "https://aistudio.google.com",
    fallbackModels: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    icon: "simple-icons:deepseek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    requiresBaseUrl: false,
    website: "https://platform.deepseek.com",
    fallbackModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    icon: "simple-icons:openrouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresBaseUrl: false,
    website: "https://openrouter.ai",
    fallbackModels: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4-20250514", "google/gemini-2.0-flash"],
  },
  "openai-compatible": {
    id: "openai-compatible",
    name: "Custom",
    icon: "tabler:plug-connected",
    defaultBaseUrl: "",
    requiresBaseUrl: true,
    website: "",
    fallbackModels: [],
  },
}

export const PROVIDER_LIST = Object.values(PROVIDERS)

export function getProvider(id: ProviderType): ProviderMeta {
  return PROVIDERS[id]
}

export function getDefaultBaseUrl(id: ProviderType): string | undefined {
  const url = PROVIDERS[id].defaultBaseUrl
  return url || undefined
}
