/**
 * 官方模型的**纯逻辑**（契约 §5.1）：解析白名单、按档位过滤、选出生效模型。
 *
 * 为什么要与 `models.ts` 分开：这份逻辑既被 background（要 I/O）用，也被
 * `provider-resolve.ts` 的 `resolveEngine()` 用，而后者在 Options / Popup 的依赖链上。
 * 放在同一个模块里会让「取模型列表」那点 I/O（`request.ts` → 取 token 的代码路径）
 * 跟着进 UI bundle。纯逻辑单独成模块，两个世界都能引，也不破坏 `check-auth-boundary` 的口径。
 *
 * 无 I/O、无存储、无 chrome API：本文件只做「给定数据，算出结论」。
 */
import type { OfficialModel, PlanId } from "@/shared/auth/types"
import { PLAN_RANK, isPlanId, meetsPlan } from "@/shared/auth/types"

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

/** 当前档位可用的模型（`min_plan` 高于当前 plan 的不显示，避免「选了就 403」） */
export function modelsForPlan(models: OfficialModel[], plan: PlanId): OfficialModel[] {
  return models.filter((model) => meetsPlan(plan, model.minPlan))
}

/**
 * 解析当前应该用的官方模型：
 * 1. 用户显式选择的（`preferred`）**且**当前档位可用 → 用它；
 * 2. 否则服务端 `recommended` 且可用的；
 * 3. 否则第一个可用的；
 * 4. 一个都没有 → `null`（调用方回退到 `DEFAULT_OFFICIAL_MODEL`）。
 *
 * ⚠️ 这个函数的返回值必须**同时**用于「界面显示」与「真实请求」。
 * M3 初版只把它给了界面，请求路径仍然取 `settings.officialModel || DEFAULT_OFFICIAL_MODEL`，
 * 于是「设置页显示 aiction-fast、请求发 aiction-pro」→ 降档后每次对话 403 —— 正是
 * `AGENTS.md` 不变量 10 说的「显示与实际两套」。现在两条路都走 `resolveEngine()`。
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
