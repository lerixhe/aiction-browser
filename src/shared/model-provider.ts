import type { LanguageModel } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { ModelServiceConfig, ProviderType } from "./types"
import { PROVIDERS } from "./providers"

type ProviderFactory = (config: ModelServiceConfig) => { languageModel: (modelId: string) => LanguageModel }

const FACTORIES: Record<ProviderType, ProviderFactory> = {
  openai: (c) => createOpenAI({ apiKey: c.apiKey, baseURL: c.apiBaseUrl }),
  anthropic: (c) => createAnthropic({ apiKey: c.apiKey, baseURL: c.apiBaseUrl }),
  google: (c) => createGoogleGenerativeAI({ apiKey: c.apiKey, baseURL: c.apiBaseUrl }),
  deepseek: (c) => createDeepSeek({ apiKey: c.apiKey }),
  openrouter: (c) => createOpenRouter({ apiKey: c.apiKey }),
  "openai-compatible": (c) => createOpenAICompatible({ name: c.name || "custom", apiKey: c.apiKey, baseURL: c.apiBaseUrl! }),
} as const

const PROVIDER_HEADERS: Partial<Record<ProviderType, Record<string, string>>> = {
  anthropic: { "anthropic-dangerous-direct-browser-access": "true" },
}

export function resolveLanguageModel(service: ModelServiceConfig) {
  const factory = FACTORIES[service.provider]
  if (!factory) throw new Error(`Unknown provider: ${service.provider}`)
  const provider = factory(service)
  return provider.languageModel(service.model)
}

export function getProviderHeaders(provider: ProviderType): Record<string, string> | undefined {
  return PROVIDER_HEADERS[provider]
}

export function getProviderFallbackModels(service: ModelServiceConfig): string[] {
  return PROVIDERS[service.provider]?.fallbackModels ?? []
}
