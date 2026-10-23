/**
 * 登录与权益的共享类型（`OFFICIAL_API_CONTRACT.md` §8 的客户端映射）。
 *
 * 分层约定（见 `.private-docs/LOGIN_IMPL_SPEC.md` §1「术语与不变量」）：
 * - **内核态**：凭证与会话（`AuthSession`）。只在 background 读写，凭据永不离开 background。
 * - **快照态**：`AuthSnapshot`。跨上下文分发的只读视图，**禁止出现任何 token 字段**
 *   （含 `access` / `refresh` / `token` 字样，单测会断言键集）。
 *
 * ⚠️ 本文件必须保持「纯类型 + 纯常量」：
 * content script 与 pdf-viewer 允许 import 本文件（边界白名单见 `scripts/check-auth-boundary.ts`），
 * 一旦这里出现 I/O 或读取存储的实现，白名单就变成漏洞。
 */

// ── 服务端下发的枚举 ─────────────────────────────────────────────

/** 套餐档位。`anonymous` 是未登录的设备主体，不是付费档。 */
export type PlanId = "anonymous" | "free" | "pro" | "max"

/** 枚举校验用（storage 解析存档时用；除了这一个校验工具，本文件不出现运行时逻辑） */
export const PLAN_IDS: readonly PlanId[] = ["anonymous", "free", "pro", "max"]

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value)
}

// ── 存储 key（唯一真源，`storage.ts` 与 `facade.ts` 都从这里取）──────────
//
// 硬约束（SPEC §4.1）：`chrome.storage.sync` 里**不得出现**任何这些 key。
// 凭据会跨设备同步的路径一律不开；auth 也不进 `aiction:settings`。
export const AUTH_STORAGE_KEYS = {
  /** storage.local：refresh token + 身份（长期） */
  persisted: "aiction:auth",
  /** storage.session：access token（短期；session 不可用时降级落 local 同一 key） */
  access: "aiction:auth.session",
  /** storage.local：跨上下文只读快照（首帧用，无 token） */
  snapshot: "aiction:authSnapshot",
  /** storage.local：PKCE 挂起态，一次性，取回即删 */
  pending: "aiction:authPending",
  /** storage.local：匿名设备 token */
  deviceToken: "aiction:auth.deviceToken"
} as const

/** 主体类型：登录用户 vs 匿名设备（device token）。 */
export type PrincipalKind = "user" | "device"

export interface Principal {
  kind: PrincipalKind
  id: string
  /** 服务端已打码的邮箱，如 `u***@example.com`；UI 直接展示，**不要再加工** */
  email?: string
  createdAt?: string
}

export interface Quota {
  unit: "tokens"
  limit: number
  used: number
  reserved: number
  /** ISO 时间串：本周期额度重置时刻 */
  resetAt: string
  /** 额度窗口口径：订阅周期 或 自然日 */
  window: "subscription" | "day"
}

export interface Subscription {
  status: "active" | "trialing" | "past_due" | "canceled" | "expired" | "none"
  provider: "stripe" | "paddle" | "none"
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  /** 客户门户链接（催缴与升级是两件事，见 actions.ts）。M1 不请求，M3 接 */
  manageUrl: string | null
}

/** `GET /v1/me` 的响应 + 本地缓存时间。`quota` 只用于渲染，**不参与放行**（额度真值在服务端）。 */
export interface Entitlements {
  principal: Principal
  plan: PlanId
  subscription: Subscription
  quota: Quota
  features: {
    models: string[]
    maxOutputTokens: number
    concurrency: number
    contextChars: number
  }
  /** 服务端时间（ISO），用于校正本地倒计时，避免客户端时钟漂移 */
  serverTime: string
  /** 本地写入缓存的时间（epoch ms），非服务端字段 */
  fetchedAt: number
}

/** 契约 §2.1 的错误码全集。客户端**只认这个枚举**，不解析 message 文本。 */
export type ApiErrorCode =
  | "invalid_request"
  | "token_expired"
  | "token_invalid"
  | "token_wrong_client"
  | "refresh_revoked"
  | "refresh_race"
  | "quota_exceeded"
  | "subscription_required"
  | "subscription_expired"
  | "model_not_allowed"
  | "no_model"
  | "context_too_long"
  | "rate_limited"
  | "concurrency_exceeded"
  | "internal"
  | "upstream_error"
  | "maintenance"

// ── 本地状态 ───────────────────────────────────────────────────

/**
 * 持久层（`storage.local` 的 `aiction:auth`）：SW 休眠后必须还能读到的东西。
 * 只存后续请求必需的最小字段，**不存任何 UI 展示用数据**。
 */
export interface PersistedAuth {
  userId: string
  plan: PlanId
  refreshToken: string
}

/**
 * 短期层（`storage.session` 的 `aiction:auth.session`）：access token。
 * 放 session 是因为它默认 access level = TRUSTED_CONTEXTS，content script **技术上**读不到，
 * 而 `storage.local` 的隔离只能靠代码纪律（见 `storage.ts` 的分层注释）。
 */
export interface AccessCredential {
  accessToken: string
  /** epoch ms */
  accessTokenExpiresAt: number
  userId: string
  plan: PlanId
}

/** 两层拼起来的完整会话（内存视图）。缺任一层都视为无会话。 */
export interface AuthSession extends PersistedAuth {
  accessToken: string
  accessTokenExpiresAt: number
}

/** 登录挂起态：PKCE verifier + state，**一次性**，取回即删。 */
export interface PendingAuth {
  state: string
  verifier: string
  createdAt: number
}

export type AuthState = "signed-out" | "anonymous" | "signed-in"

/**
 * 跨上下文分发的只读快照。**禁止出现 token 字段**（任何含 `token` / `access` / `refresh` 的键都不许加）。
 *
 * `state === "signed-out"` 时 `plan` 固定为 `"anonymous"`：UI 一律按 `state` 判断登录与否，
 * **不要用 `plan` 反推登录态**（`plan` 只表达权益档位）。
 */
export interface AuthSnapshot {
  state: AuthState
  principalKind?: PrincipalKind
  /** 已打码的邮箱 */
  email?: string
  plan: PlanId
  /** 只给 UI 画进度条；`null` = 还没拿到（渲染成未知，不要当成 0%） */
  quota?: { usedRatio: number; resetAt: string } | null
  /** 官方服务当前模型名（M1 只展示，M2 才真正用它发请求） */
  officialModel?: string
  /** 快照生成时间（epoch ms），用于订阅端去重 */
  updatedAt: number
}

// ── 内部错误码（走调用栈，不走流式事件）──────────────────────────

/**
 * 与 `ChatErrorCode` **刻意分开**：
 * `ChatErrorCode` 描述「一次聊天请求为什么失败」（走 stream 事件、进埋点）；
 * `AuthErrorCode` 描述「会话内核自己出了什么状况」（走调用栈、决定是否登出）。
 * 混用会让「刷新被撤销」和「模型返回 401」被归到同一个桶里。
 */
export type AuthErrorCode =
  | "NO_SESSION"
  | "REFRESH_REVOKED"
  | "NETWORK"
  | "STATE_MISMATCH"
  | "CANCELLED"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "QUOTA_EXCEEDED"
  /**
   * 登录**能力**不可用（`identity` 权限缺失、`OFFICIAL_AUTH_ENABLED` 关闭、非 Chrome 环境）。
   *
   * 与 `SERVER_ERROR` 分开是刻意的：功能开关关掉 / 权限被拒 / 浏览器不支持都是「本端做不到」，
   * 不是服务端出错。混在一起的话，回滚登录入口那天会得到一张全是“服务端错误”的漏斗图，
   * 分不清是自己关了开关还是后端挂了。
   */
  | "NOT_AVAILABLE"

/**
 * 登录结果。
 *
 * `cancelled` 是**正常路径**（用户关窗 / 拒绝）：UI 不弹错、不复位成失败态。
 * 但它**会记一条 `auth_sign_in_failed{reason: "window_closed"}`**——放弃也是漏斗信号，
 * 只是不进错误监控（见 `session.ts` 的 `fail()` 与 `docs/ANALYTICS.md` §2.9）。
 */
export type SignInResult =
  | { status: "signed-in" }
  | { status: "cancelled" }
  | { status: "failed"; code: AuthErrorCode }

// ── 快照解析（纯函数，无 I/O，content 也可用）──────────────────

/**
 * 把存储 / 消息里拿到的任意值解成 `AuthSnapshot`；结构不对一律 `null`（由调用方回退到 signed-out）。
 *
 * 放在 types.ts 而不是 storage.ts：快照是**唯一允许进 content 的 auth 数据**，
 * 解析逻辑必须与「禁止 content import storage」的边界规则共存。
 */
export function parseAuthSnapshot(raw: unknown): AuthSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const state = record.state
  if (state !== "signed-out" && state !== "anonymous" && state !== "signed-in") return null
  if (!isPlanId(record.plan)) return null
  if (typeof record.updatedAt !== "number" || !Number.isFinite(record.updatedAt)) return null

  const snapshot: AuthSnapshot = { state, plan: record.plan, updatedAt: record.updatedAt }

  if (record.principalKind === "user" || record.principalKind === "device") {
    snapshot.principalKind = record.principalKind
  }
  if (typeof record.email === "string" && record.email) snapshot.email = record.email
  if (typeof record.officialModel === "string" && record.officialModel) snapshot.officialModel = record.officialModel

  const quota = record.quota
  if (quota && typeof quota === "object") {
    const q = quota as Record<string, unknown>
    if (typeof q.usedRatio === "number" && Number.isFinite(q.usedRatio) && typeof q.resetAt === "string" && q.resetAt) {
      snapshot.quota = { usedRatio: q.usedRatio, resetAt: q.resetAt }
    }
  } else if (quota === null) {
    snapshot.quota = null
  }

  return snapshot
}

// ── 消息协议（SPEC §7）──────────────────────────────

/**
 * 跨上下文消息的响应形状（空域一律 `chrome.runtime.sendMessage`）。
 * 响应里**禁止出现任何 token 字段**（含 `access` / `refresh` / `token` 字样）。
 */
export interface AuthSignInResponse {
  success: boolean
  /** `failed` 时 `success` 为 false，并带 `code` 说明原因 */
  status?: "signed-in" | "cancelled" | "failed"
  code?: AuthErrorCode
  error?: string
}

export interface AuthSignOutResponse {
  success: boolean
  error?: string
}

export interface AuthStateResponse {
  success: boolean
  snapshot?: AuthSnapshot
  error?: string
}

export interface EntitlementsResponse {
  success: boolean
  /** `null` = 本次没拿到（调用方应保留旧状态，不要当成「没有权益」） */
  entitlements?: Entitlements | null
  error?: string
}

export interface OpenOptionsResponse {
  success: boolean
  error?: string
}

/** `OPEN_WEB_PAGE`：只回成功与否，不回实际打开的地址（客户端无需知道完整 URL） */
export type OpenWebPageResponse = OpenOptionsResponse
