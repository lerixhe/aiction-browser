/**
 * 官方模型白名单的**I/O 部分**（`GET /v1/models`，契约 §5.1）。纯逻辑在 `official-model.ts`。
 *
 * 为什么必须从服务端拿：`id` 是**对外模型名**（`aiction-fast`），上游真实模型名留在服务端映射表
 * （便于随时换供应商 / 降成本）。客户端写死一份名单的结果是——服务端换模型要发扩展版本，
 * 而用户手里那个版本会一直请求一个已经不存在的模型（403 `model_not_allowed`）。
 *
 * 三层缓存，各有各的理由：
 * 1. **内存 24h**（契约 §8）：同一次 SW 生命周期内的重复读；
 * 2. **`storage.local` 24h**：M3 起**请求路径**（`resolveEngine`）也要读这份列表，而 MV3 的 SW
 *    空闲 30s 就被回收 —— 只放内存的话，几乎每条「本次生命周期内的第一条官方对话」都要先阻塞
 *    一次 `/v1/models` 才发出请求。落盘后 SW 唤醒是零网络读取；
 * 3. **失败退避 60s**：列表拿不到时不能让每次对话都先打一次失败请求（首字节白拖慢 + 网关多一次 5xx）。
 *
 * 过期时用 **stale-while-revalidate**：先返回落盘的旧值（24h 内的陈旧度本来就是 TTL 允许的），
 * 同时后台刷新。否则「TTL 刚过」又变回阻塞首字节。
 */
import { OFFICIAL_MODELS_TTL_MS } from "@/shared/auth/config"
import { parseOfficialModels } from "@/shared/auth/official-model"
import { apiJson } from "@/shared/auth/request"
import type { OfficialModel } from "@/shared/auth/types"
import { AUTH_STORAGE_KEYS } from "@/shared/auth/types"

/** 失败后的退避时长（不是 TTL：TTL 描述「成功的值能复用多久」） */
const FAILURE_BACKOFF_MS = 60_000

let cache: { value: OfficialModel[]; at: number } | null = null
let inflight: Promise<OfficialModel[] | null> | null = null
let retryAfter = 0

function isFresh(at: number): boolean {
  return Date.now() - at < OFFICIAL_MODELS_TTL_MS
}

/**
 * 读落盘的那份。
 *
 * 存的是**服务端原始 `data` 数组**而不是解析后的对象：读取时重新走一遍 `parseOfficialModels`，
 * 这样「存档结构变了 / 被人改坏了」与「服务端返回了奇怪的东西」走同一条校验路径，
 * 不需要维护两套反序列化。
 */
async function readStoredModels(): Promise<{ value: OfficialModel[]; at: number } | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null
  try {
    const stored = await chrome.storage.local.get(AUTH_STORAGE_KEYS.officialModels)
    const raw = stored?.[AUTH_STORAGE_KEYS.officialModels] as { at?: unknown; data?: unknown } | undefined
    if (!raw || typeof raw.at !== "number" || !Array.isArray(raw.data)) return null
    const parsed = parseOfficialModels({ data: raw.data })
    return parsed ? { value: parsed, at: raw.at } : null
  } catch {
    // 读失败就当没有：一次 storage 异常不该让官方对话用不了
    return null
  }
}

async function writeStoredModels(data: unknown, at: number): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return
  try {
    await chrome.storage.local.set({ [AUTH_STORAGE_KEYS.officialModels]: { at, data } })
  } catch {
    // 写不进去只损失「下次冷启动快一点」，不影响功能
  }
}

async function fetchOfficialModels(): Promise<OfficialModel[] | null> {
  try {
    const raw = await apiJson<unknown>("/v1/models")
    const parsed = parseOfficialModels(raw)
    if (!parsed) {
      // 结构不对也按失败处理：拿一份「解析不出来」的列表去选模型只会选出错的
      retryAfter = Date.now() + FAILURE_BACKOFF_MS
      return null
    }
    cache = { value: parsed, at: Date.now() }
    retryAfter = 0
    const data = (raw as { data?: unknown })?.data
    if (Array.isArray(data)) void writeStoredModels(data, cache.at)
    return parsed
  } catch {
    retryAfter = Date.now() + FAILURE_BACKOFF_MS
    return null
  }
}

/** 取官方模型白名单（`force` 越过 TTL 与失败退避；`null` = 这次没拿到） */
export async function getOfficialModels(options: { force?: boolean } = {}): Promise<OfficialModel[] | null> {
  if (!options.force && cache && isFresh(cache.at)) return cache.value
  if (inflight) return inflight

  // 冷启动（内存空）：先看落盘的那份，避免每次 SW 唤醒后的第一条对话都多一次阻塞 RTT
  if (!options.force && !cache) {
    const stored = await readStoredModels()
    if (stored) {
      cache = stored
      if (isFresh(stored.at)) return stored.value
      // 过期：先用旧值顶上，后台刷新（不 await）
      void fetchOfficialModels()
      return stored.value
    }
  }

  if (!options.force && Date.now() < retryAfter) return null

  inflight = fetchOfficialModels().finally(() => {
    inflight = null
  })
  return inflight
}

export function clearOfficialModelsCache(): void {
  cache = null
  retryAfter = 0
}
