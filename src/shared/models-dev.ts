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

let memoryCache: ModelsDevData | null = null

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
  if (memoryCache && !forceRefresh) return memoryCache

  if (!forceRefresh) {
    const cached = await readCache()
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      memoryCache = cached.data
      return cached.data
    }
  }

  try {
    const response = await fetch(MODELS_DEV_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as ModelsDevData
    memoryCache = data
    void writeCache(data)
    return data
  } catch {
    // Fall back to stale cache
    const cached = await readCache()
    if (cached) {
      memoryCache = cached.data
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
  temperature: boolean
  topP: boolean
  presencePenalty: boolean
  frequencyPenalty: boolean
}

export function getModelParamSupport(
  data: ModelsDevData,
  providerId: string,
  modelId: string
): ModelParamSupport {
  const model = getModelMeta(data, providerId, modelId)
  if (!model) {
    return { maxTokens: true, temperature: true, topP: true, presencePenalty: true, frequencyPenalty: true }
  }

  const isReasoningModel = model.reasoning === true
  const isEmbeddingModel = modelId.toLowerCase().includes("embed")
  const temperatureSupported = model.temperature !== false

  if (isEmbeddingModel) {
    return { maxTokens: false, temperature: false, topP: false, presencePenalty: false, frequencyPenalty: false }
  }

  if (isReasoningModel) {
    return { maxTokens: true, temperature: false, topP: false, presencePenalty: false, frequencyPenalty: false }
  }

  return {
    maxTokens: true,
    temperature: temperatureSupported,
    topP: temperatureSupported,
    presencePenalty: temperatureSupported,
    frequencyPenalty: temperatureSupported
  }
}
