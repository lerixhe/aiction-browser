/**
 * 官方模型白名单的**I/O 部分**（`GET /v1/models`，契约 §5.1）。纯逻辑在 `official-model.ts`。
 *
 * 为什么必须从服务端拿：`id` 是**对外模型名**（`aiction-fast`），上游真实模型名留在服务端映射表
 * （便于随时换供应商 / 降成本）。客户端写死一份名单的结果是——服务端换模型要发扩展版本，
 * 而用户手里那个版本会一直请求一个已经不存在的模型（403 `model_not_allowed`）。
 *
 * 缓存 24h（契约 §8），**失败不缓存**。
 *
 * 失败还要退避 60s：M3 起请求路径（`resolveEngine`）也会读这份列表，
 * 「列表拿不到 → 每次对话都先打一次失败请求」是不能接受的（首字节白白拖慢 + 网关多一次 5xx）。
 */
import { OFFICIAL_MODELS_TTL_MS } from "@/shared/auth/config"
import { parseOfficialModels } from "@/shared/auth/official-model"
import { apiJson } from "@/shared/auth/request"
import type { OfficialModel } from "@/shared/auth/types"

/** 失败后的退避时长（不是 TTL：TTL 描述「成功的值能复用多久」） */
const FAILURE_BACKOFF_MS = 60_000

let cache: { value: OfficialModel[]; at: number } | null = null
let inflight: Promise<OfficialModel[] | null> | null = null
let retryAfter = 0

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
    return parsed
  } catch {
    retryAfter = Date.now() + FAILURE_BACKOFF_MS
    return null
  }
}

/** 取官方模型白名单（`force` 越过 24h TTL 与失败退避；`null` = 这次没拿到） */
export async function getOfficialModels(options: { force?: boolean } = {}): Promise<OfficialModel[] | null> {
  if (!options.force && cache && Date.now() - cache.at < OFFICIAL_MODELS_TTL_MS) return cache.value
  if (inflight) return inflight
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
