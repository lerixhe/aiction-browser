/**
 * 官方模型白名单（`GET /v1/models`，契约 §5.1）。
 *
 * 为什么必须从服务端拿：`id` 是**对外模型名**（`aiction-fast`），上游真实模型名留在服务端映射表
 * （便于随时换供应商 / 降成本）。客户端写死一份名单的结果是——服务端换模型要发扩展版本，
 * 而用户手里那个版本会一直请求一个已经不存在的模型（403 `model_not_allowed`）。
 *
 * 缓存 24h（契约 §8），失败不缓存。`supports_reasoning` 当前一律 false，客户端**不据此改参数**：
 * 官方链路的采样参数由网关按档位强制覆盖（见 M2 的 `prepareChatRequest` 取舍）。
 */
import { OFFICIAL_MODELS_TTL_MS } from "@/shared/auth/config"
import { apiJson } from "@/shared/auth/request"
import type { OfficialModel, PlanId } from "@/shared/auth/types"
import { PLAN_RANK, isPlanId, meetsPlan } from "@/shared/auth/types"

let cache: { value: OfficialModel[]; at: number } | null = null
let inflight: Promise<OfficialModel[] | null> | null = null

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function parseModel(raw: unknown): OfficialModel | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const id = str(record.id)
  if (!id) return null
  // 未知档位按 `free` 处理：宁可让老客户端把它显示成「需要更高档位」而不是「谁都能用」
  const minPlan: PlanId = isPlanId(record.min_plan) ? record.min_plan : "free"

  return {
    id,
    name: str(record.name) ?? id,
    description: str(record.description) ?? "",
    minPlan,
    contextChars: num(record.context_chars),
    maxOutputTokens: num(record.max_output_tokens),
    supportsReasoning: record.supports_reasoning === true,
    recommended: record.recommended === true
  }
}

/** 解析 `/v1/models`。结构不对（不是数组）返回 `null`，空数组是合法响应 */
export function parseOfficialModels(raw: unknown): OfficialModel[] | null {
  if (!raw || typeof raw !== "object") return null
  const data = (raw as Record<string, unknown>).data
  if (!Array.isArray(data)) return null

  return data
    .map(parseModel)
    .filter((model): model is OfficialModel => model !== null)
    .sort((a, b) => PLAN_RANK[a.minPlan] - PLAN_RANK[b.minPlan])
}

async function fetchOfficialModels(): Promise<OfficialModel[] | null> {
  try {
    const raw = await apiJson<unknown>("/v1/models")
    const parsed = parseOfficialModels(raw)
    if (!parsed) return null
    cache = { value: parsed, at: Date.now() }
    return parsed
  } catch {
    return null
  }
}

/** 取官方模型白名单（`force` 越过 24h TTL；`null` = 这次没拿到） */
export async function getOfficialModels(options: { force?: boolean } = {}): Promise<OfficialModel[] | null> {
  if (!options.force && cache && Date.now() - cache.at < OFFICIAL_MODELS_TTL_MS) return cache.value
  if (inflight) return inflight

  inflight = fetchOfficialModels().finally(() => {
    inflight = null
  })
  return inflight
}

export function clearOfficialModelsCache(): void {
  cache = null
}

/** 当前档位可用的模型（`min_plan` 高于当前 plan 的不显示，避免「选了就 403」） */
export function modelsForPlan(models: OfficialModel[], plan: PlanId): OfficialModel[] {
  return models.filter((model) => meetsPlan(plan, model.minPlan))
}

/**
 * 解析当前应该用的官方模型：
 * 1. 用户显式选择的（`preferred`）**且**当前档位可用 → 用它；
 * 2. 否则服务端 `recommended` 且可用的；
 * 3. 否则第一个可用的；
 * 4. 一个都没有 → `null`（调用方回退到 `DEFAULT_OFFICIAL_MODEL` 或直接报错）。
 *
 * 为什么不无条件保留用户的 `preferred`：用户降档后那个模型可能已经不在白名单里，
 * 继续用它会让每一次对话都 403 `model_not_allowed`——不如静默落到可用项，界面显示的就是真实在用的。
 */
export function resolveOfficialModel(
  models: OfficialModel[],
  plan: PlanId,
  preferred?: string
): string | null {
  const available = modelsForPlan(models, plan)
  if (available.length === 0) return null

  const chosen = preferred ? available.find((model) => model.id === preferred) : undefined
  if (chosen) return chosen.id

  const recommended = available.find((model) => model.recommended)
  return (recommended ?? available[0]).id
}
