/**
 * 服务端元信息（`GET /v1/meta`，契约 §4.3）。
 *
 * 三个用途，都只读不写：
 * 1. `plans` 驱动 Options 的套餐表——**价格与额度数值只来自服务端**，客户端不硬编码
 *    （仓库是公开的，任何写进代码的价目表都等于把定价策略公开）；
 * 2. `min_client_version` → 低于门槛时提示升级；
 * 3. `maintenance` → 维护公告。
 *
 * 缓存三条铁律与 `entitlements.ts` 相同：**只缓存成功**、失败返回 `null` 且不写缓存、
 * 并发合并成一次上游请求。缓存只放内存（SW 休眠后多打一次请求是正确代价）。
 */
import { META_TTL_MS } from "@/shared/auth/config"
import { apiJson } from "@/shared/auth/request"
import type { BillingInterval, PlanOffer, ServerMeta } from "@/shared/auth/types"
import { PLAN_RANK, isPlanId } from "@/shared/auth/types"

let cache: { value: ServerMeta; at: number } | null = null
let inflight: Promise<ServerMeta | null> | null = null

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * 解析套餐表条目。
 *
 * 三条规则都有明确理由：
 * - **未知 `id` 丢弃**：`PlanId` 是客户端的封闭枚举，服务端上一个新档位时老客户端不认识，
 *   画出来只会是一个「没有文案的档位」（`t()` 会把键名原文渲染到界面上）。
 * - **`price <= 0` 丢弃**：0 价档是免费额度，不是商品；把它排进套餐表会得到一个「可以点击购买的 0 元档」。
 * - **缺 `currency` 丢弃**：没有货币单位的数字无法展示（宁可少一行，不要显示 `29`）。
 * - **有价却没有周期也丢弃**：契约 §4.3 里 `interval: null` 只对应免费档（已被 `price <= 0` 挡掉），
 *   真出现「有价 + 无周期」说明我们看不懂这个商品——不猜它的周期，也不让用户点进一个
 *   按当前切换的周期提交错误的结算会话。
 */
function parsePlanOffer(raw: unknown): PlanOffer | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (!isPlanId(record.id)) return null

  const price = num(record.price)
  const currency = str(record.currency)
  if (price === undefined || price <= 0 || !currency) return null

  const interval: BillingInterval | null =
    record.interval === "month" || record.interval === "year" ? record.interval : null
  if (!interval) return null

  return {
    id: record.id,
    price,
    currency,
    interval,
    quotaTokens: num(record.quota_tokens) ?? 0
  }
}

/** 解析 `/v1/meta`（契约 §10：取需要的字段 + 缺省值，缺字段不抛错） */
export function parseMeta(raw: unknown): ServerMeta | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>

  const maintenanceRaw = (record.maintenance ?? {}) as Record<string, unknown>
  const plansRaw = Array.isArray(record.plans) ? record.plans : []

  return {
    // 空串 = 服务端没设门槛（不比较），不是「版本 0」
    minClientVersion: str(record.min_client_version) ?? "",
    maintenance: {
      active: maintenanceRaw.active === true,
      message: str(maintenanceRaw.message) ?? null
    },
    plans: plansRaw
      .map(parsePlanOffer)
      .filter((offer): offer is PlanOffer => offer !== null)
      // 展示顺序恒按权益高低（服务端顺序不稳定时界面不会跳）
      .sort((a, b) => PLAN_RANK[a.id] - PLAN_RANK[b.id]),
    fetchedAt: Date.now()
  }
}

async function fetchMeta(): Promise<ServerMeta | null> {
  try {
    // `/v1/meta` 无需认证（契约 §4.3）：`auth: false` 让它不带 Authorization，
    // 也不会在未登录时因取不到凭据而抛 NO_SESSION
    const raw = await apiJson<unknown>("/v1/meta", { auth: false })
    const parsed = parseMeta(raw)
    if (!parsed) return null
    cache = { value: parsed, at: Date.now() }
    return parsed
  } catch {
    // 失败**不写缓存**：一次 500 不能把套餐表锁死一整个 TTL
    return null
  }
}

/** 取服务端 meta（`force` 越过 TTL；返回 `null` 表示这次没拿到） */
export async function getServerMeta(options: { force?: boolean } = {}): Promise<ServerMeta | null> {
  if (!options.force && cache && Date.now() - cache.at < META_TTL_MS) return cache.value
  if (inflight) return inflight

  inflight = fetchMeta().finally(() => {
    inflight = null
  })
  return inflight
}

/** 供单测与「版本 / 维护状态要重查」处调用 */
export function clearMetaCache(): void {
  cache = null
}

/**
 * 语义化版本比较：`a < b` 返回 -1，相等 0，`a > b` 返回 1。
 *
 * **无法比较时返回 `null`**（而不是猜一个方向）：`"0.7.0-beta"` / `"latest"` 这类值
 * 不该被当成「比 0.7.0 小」——把一个错误的版本判成过旧，用户会看到一条永远消不掉的升级提示。
 * 只取每段的**数字前缀**（`3-beta` → `3`），缺失段按 0 补齐（`1.2` === `1.2.0`）。
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (value: string): number[] | null => {
    const parts = value.trim().split(".")
    if (parts.length === 0) return null
    const numbers: number[] = []
    for (const part of parts) {
      const match = /^(\d+)/.exec(part.trim())
      if (!match) return null
      numbers.push(Number(match[1]))
    }
    return numbers
  }

  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return null

  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const l = left[index] ?? 0
    const r = right[index] ?? 0
    if (l !== r) return l < r ? -1 : 1
  }
  return 0
}

/**
 * 客户端是否低于服务端门槛。
 *
 * 比较不出来（缺字段 / 版本串不合规）一律 `false`：**未知按可用处理**。
 * 让一条无法验证的升级提示挡住所有人，比放过几个老版本危险得多。
 */
export function isClientOutdated(meta: ServerMeta | null, currentVersion: string): boolean {
  if (!meta || !meta.minClientVersion || !currentVersion) return false
  const order = compareVersions(currentVersion, meta.minClientVersion)
  return order !== null && order < 0
}

/** 维护中（未知 / 拉取失败都按「未维护」，同样遵循「未知按可用处理」） */
export function isMaintenanceActive(meta: ServerMeta | null): boolean {
  return meta?.maintenance.active === true
}
