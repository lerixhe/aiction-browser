import { MESSAGE_TYPES } from "@/shared/constants"
import type { ModelsDevRequest, ModelsDevResponse } from "@/shared/types"

const MODELS_DEV_URL = "https://models.dev/api.json"
const CACHE_KEY = "aiction:models-dev-cache"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface ModelsDevModel {
  id: string
  name: string
  reasoning?: boolean
  tool_call?: boolean
  attachment?: boolean
  temperature?: boolean
  structured_output?: boolean
  limit?: { context?: number; input?: number; output?: number }
  cost?: { input?: number; output?: number; reasoning?: number }
  status?: string
}

export interface ModelsDevProvider {
  id: string
  name: string
  api?: string
  npm?: string
  env?: string[]
  models: Record<string, ModelsDevModel>
}

export type ModelsDevData = Record<string, ModelsDevProvider>

interface CachedData {
  timestamp: number
  data: ModelsDevData
}

async function readCache(): Promise<CachedData | null> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY)
    const cached = result[CACHE_KEY] as CachedData | undefined
    if (cached && typeof cached.timestamp === "number" && cached.data) {
      return cached
    }
  } catch {
    // Extension context may have been invalidated
  }
  return null
}

async function writeCache(data: ModelsDevData): Promise<void> {
  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: { timestamp: Date.now(), data } satisfies CachedData,
    })
  } catch {
    // Extension context may have been invalidated
  }
}

export async function fetchModelsDev(forceRefresh = false): Promise<ModelsDevData> {
  if (!forceRefresh) {
    const cached = await readCache()
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data
    }
  }

  try {
    const response = await fetch(MODELS_DEV_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as ModelsDevData
    void writeCache(data)
    return data
  } catch {
    // Fall back to stale cache
    const cached = await readCache()
    if (cached) {
      return cached.data
    }
    return {}
  }
}

export function getModelsForProvider(
  data: ModelsDevData,
  providerId: string
): ModelsDevModel[] {
  const entry = data[providerId]
  if (!entry) return []
  return Object.values(entry.models).filter(
    (m) => m.status !== "deprecated"
  )
}

export function getModelMeta(
  data: ModelsDevData,
  providerId: string,
  modelId: string
): ModelsDevModel | undefined {
  return data[providerId]?.models[modelId]
}

export function getProviderEnv(data: ModelsDevData, providerId: string): string[] {
  return data[providerId]?.env ?? []
}

export interface ModelsDevProviderInfo {
  id: string
  name: string
  api: string
  env: string[]
  modelCount: number
}

export function getAllProviders(data: ModelsDevData): ModelsDevProviderInfo[] {
  return Object.values(data)
    .filter((p) => p.api && Object.keys(p.models).length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      api: p.api!,
      env: p.env ?? [],
      modelCount: Object.values(p.models).filter((m) => m.status !== "deprecated").length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface ModelParamSupport {
  maxTokens: boolean
  contextSize: boolean
  reasoning: boolean
  reasoningEffort: boolean
  structuredOutputs: boolean
}

export const ALL_PARAMS_UNSUPPORTED: ModelParamSupport = {
  maxTokens: false,
  contextSize: false,
  reasoning: false,
  reasoningEffort: false,
  structuredOutputs: false
}

export const ALL_PARAMS_UNKNOWN: ModelParamSupport = {
  maxTokens: true,
  contextSize: true,
  reasoning: true,
  reasoningEffort: true,
  structuredOutputs: true
}

/**
 * 模型参数支持性判定（数据源：models.dev）。
 * - 模型元数据未知 → 视为全部支持（让用户自行决定）
 * - 嵌入模型 → 全部不支持
 * - contextSize 恒为 true（输入裁剪与应用层实现，不依赖模型能力）
 */
export function getModelParamSupport(
  data: ModelsDevData,
  providerId: string,
  modelId: string
): ModelParamSupport {
  const model = getModelMeta(data, providerId, modelId)
  if (!model) {
    return ALL_PARAMS_UNKNOWN
  }

  const isEmbeddingModel = modelId.toLowerCase().includes("embed")

  if (isEmbeddingModel) {
    return ALL_PARAMS_UNSUPPORTED
  }

  const isReasoningModel = model.reasoning === true

  return {
    maxTokens: true,
    contextSize: true,
    reasoning: isReasoningModel,
    reasoningEffort: isReasoningModel,
    structuredOutputs: model.structured_output === true
  }
}

export async function requestModelsDev(): Promise<ModelsDevData> {
  const request: ModelsDevRequest = {
    type: MESSAGE_TYPES.MODELS_DEV_REQUEST
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: ModelsDevResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      if (response?.success && response.data) {
        resolve(response.data as ModelsDevData)
      } else {
        reject(new Error(response?.error || "Failed to fetch models.dev data"))
      }
    })
  })
}
