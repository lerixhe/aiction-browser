import type { LanguageModel } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { ProviderConfig } from "./types"
import type { ModelsDevData } from "./models-dev"

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: ProviderErrorCode,
    public readonly providerId?: string
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

export type ProviderErrorCode =
  | "MISSING_API_KEY"
  | "MISSING_BASE_URL"
  | "INVALID_PROVIDER_CONFIG"
  | "UNSUPPORTED_PROVIDER"
  | "UNSUPPORTED_MODEL"
  | "PROVIDER_NOT_FOUND"

type ProviderFactory = (config: { apiKey: string; baseURL?: string }) => { languageModel: (modelId: string) => LanguageModel }

const NPM_FACTORIES: Record<string, ProviderFactory> = {
  "@ai-sdk/openai": ({ apiKey, baseURL }) => createOpenAI({ apiKey, baseURL }),
  "@ai-sdk/anthropic": ({ apiKey, baseURL }) => createAnthropic({ apiKey, baseURL }),
  "@ai-sdk/google": ({ apiKey, baseURL }) => createGoogleGenerativeAI({ apiKey, baseURL }),
  "@ai-sdk/deepseek": ({ apiKey }) => createDeepSeek({ apiKey }),
  "@openrouter/ai-sdk-provider": ({ apiKey }) => createOpenRouter({ apiKey }),
}

export function resolveLanguageModel(provider: ProviderConfig, modelsDevData?: ModelsDevData) {
  if (!provider.apiKey) {
    throw new ProviderError(
      "API Key is required",
      "MISSING_API_KEY",
      provider.id
    )
  }

  if (!provider.model) {
    throw new ProviderError(
      "Model ID is required",
      "INVALID_PROVIDER_CONFIG",
      provider.id
    )
  }

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
    } else {
      throw new ProviderError(
        `Provider "${provider.modelsDevId}" not found in models.dev data`,
        "PROVIDER_NOT_FOUND",
        provider.id
      )
    }
  }

  if (!baseURL) {
    throw new ProviderError(
      "API Base URL is required. Please configure it in provider settings or use a supported provider.",
      "MISSING_BASE_URL",
      provider.id
    )
  }

  const factory = NPM_FACTORIES[npm] ?? (({ apiKey, baseURL }) => createOpenAICompatible({ name: "custom", apiKey, baseURL: baseURL! }))

  if (!factory) {
    throw new ProviderError(
      `Unsupported provider package: ${npm}`,
      "UNSUPPORTED_PROVIDER",
      provider.id
    )
  }

  try {
    const result = factory({ apiKey: provider.apiKey, baseURL })
    return result.languageModel(provider.model)
  } catch (error) {
    throw new ProviderError(
      `Failed to create model "${provider.model}": ${error instanceof Error ? error.message : String(error)}`,
      "UNSUPPORTED_MODEL",
      provider.id
    )
  }
}
