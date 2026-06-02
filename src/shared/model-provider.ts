import type { LanguageModel } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { ProviderConfig } from "./types"
import type { ModelsDevData } from "./models-dev"

type ProviderFactory = (config: { apiKey: string; baseURL?: string }) => { languageModel: (modelId: string) => LanguageModel }

const NPM_FACTORIES: Record<string, ProviderFactory> = {
  "@ai-sdk/openai": ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
  "@ai-sdk/anthropic": ({ apiKey, baseURL }) => createAnthropic({ apiKey, baseURL }),
  "@ai-sdk/google": ({ apiKey, baseURL }) => createGoogleGenerativeAI({ apiKey, baseURL }),
  "@ai-sdk/deepseek": ({ apiKey, baseURL }) => createDeepSeek({ apiKey, baseURL }),
  "@openrouter/ai-sdk-provider": ({ apiKey, baseURL }) => createOpenRouter({ apiKey, baseURL }),
}

export function resolveLanguageModel(provider: ProviderConfig, modelsDevData?: ModelsDevData) {
  let baseURL = provider.apiBaseUrl
  let npm = "@ai-sdk/openai-compatible"

  if (provider.modelsDevId && modelsDevData) {
    const providerData = modelsDevData[provider.modelsDevId]
    if (providerData) {
      if (providerData.api && !baseURL) {
        baseURL = providerData.api
      }
      if (providerData.npm) {
        npm = providerData.npm
      }
    }
  }

  if (!baseURL) {
    throw new Error("API Base URL is required")
  }

  const factory = NPM_FACTORIES[npm] ?? (({ apiKey, baseURL }) => createOpenAICompatible({ name: "custom", apiKey, baseURL: baseURL! }))

  const result = factory({ apiKey: provider.apiKey, baseURL })
  return result.languageModel(provider.model)
}
