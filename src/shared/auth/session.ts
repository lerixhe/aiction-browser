/**
 * 会话内核（SPEC §6.6 / §5.3）：token 生命周期、登录 / 登出、快照广播。
 *
 * 这里是整个登录功能**唯一**持有凭据的地方，四条不可破坏的约束：
 *
 * 1. **刷新单飞**：refresh token 是轮换的，并发刷新会让后到的那次 token 立刻失效 → 用户被踢下线。
 * 并发调用共享同一个 in-flight promise。
 * 2. **代际（generation）**：登出 / 被撤销时自增，让**已在路上的刷新结果作废**。
 * 没有它，一次迟到的刷新会把刚登出的会话「复活」。
 * 3. **失败分级**：只有 400/401/403 才清会话；5xx / 429 / 网络错误**保留会话**只报错
 * （Selectly 的教训：一次 500 就把人踢下线是错的）。
 * 4. **不发空凭据**：无会话就抛 `NO_SESSION`，绝不返回 `""`。
 *
 * 本模块只在 background 内使用；UI 侧走 `facade.ts` 读快照。
 */
import { getAnonymousId } from "@/shared/anonymous-id"
import { OFFICIAL_AUTH_ENABLED, PENDING_TTL_MS, PLATFORM, REFRESH_BUFFER_MS } from "@/shared/auth/config"
import { ensureDeviceToken } from "@/shared/auth/device"
import { clearEntitlementsCache, entitlementsToSnapshot, getEntitlements } from "@/shared/auth/entitlements"
import { AuthError, toAuthError } from "@/shared/auth/errors"
import { buildAuthorizeUrl, createPkce, parseCallbackUrl, randomToken } from "@/shared/auth/pkce"
import { authFetch, configureAuthRequest } from "@/shared/auth/request"
import {
  clearPending,
  clearSession,
  readAccess,
  readPending,
  readPersisted,
  readSession,
  readSnapshot,
  writePending,
  writeSession,
  writeSnapshot
} from "@/shared/auth/storage"
import type { AuthErrorCode, AuthSnapshot, PersistedAuth, PrincipalKind, SignInResult } from "@/shared/auth/types"
import { isPlanId } from "@/shared/auth/types"
import { MESSAGE_TYPES } from "@/shared/constants"
import { trackBackgroundEvent } from "@/shared/analytics"

// ── 模块级状态（background 是单实例，但会被并发唤醒）─────────────

/** 登出 / 撤销时自增：旧代的刷新结果不再写回 */
let generation = 0
/** 刷新单飞：并发调用共享同一条 promise */
let inflightRefresh: { gen: number; promise: Promise<string> } | null = null
/** 登录单飞：连点两次登录只拉起一个授权窗口 */
let inflightSignIn: Promise<SignInResult> | null = null
/** 快照缓存：避免每次读存储 */
let cachedSnapshot: AuthSnapshot | null = null
const listeners = new Set<(snapshot: AuthSnapshot) => void>()

/** 仅供单测：清掉内存态（generation / 单飞 / 快照缓存 / 监听器） */
export function resetAuthSession(): void {
  generation = 0
  inflightRefresh = null
  inflightSignIn = null
  cachedSnapshot = null
  listeners.clear()
}

// ── 小工具 ─────────────────────────────────────────────────────

/** 登录耗时分桶（`auth_sign_in_completed.duration_bucket`） */
function signInDurationBucket(durationMs: number): string {
  if (durationMs < 2000) return "<2s"
  if (durationMs < 10_000) return "2-10s"
  return ">10s"
}

/**
 * 失败归因 → 埋点枚举（SPEC §9）。
 * `CANCELLED` 也是失败事件的一种（`reason: window_closed`）：用户中途放弃同样是有用的信号，
 * 只是不该弹错、也不该进错误监控。
 */
function signInFailureReason(code: AuthErrorCode): string {
  if (code === "CANCELLED") return "window_closed"
  if (code === "STATE_MISMATCH") return "state_mismatch"
  if (code === "NETWORK") return "network"
  return "server_error"
}

function buildSignedOutSnapshot(): AuthSnapshot {
  // `updatedAt` 用真实时间：它参与订阅端去重，0 留给 facade 的兜底值（表示「从未有过快照」）
  return { state: "signed-out", plan: "anonymous", updatedAt: Date.now() }
}

function extensionId(): string {
  try {
    return typeof chrome !== "undefined" ? chrome.runtime.id : ""
  } catch {
    return ""
  }
}

function identityRedirectUrl(): string {
  try {
    return chrome.identity.getRedirectURL()
  } catch {
    return ""
  }
}

/** 登录能力自检：权限缺失 / 构建立即报错，都好过点了按钮没反应 */
function canUseIdentity(): boolean {
  if (!OFFICIAL_AUTH_ENABLED) return false
  if (typeof chrome === "undefined") return false
  try {
    return typeof chrome.identity?.launchWebAuthFlow === "function" && Boolean(identityRedirectUrl())
  } catch {
    return false
  }
}

/**
 * `launchWebAuthFlow` 的 Promise 包装。
 *
 * ⚠️ 实测口径：用户在部分 Chrome 版本关窗表现为 `lastError`（"The user did not approve access."），
 * 这**不是错误**——一律 `resolve(undefined)` → `cancelled`，不弹错、不上报失败埋点。
 * 真正的错误（无 identity 权限、URL 非法）由后续换 token 阶段暴露。
 */
function launchWebAuthFlow(url: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
        // 读一次以清除 lastError（不读会在下次调用时报 "unchecked lastError"）
        const error = chrome.runtime.lastError
        if (error) {
          // 用户关窗 / 拒绝：**不是错误**，按取消处理
          resolve(undefined)
          return
        }
        resolve(redirectUrl ?? undefined)
      })
    } catch (error) {
      reject(error)
    }
  })
}

// ── 快照广播 ───────────────────────────────────────────────────

function broadcast(snapshot: AuthSnapshot): void {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return
    const result: unknown = chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.AUTH_CHANGED,
      payload: { snapshot }
    })
    // 无接收方时报错是常态（Options 没开、页面没有 content script），静默吞掉
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      void (result as Promise<unknown>).catch(() => {})
    }
  } catch {
    // 同上
  }
}

async function persistSnapshot(snapshot: AuthSnapshot): Promise<AuthSnapshot> {
  cachedSnapshot = snapshot
  await writeSnapshot(snapshot)
  for (const listener of listeners) {
    try {
      listener(snapshot)
    } catch (error) {
      console.warn("[auth] 快照监听器抛错（已忽略）", error)
    }
  }
  broadcast(snapshot)
  return snapshot
}

/** 订阅快照变化（background 内部用；UI 侧用 `facade.subscribeAuthSnapshot`） */
export function onAuthChanged(listener: (snapshot: AuthSnapshot) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ── token 生命周期 ─────────────────────────────────────────────

interface RefreshedTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

async function doRefresh(persisted: PersistedAuth): Promise<RefreshedTokens> {
  // `auth: false`：refresh 本身不需要 Bearer（也绝不能走「401 救援」分支，否则递归）
  const response = await authFetch("/auth/refresh", {
    auth: false,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: persisted.refreshToken })
  })

  const data = (await response.json()) as Record<string, unknown>
  const accessToken = data.access_token
  if (typeof accessToken !== "string" || !accessToken) {
    throw new AuthError("SERVER_ERROR", "刷新响应缺少 access_token", response.status)
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 900
  const rotated = data.refresh_token
  return {
    accessToken,
    // 契约是「单次使用即轮换」，正常一定有新值；缺省时保留旧值，不把会话写坏
    refreshToken: typeof rotated === "string" && rotated ? rotated : persisted.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000
  }
}

/**
 * 强制 / 需要时刷新，**并发共享一次请求**（SPEC §3.5-③）。
 * 返回可用的 access token；失败按分级抛出（401 撤销类会先清会话）。
 */
async function refreshAccessToken(persisted: PersistedAuth): Promise<string> {
  const gen = generation
  if (inflightRefresh?.gen === gen) return inflightRefresh.promise

  const promise = doRefresh(persisted)
    .then(async (result) => {
      // 旧代（登出 / 被撤销之后）的结果**丢弃**，否则会把登出状态「复活」
      if (gen === generation) {
        await writeSession({
          userId: persisted.userId,
          plan: persisted.plan,
          refreshToken: result.refreshToken,
          accessToken: result.accessToken,
          accessTokenExpiresAt: result.expiresAt
        })
      }
      return result.accessToken
    })
    .catch(async (error: unknown) => {
      const authError = toAuthError(error)
      // 只有「被撤销 / 无效」才清会话；429、5xx、网络一律保留（失败分级）
      if (authError.code === "REFRESH_REVOKED") {
        await invalidateSession("REFRESH_REVOKED")
      }
      throw authError
    })
    .finally(() => {
      // 只清自己那条，避免把后来者的 in-flight 抹掉
      if (inflightRefresh?.gen === gen) inflightRefresh = null
    })

  inflightRefresh = { gen, promise }
  return promise
}

/**
 * 唯一的取令牌入口。
 *
 * - 无会话 → 抛 `NO_SESSION`（**不返回空串**：`Bearer ` 空头换来的 401 会把归因全部搞错）；
 * - 未临期且 `force` 为假 → 直接返回；
 * - 临期（剩余 < `REFRESH_BUFFER_MS`）或 `force` → 刷新（单飞）。
 */
export async function getAccessToken(options: { force?: boolean } = {}): Promise<string> {
  const persisted = await readPersisted()
  if (!persisted) throw new AuthError("NO_SESSION")

  if (!options.force) {
    const access = await readAccess()
    const usable =
      access &&
      access.userId === persisted.userId &&
      access.accessTokenExpiresAt - Date.now() > REFRESH_BUFFER_MS
    if (usable) return access.accessToken
  }

  return refreshAccessToken(persisted)
}

/**
 * 让会话失效：清两层存储 + 清权益缓存 + 广播 signed-out。
 *
 * `reason` 只用于日志与调用方判断，**不上报**（凭据相关一律不进埋点）。
 */
export async function invalidateSession(reason: AuthErrorCode): Promise<void> {
  // 先看一眼有没有会话：并发的两个 401 都会走到这里，重复上报会让「被动登出」次数翻倍
  const previous = await readSession()

  generation++
  inflightRefresh = null
  await clearSession()
  clearEntitlementsCache()
  await persistSnapshot(buildSignedOutSnapshot())
  if (previous) {
    void trackBackgroundEvent("auth_signed_out", { initiated: "revoked" })
  }
  if (reason !== "REFRESH_REVOKED") {
    console.warn(`[auth] 会话失效：${reason}`)
  }
}

// ── 快照 ───────────────────────────────────────────────────────

export async function getSnapshot(): Promise<AuthSnapshot> {
  if (cachedSnapshot) return cachedSnapshot

  const stored = await readSnapshot()
  if (stored) {
    cachedSnapshot = stored
    return stored
  }

  // 没有快照时按存储推断：有持久层就认为已登录（首帧不闪未登录），真实状态由下一次请求校准
  const persisted = await readPersisted()
  return persisted
    ? { state: "signed-in", plan: persisted.plan, updatedAt: Date.now() }
    : buildSignedOutSnapshot()
}

/**
 * 从服务端刷新权益并重建快照。
 *
 * `/v1/me` 失败 → **返回当前快照**（状态不变、plan 不变）：一次 500 不能把 pro 用户显示成 free。
 * 强制回源的时机由调用方决定（登录 / 登出 / 402 / 账号页可见）。
 */
export async function refreshSnapshotFromServer(): Promise<AuthSnapshot> {
  const current = await getSnapshot()
  if (current.state === "signed-out") return current

  const entitlements = await getEntitlements({ force: true })
  if (!entitlements) return current

  const snapshot: AuthSnapshot = {
    state: entitlements.principal.kind === "device" ? "anonymous" : "signed-in",
    ...entitlementsToSnapshot(entitlements),
    updatedAt: Date.now()
  }
  return persistSnapshot(snapshot)
}

// ── 登录 / 登出 ────────────────────────────────────────────────

interface ExchangedTokens {
  userId: string
  plan: AuthSnapshot["plan"]
  accessToken: string
  refreshToken: string
  expiresAt: number
  email?: string
  principalKind: PrincipalKind
}

async function exchangeCode(input: { code: string; verifier: string; extId: string }): Promise<ExchangedTokens> {
  const response = await authFetch("/auth/extension/token", {
    auth: false,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: input.code,
      code_verifier: input.verifier,
      device_id: await getAnonymousId(),
      ext_id: input.extId,
      platform: PLATFORM
    })
  })

  const data = (await response.json()) as Record<string, unknown>
  const accessToken = data.access_token
  const refreshToken = data.refresh_token
  const user = (data.user ?? {}) as Record<string, unknown>
  const userId = typeof user.id === "string" ? user.id : ""

  if (typeof accessToken !== "string" || !accessToken || typeof refreshToken !== "string" || !refreshToken || !userId) {
    throw new AuthError("SERVER_ERROR", "交换 token 的响应缺少必需字段", response.status)
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 900
  return {
    userId,
    plan: isPlanId(data.plan) ? data.plan : "free",
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    ...(typeof user.email === "string" && user.email ? { email: user.email } : {}),
    principalKind: "user"
  }
}

async function performSignIn(input: { entry: "popup" | "options" }): Promise<SignInResult> {
  const { entry } = input
  const startedAt = Date.now()

  /**
   * 统一的失败/取消出口：每个分支都必须经过这里，否则埋点会漏（漏报比错报更难查）。
   * `cancelled` 与 `failed` 共用同一个事件，用 `reason` 区分——用户中途放弃也是信号。
   */
  const fail = (code: AuthErrorCode): SignInResult => {
    void trackBackgroundEvent("auth_sign_in_failed", { entry, reason: signInFailureReason(code) })
    return code === "CANCELLED" ? { status: "cancelled" } : { status: "failed", code }
  }

  if (!canUseIdentity()) return fail("SERVER_ERROR")

  const extId = extensionId()
  const redirectUri = identityRedirectUrl()
  const { verifier, challenge } = await createPkce()
  const state = randomToken()

  await writePending({ state, verifier, createdAt: Date.now() })
  const authorizeUrl = buildAuthorizeUrl({ extId, platform: PLATFORM, state, challenge, redirectUri })

  let callbackUrl: string | undefined
  try {
    callbackUrl = await launchWebAuthFlow(authorizeUrl)
  } catch {
    await clearPending()
    return fail("NETWORK")
  }

  // 用户关窗：不是错误（不弹错），但埋点仍记一条 reason=window_closed
  if (!callbackUrl) {
    await clearPending()
    return fail("CANCELLED")
  }

  const pending = await readPending()
  // ★ 先删再看结果：无论成败都只允许用一次（防重放）
  await clearPending()

  if (!pending) return fail("STATE_MISMATCH")
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) return fail("STATE_MISMATCH")

  const callback = parseCallbackUrl(callbackUrl)
  if (callback.state !== pending.state) return fail("STATE_MISMATCH")
  // error=access_denied（用户点了拒绝）也算取消
  if (!callback.code) return fail("CANCELLED")

  let tokens: ExchangedTokens
  try {
    // code 一次性：服务端回 400 一律按「已用过 / 过期」处理，**不重试**
    tokens = await exchangeCode({ code: callback.code, verifier: pending.verifier, extId })
  } catch (error) {
    return fail(toAuthError(error).code)
  }

  // 新会话：让登出前的旧刷新彻底失效
  generation++
  inflightRefresh = null

  await writeSession({
    userId: tokens.userId,
    plan: tokens.plan,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.expiresAt
  })
  clearEntitlementsCache()

  // 立刻落一个「已登录」快照：不等 /v1/me，UI 不用盯着空白转圈
  await persistSnapshot({
    state: "signed-in",
    principalKind: tokens.principalKind,
    ...(tokens.email ? { email: tokens.email } : {}),
    plan: tokens.plan,
    quota: null,
    updatedAt: Date.now()
  })

  // 权益拉取失败不影响「登录成功」这个事实（失败不降级，快照保留刚才的 plan）
  await refreshSnapshotFromServer().catch(() => undefined)

  void trackBackgroundEvent("auth_sign_in_completed", {
    entry,
    method: "pkce",
    duration_bucket: signInDurationBucket(Date.now() - startedAt)
  })
  return { status: "signed-in" }
}

/**
 * 登录。并发调用**共享同一个流程**（连点两次不会拉起两个授权窗口）。
 * `cancelled` 是正常路径（用户关窗 / 拒绝授权），不是错误。
 */
export async function signIn(input: { entry: "popup" | "options" }): Promise<SignInResult> {
  if (inflightSignIn) return inflightSignIn
  inflightSignIn = performSignIn(input).finally(() => {
    inflightSignIn = null
  })
  return inflightSignIn
}

/**
 * 登出：**先清本地**再尽力通知服务端。
 *
 * 顺序不能反：网络失败时用户仍必须立刻变成未登录，否则会卡在「登出中」。
 * `/auth/logout` 用 `auth: false` + 手动 Authorization —— 此时本地已清，再走取令牌只会抛 `NO_SESSION`。
 */
export async function signOut(): Promise<void> {
  generation++
  inflightRefresh = null

  const previous = await readSession()
  await clearSession()
  clearEntitlementsCache()
  await persistSnapshot(buildSignedOutSnapshot())

  if (previous) {
    void trackBackgroundEvent("auth_signed_out", { initiated: "user" })
    void authFetch("/auth/logout", {
      auth: false,
      method: "POST",
      headers: { Authorization: `Bearer ${previous.accessToken}` }
    }).catch(() => {
      // 断网 / 服务端不可用都不阻塞登出
    })
  }
}

// ── 冷启动 ─────────────────────────────────────────────────────

/**
 * 启动时初始化会话（SPEC §5.2 冷启动时序）。
 *
 * 顺序刻意是「先信本地快照」：
 * - 有快照 → 立刻返回（首帧不闪未登录），临近过期时**后台**刷新，不阻塞消息响应；
 * - 只有持久层（浏览器重启后 session 被清空）→ 先给 signed-in，再后台换 access；
 * - 什么都没有 → 领 device token，成功则 anonymous（失败静默，按未配置处理）。
 *
 * ⚠️ **M2 待补的两个缺口**（M1 无可见影响，接线官方链路时会同时暴露）：
 * 1. SPEC §5.1 要求 anonymous 之后「拉一次 `/v1/me`（拿匿名额度）」，当前**没做**。
 *    而且做了也拿不到：`getEntitlements` → `authFetch(auth: true)` → `getAccessToken()` 只认持久层，
 *    未登录必抛 `NO_SESSION`。也就是说 **device token 目前没有任何业务消费方**，只有 `device.ts` 自己读写；
 *    M2 必须让 `request.ts` 在无会话时改用 device token 认证（否则匿名用户的官方请求全部 401）。
 * 2. `ensureDeviceToken()` 只在「**完全没有快照**」这一支被调到：一旦写过快照（包括首次失败写下的
 *    signed-out），之后永远不会再领；device token 的 30 天到期也没有续签路径。
 *    修法：把条件改成读 `readDeviceToken()`（没领过 / 临期才领），而不是「无快照」。
 */
export async function initializeSession(): Promise<AuthSnapshot> {
  const stored = await readSnapshot()
  if (stored) {
    cachedSnapshot = stored
    if (stored.state !== "signed-out") {
      void getAccessToken().catch(() => undefined)
    }
    return stored
  }

  const persisted = await readPersisted()
  if (persisted) {
    const snapshot: AuthSnapshot = { state: "signed-in", plan: persisted.plan, updatedAt: Date.now() }
    await persistSnapshot(snapshot)
    void getAccessToken().catch(() => undefined)
    return snapshot
  }

  const deviceToken = await ensureDeviceToken()
  const snapshot: AuthSnapshot = deviceToken
    ? { state: "anonymous", principalKind: "device", plan: "anonymous", updatedAt: Date.now() }
    : buildSignedOutSnapshot()
  return persistSnapshot(snapshot)
}

// 依赖倒置：把 token 提供者与失效入口交给 request.ts（避免 request ↔ session 循环依赖）
configureAuthRequest({ getAccessToken, invalidateSession })
