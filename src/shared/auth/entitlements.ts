/**
 * 权益快照（SPEC §6.7 / 契约 §4.1）。
 *
 * 三条铁律（read-frog 与 selectly 的血泪，见 LOGIN_DEV_PLAN §1.3）：
 * 1. **只缓存成功**：失败结果缓存会把人锁死一整个 TTL；
 * 2. **失败返回 null 且不写缓存**，由调用方按「状态不变」处理（一次 500 不能把 pro 显示成 free）；
 * 3. **额度只用于渲染**：`quota` 不参与放行，真值永远在服务端。
 *
 * 缓存放内存（background 进程内）：MV3 的 SW 随时休眠，但权益本来就是「临时视图」，
 * 重新唤醒后多一次请求是正确代价；写进 storage 反而会留下脏数据。
 */
import { ENTITLEMENTS_TTL_MS } from "@/shared/auth/config"
import { apiJson } from "@/shared/auth/request"
import type { AuthSnapshot, Entitlements, PlanId, Subscription } from "@/shared/auth/types"
import { isPlanId } from "@/shared/auth/types"

const SUBSCRIPTION_STATUSES: readonly Subscription["status"][] = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "none"
]
const SUBSCRIPTION_PROVIDERS: readonly Subscription["provider"][] = ["stripe", "paddle", "none"]

let cache: { value: Entitlements; at: number } | null = null
let inflight: Promise<Entitlements | null> | null = null

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * 解析 `/v1/me` 响应（契约 §10：**取需要的字段 + 缺省值**，缺字段不抛错）。
 *
 * 只有三个字段缺失才判为无效响应：`principal.kind` / `principal.id` / `plan`——
 * 缺了它们快照就没法渲染，继续用默认值只会让 UI 显示错误的档位。
 */
export function parseEntitlements(raw: unknown): Entitlements | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>

  const principalRaw = record.principal
  if (!principalRaw || typeof principalRaw !== "object") return null
  const principal = principalRaw as Record<string, unknown>
  const kind = principal.kind === "user" || principal.kind === "device" ? principal.kind : undefined
  const id = str(principal.id)
  const plan: PlanId | undefined = isPlanId(record.plan) ? record.plan : undefined
  if (!kind || !id || !plan) return null

  const subscriptionRaw = (record.subscription ?? {}) as Record<string, unknown>
  const quotaRaw = (record.quota ?? {}) as Record<string, unknown>
  const featuresRaw = (record.features ?? {}) as Record<string, unknown>

  return {
    principal: {
      kind,
      id,
      ...(str(principal.email) ? { email: str(principal.email)! } : {}),
      ...(str(principal.created_at) ? { createdAt: str(principal.created_at)! } : {})
    },
    plan,
    subscription: {
      status: oneOf(subscriptionRaw.status, SUBSCRIPTION_STATUSES, "none"),
      provider: oneOf(subscriptionRaw.provider, SUBSCRIPTION_PROVIDERS, "none"),
      periodEnd: str(subscriptionRaw.period_end) ?? null,
      cancelAtPeriodEnd: subscriptionRaw.cancel_at_period_end === true,
      manageUrl: str(subscriptionRaw.manage_url) ?? null
    },
    quota: {
      unit: "tokens",
      limit: num(quotaRaw.limit) ?? 0,
      used: num(quotaRaw.used) ?? 0,
      reserved: num(quotaRaw.reserved) ?? 0,
      resetAt: str(quotaRaw.reset_at) ?? "",
      window: quotaRaw.window === "day" ? "day" : "subscription"
    },
    features: {
      models: Array.isArray(featuresRaw.models)
        ? featuresRaw.models.filter((model): model is string => typeof model === "string")
        : [],
      maxOutputTokens: num(featuresRaw.max_output_tokens) ?? 0,
      concurrency: num(featuresRaw.concurrency) ?? 0,
      contextChars: num(featuresRaw.context_chars) ?? 0
    },
    // serverTime 用于校正本地倒计时（客户端时钟可能不准）；缺失时退化成当前时间
    serverTime: str(record.server_time) ?? new Date().toISOString(),
    fetchedAt: Date.now()
  }
}

async function fetchEntitlements(): Promise<Entitlements | null> {
  try {
    const raw = await apiJson<unknown>("/v1/me")
    const parsed = parseEntitlements(raw)
    if (!parsed) return null
    cache = { value: parsed, at: Date.now() }
    return parsed
  } catch {
    // 失败**不写缓存**（不是「缓存一个 null」，而是保持上次的成功值）
    return null
  }
}

/**
 * 取权益。
 * - `force: true` 越过 TTL：402 / 登录 / 登出 / 账号页可见 / 结算页返回时调用。
 * - 并发合并成一次上游请求。
 * - 返回 `null` 表示这次没拿到（调用方应保留旧状态）。
 */
export async function getEntitlements(options: { force?: boolean } = {}): Promise<Entitlements | null> {
  if (!options.force && cache && Date.now() - cache.at < ENTITLEMENTS_TTL_MS) {
    return cache.value
  }
  if (inflight) return inflight

  inflight = fetchEntitlements().finally(() => {
    inflight = null
  })
  return inflight
}

/** 供单测与「会话变更」处调用（登录 / 登出 / token 失效） */
export function clearEntitlementsCache(): void {
  cache = null
}

/**
 * 转成可分发快照。
 * `quota` 只保留 `{ usedRatio, resetAt }`（百分比口径）——UI 不需要原始 token 数，
 * 也避免把「用了多少 token」这种运营数据散落到各处。
 */
export function entitlementsToSnapshot(
  entitlements: Entitlements
): Pick<AuthSnapshot, "plan" | "quota" | "email" | "principalKind"> {
  const { limit, used, resetAt } = entitlements.quota
  const result: Pick<AuthSnapshot, "plan" | "quota" | "email" | "principalKind"> = {
    plan: entitlements.plan,
    principalKind: entitlements.principal.kind,
    // 没有额度或没有重置时间时不画进度条（`null` 表示未知，不要当成 0%）
    quota: limit > 0 && resetAt ? { usedRatio: Math.min(1, Math.max(0, used / limit)), resetAt } : null
  }
  if (entitlements.principal.email) result.email = entitlements.principal.email
  return result
}
