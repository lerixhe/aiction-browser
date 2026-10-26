/**
 * 结算与客户门户（契约 §7.1 / §7.2）。
 *
 * 三条边界（都不是风格问题）：
 *
 * 1. **扩展内不做支付**：本模块只创建结算会话拿一个 URL，页面由 background 用
 *    `chrome.tabs.create` 打开。卡号永远不进扩展（PCI + 商店政策双向限制）。
 * 2. **URL 不回给调用方**：`CHECKOUT_REQUEST` 的响应里没有 `url`（见 `CheckoutResponse`）。
 *    这个通道对任意页面可达，带上 URL 就等于给内容脚本一个「任意地址打开器」。
 * 3. **`Idempotency-Key` 必填**（契约 §1.6）：同一 key 5 分钟内返回同一 URL。
 *    用户在按钮上点两下，不该开两个结算会话（那会真的产生两条待支付订单）。
 *
 * 轮询**不在这里**：UI 侧（Options 账号页）负责 3s × 100 次拉 `/v1/me`。
 * 理由——MV3 的 SW 空闲 30s 就会被回收，`setTimeout` 随之丢失；把「付完钱要看到额度」的
 * 定时器放在一个会被回收的进程里，是最容易写出「结算成功但界面还是旧额度」的地方。
 * background 只保证「创建 + 打开」，UI 保证「盯着结果」。
 */
import { CHECKOUT_REUSE_WINDOW_MS } from "@/shared/auth/config"
import { getEntitlements } from "@/shared/auth/entitlements"
import { AuthError } from "@/shared/auth/errors"
import { apiJson } from "@/shared/auth/request"
import type { BillingInterval, PlanId } from "@/shared/auth/types"

/** 可作为商品购买的档位（`anonymous` 是设备主体、`free` 是 0 价档，都不是商品） */
export const PURCHASABLE_PLANS: readonly PlanId[] = ["pro", "max"]

export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"]

export function isPurchasablePlan(value: unknown): value is PlanId {
  return typeof value === "string" && (PURCHASABLE_PLANS as readonly string[]).includes(value)
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === "string" && (BILLING_INTERVALS as readonly string[]).includes(value)
}

export interface CheckoutInput {
  plan: PlanId
  interval: BillingInterval
}

interface CachedSession {
  key: string
  plan: PlanId
  interval: BillingInterval
  url: string
  at: number
}

let cachedSession: CachedSession | null = null

/** 供单测清空幂等窗口 */
export function resetCheckoutCache(): void {
  cachedSession = null
}

function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // 极老的环境没有 randomUUID：退回随机 hex。幂等键只需要「本次点击唯一」，
    // 不是安全凭据，但也不能用 Math.random 拼——两次点击撞键会让第二单拿回第一单的 URL。
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  }
}

/**
 * 结算 URL 的安全校验。
 *
 * 只放 http(s)：`javascript:` / `data:` 一旦落到 `chrome.tabs.create` 就是「点一下执行代码」。
 * **生产只认 `https:`**：本机 mock 的假结算页是 `http://127.0.0.1:8787`，所以 dev 构建放行 http，
 * 线上包一律不许。这条分支写死在这里而不是交给调用方，免得哪天有人为了本地方便把它整个放开。
 *
 * `allowHttp` 只给单测/显式调用用；默认按构建期 DEV 常量判定。
 */
export function isSafeCheckoutUrl(raw: string, options: { allowHttp?: boolean } = {}): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol === "https:") return true
    const allowHttp = options.allowHttp ?? import.meta.env?.DEV === true
    return allowHttp && url.protocol === "http:"
  } catch {
    return false
  }
}

/**
 * 创建结算会话，返回要打开的地址。
 *
 * 命中 5 分钟幂等窗口（同 plan + interval）时直接复用上一次的 URL：
 * 服务端本来就对同 key 返回同一 URL，本地复用还能省掉一次往返。
 */
export async function createCheckoutSession(input: CheckoutInput): Promise<string> {
  const now = Date.now()
  if (
    cachedSession &&
    cachedSession.plan === input.plan &&
    cachedSession.interval === input.interval &&
    now - cachedSession.at < CHECKOUT_REUSE_WINDOW_MS
  ) {
    return cachedSession.url
  }

  const key = newIdempotencyKey()
  const raw = await apiJson<{ url?: unknown }>("/v1/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ plan: input.plan, interval: input.interval })
  })

  const url = typeof raw?.url === "string" ? raw.url.trim() : ""
  if (!url || !isSafeCheckoutUrl(url)) {
    // 服务端给了空地址 / 非法协议：当作服务端错误暴露出来，不要「点了没反应」
    throw new AuthError("SERVER_ERROR", "结算会话没有返回可打开的地址")
  }

  cachedSession = { key, plan: input.plan, interval: input.interval, url, at: now }
  return url
}

/**
 * 客户门户地址（改卡 / 取消 / 发票）。
 *
 * `/v1/me.subscription.manage_url` 有值就直接用（契约 §7.2：有值可跳过本接口），
 * 否则 `POST /v1/billing/portal` 换一个。两条路都失败才抛错。
 */
export async function getBillingPortalUrl(): Promise<string> {
  const entitlements = await getEntitlements()
  const manageUrl = entitlements?.subscription.manageUrl?.trim()
  if (manageUrl && isSafeCheckoutUrl(manageUrl)) return manageUrl

  const raw = await apiJson<{ url?: unknown }>("/v1/billing/portal", { method: "POST" })
  const url = typeof raw?.url === "string" ? raw.url.trim() : ""
  if (!url || !isSafeCheckoutUrl(url)) {
    throw new AuthError("SERVER_ERROR", "客户门户没有返回可打开的地址")
  }
  return url
}

/** 客户门户页面 / 结算成功页不需要客户端拼，但测试需要拿到它们的字段形状 → 只导类型 */
export type { BillingInterval, PlanId }
