import { MESSAGE_TYPES } from "@/shared/constants"
import type { OpenRouterModelInfo, OpenRouterModelsRequest, OpenRouterModelsResponse } from "@/shared/types"

/**
 * OpenRouter 模型列表数据源（智能填充参数用，无需 API Key）。
 * 与 models.dev 相同的缓存策略：chrome.storage.local + 24h TTL，失败时回落到过期缓存。
 */

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
const CACHE_KEY = "aiction:openrouter-cache-v2"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CachedModels {
  timestamp: number
  models: OpenRouterModelInfo[]
}

async function readCache(): Promise<CachedModels | null> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY)
    const cached = result[CACHE_KEY] as CachedModels | undefined
    if (cached && typeof cached.timestamp === "number" && Array.isArray(cached.models)) {
      return cached
    }
  } catch {
    // Extension context may have been invalidated
  }
  return null
}

async function writeCache(models: OpenRouterModelInfo[]): Promise<void> {
  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: { timestamp: Date.now(), models } satisfies CachedModels,
    })
  } catch {
    // Extension context may have been invalidated
  }
}

/** 仅在 background 环境调用（跨域请求）。失败回落到过期缓存，最终返回 []。 */
export async function fetchOpenRouterModels(forceRefresh = false): Promise<OpenRouterModelInfo[]> {
  if (!forceRefresh) {
    const cached = await readCache()
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.models
    }
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json()) as { data?: unknown }

    const rawList: unknown[] = Array.isArray((body as { data?: unknown[] }).data)
      ? (body as { data: unknown[] }).data
      : []

    const models = rawList
      .filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string")
      .map((item) => {
        const topProvider =
          item.top_provider && typeof item.top_provider === "object"
            ? (item.top_provider as Record<string, unknown>)
            : undefined
        return {
          id: String(item.id),
          name: typeof item.name === "string" ? item.name : String(item.id),
          contextLength: typeof item.context_length === "number" && Number.isFinite(item.context_length)
            ? item.context_length
            : undefined,
          maxCompletionTokens:
            typeof topProvider?.max_completion_tokens === "number" && Number.isFinite(topProvider.max_completion_tokens)
              ? topProvider.max_completion_tokens
              : undefined,
          supportedParameters: Array.isArray(item.supported_parameters)
            ? item.supported_parameters.filter((p): p is string => typeof p === "string")
            : []
        } satisfies OpenRouterModelInfo
      })

    if (models.length === 0) throw new Error("empty model list")

    void writeCache(models)
    return models
  } catch {
    // Fall back to stale cache
    const cached = await readCache()
    return cached?.models ?? []
  }
}

/**
 * 按模型 ID 匹配 OpenRouter 模型：
 * 1. 精确匹配完整 ID（如 openai/gpt-4o）
 * 2. 后缀匹配：用户填 "gpt-4o" → 匹配 "openai/gpt-4o"
 * 3. 匹配失败返回 undefined（不报错，由调用方提示 0 个）
 */
export function findOpenRouterModel(
  models: OpenRouterModelInfo[],
  modelId: string
): OpenRouterModelInfo | undefined {
  const needle = modelId.trim().toLowerCase()
  if (!needle) return undefined

  const exact = models.find((m) => m.id.toLowerCase() === needle)
  if (exact) return exact

  return models.find((m) => m.id.toLowerCase().endsWith(`/${needle}`))
}

/** Options 页面入口：经 background 获取 OpenRouter 模型列表 */
export function requestOpenRouterModels(): Promise<OpenRouterModelInfo[]> {
  const request: OpenRouterModelsRequest = {
    type: MESSAGE_TYPES.OPENROUTER_MODELS_REQUEST
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: OpenRouterModelsResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      if (response?.success && response.models) {
        resolve(response.models)
      } else {
        reject(new Error(response?.error || "Failed to fetch OpenRouter models"))
      }
    })
  })
}
