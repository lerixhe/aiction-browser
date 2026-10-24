/**
 * 认证请求层（SPEC §6.5）。
 *
 * 职责只有两件：**把契约 §1.3 的必需头集中注入**、把 HTTP 结果翻译成 `AuthError`。
 * 所有认证请求都必须走这里——各处自己拼头，迟早出现 `X-Ext-Id` 不一致导致的
 * `token_wrong_client`（那是最难查的一类 401）。
 *
 * 依赖方向是**倒置**的：本模块不知道 token 存在哪，由 `session.ts` 在模块加载期
 * 调用 `configureAuthRequest()` 注册 `getAccessToken` / `invalidateSession`。
 * 这样 `request ↔ session` 不会形成循环依赖（session 发刷新请求时用 `auth: false`，
 * 也不存在「401 救援里再触发 401 救援」的递归）。
 */
import { getAnonymousId } from "@/shared/anonymous-id"
import { API_BASE, PLATFORM } from "@/shared/auth/config"
import { AuthError, readApiErrorCode, toAuthError } from "@/shared/auth/errors"
import { clearDeviceToken } from "@/shared/auth/storage"
import type { AuthErrorCode, PrincipalKind } from "@/shared/auth/types"

export interface AuthFetchOptions extends RequestInit {
  /** 默认 `true`；`/auth/*` 的无认证端点（device / token / refresh）传 `false` */
  auth?: boolean
  /** 内部重试标记，**调用方不要传** */
  __retried?: boolean
  /** 内部：重试时把主体类型带过去（device 与 user 的 401 处置不同），**调用方不要传** */
  __principalKind?: PrincipalKind
}

/** 取凭证：`force` 表示越过「未临期」判断强制刷新（401 救援用） */
export type AuthTokenProvider = (options?: { force?: boolean }) => Promise<string>
/** 会话失效：清存储 + 广播（由 session.ts 提供） */
export type SessionInvalidator = (reason: AuthErrorCode) => Promise<void>

/**
 * 一个**已认证请求的主体**。契约 §1.2 的 `sub` 只有两种，所以这里也只返回这两种：
 * - `user`：登录用户，`access_token` 15 分钟（`getAccessToken()` 含单飞刷新）；
 * - `device`：匿名设备，device token 30 天（`ensureDeviceToken()`）。
 */
export interface PrincipalCredential {
  token: string
  kind: PrincipalKind
}

/**
 * 取当前请求该用哪张凭据。
 *
 * 为什么不是「只给 access token」：未登录用户也有官方额度（契约 §3.1），
 * 而 `/v1/me` / `/v1/chat/completions` 都只认 Bearer。M1 把这一支留成了缺口
 * （`authFetch` 只认会话 → 匿名用户一律 `NO_SESSION`），M2 接官方链路必须补上。
 *
 * `force: true`：越过本地缓存「换一张再试」（用于 401 救援，不区分「过期」与「无效」）。
 */
export type PrincipalProvider = (options?: { force?: boolean }) => Promise<PrincipalCredential>

let accessTokenProvider: AuthTokenProvider | null = null
let principalProvider: PrincipalProvider | null = null
let sessionInvalidator: SessionInvalidator | null = null

/**
 * 由 `session.ts` 在模块加载期调用一次。
 * 显式配置而不是「偷偷 import」：加载顺序可见，单测也能注入假实现。
 *
 * `getAccessToken` 保留是为了让「只要 access token」的调用方（及既有单测）不必构造主体，
 * 但真正的请求路径优先用 `getPrincipalToken`（它能区分 user / device）。
 */
export function configureAuthRequest(options: {
  getAccessToken?: AuthTokenProvider
  getPrincipalToken?: PrincipalProvider
  invalidateSession?: SessionInvalidator
}): void {
  accessTokenProvider = options.getAccessToken ?? null
  principalProvider = options.getPrincipalToken ?? null
  sessionInvalidator = options.invalidateSession ?? null
}

/** 仅供单测：清掉已注册的钩子 */
export function resetAuthRequest(): void {
  accessTokenProvider = null
  principalProvider = null
  sessionInvalidator = null
}

function extensionId(): string {
  try {
    return typeof chrome !== "undefined" ? chrome.runtime.id : ""
  } catch {
    return ""
  }
}

function clientVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return "0.0.0"
  }
}

/**
 * 契约 §1.3 的四个通用头（Authorization 另算）。
 *
 * 导出给官方对话链路用：`/v1/chat/completions` 走 AI SDK 直连（不经过 `authFetch`），
 * 但同样要求这四个头。两处各拼一份迟早出现 `X-Ext-Id` 不一致导致的 `token_wrong_client`。
 */
export async function buildApiBaseHeaders(): Promise<Record<string, string>> {
  return {
    "X-Ext-Id": extensionId(),
    "X-Client-Version": clientVersion(),
    "X-Device-Id": await getAnonymousId(),
    "X-Platform": PLATFORM
  }
}

/** 非 2xx（且非 401）的状态码归类。只认状态码，不看 message 文本 */
function statusToAuthError(status: number): AuthError {
  if (status === 402) return new AuthError("QUOTA_EXCEEDED", "402", status)
  if (status === 429) return new AuthError("RATE_LIMITED", "429", status)
  // 400 invalid_request / 403 / 404 / 409 / 413 / 5xx 一律「保留会话 + 展示错误」；
  // 带上 status 让调用方区分「客户端 bug」（4xx，应暴露）与「服务端抖动」（5xx，可静默降级）
  return new AuthError("SERVER_ERROR", String(status), status)
}

/**
 * 真正发请求。
 * `providedToken` 用于 401 救援：换到的新 token 直接用于重试，
 * **不再回头问一次 provider**（否则一次救援会触发两次取凭证/判断）。
 */
async function perform(path: string, options: AuthFetchOptions, providedToken?: string): Promise<Response> {
  const { auth = true, __retried = false, __principalKind, headers, ...init } = options

  const requestHeaders = new Headers(headers)
  for (const [name, value] of Object.entries(await buildApiBaseHeaders())) {
    requestHeaders.set(name, value)
  }

  /** 本次请求用的主体类型：device 的救援路径与 user 不同（重领 vs 刷新） */
  let principalKind: PrincipalKind | null = __principalKind ?? null

  if (auth) {
    if (providedToken) {
      requestHeaders.set("Authorization", `Bearer ${providedToken}`)
    } else if (principalProvider) {
      // 没有可用主体时 provider 会抛 NO_SESSION —— 这里**不兜底**，绝不拼 `Bearer ` 空头
      const credential = await principalProvider()
      principalKind = credential.kind
      requestHeaders.set("Authorization", `Bearer ${credential.token}`)
    } else if (accessTokenProvider) {
      // 只注册了 access token 的旧路径（单测 / 不关心主体类型的调用）
      requestHeaders.set("Authorization", `Bearer ${await accessTokenProvider()}`)
    } else {
      // 配置错误，不是运行时错误：说明调用方绕过了 session.ts
      throw new AuthError("SERVER_ERROR", "认证请求层未初始化（未加载 session.ts）")
    }
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers: requestHeaders })
  } catch (error) {
    // fetch 只会在网络层失败时抛错（AbortSignal 中止也归这里）：**保留会话**，不上报为服务端错误
    if (error instanceof AuthError) throw error
    throw new AuthError("NETWORK", error instanceof Error ? error.message : String(error))
  }

  if (response.status === 401) {
    const apiCode = await readApiErrorCode(response)
    /** 救援只能走主体提供者（它知道「刷新 access token」与「重领 device token」的区别） */
    const provider: PrincipalProvider | null =
      principalProvider ??
      (accessTokenProvider
        ? (opts) =>
            accessTokenProvider!(opts).then((value) => ({ token: value, kind: "user" as const }))
        : null)

    /**
     * 401 只有**一次**救援机会，且两条路径完全不同：
     * - `token_expired`（契约 §1.4）= 短暂过期 → 换一张再试；
     * - 匿名主体的 `token_invalid` / `token_wrong_client` / 无 code → device token 被服务端作废
     *   （重装、密钥轮换），重领一张（契约 §1.4 括注「或重新领 device token」）。
     *   登录用户的同类 401 不救援：refresh 也教不回来，只能登出。
     */
    const canRescue =
      auth &&
      !__retried &&
      provider &&
      (apiCode === "token_expired" ||
        (principalKind === "device" &&
          (apiCode === undefined || apiCode === "token_invalid" || apiCode === "token_wrong_client")))

    if (canRescue) {
      const fresh = await provider({ force: true })
      return perform(
        path,
        { ...options, __retried: true, ...(principalKind ? { __principalKind: principalKind } : {}) },
        fresh.token
      )
    }

    // 其余 401：refresh_revoked / 重试后仍 401 一律登出 —— 不猜原因，也不无限重试。
    if (auth && principalKind === "device") {
      // 匿名主体没有会话可登出：清掉这张坏 device token，下次冷启动/重试会重领。
      // 报错用 NO_SESSION（"没有可用主体"），不要用 REFRESH_REVOKED 冒充"会话被撤销"。
      await clearDeviceToken()
      throw new AuthError("NO_SESSION", apiCode ? `401 ${apiCode}` : "401 without error.code", 401)
    }
    if (auth && sessionInvalidator) {
      await sessionInvalidator("REFRESH_REVOKED")
    }
    throw new AuthError("REFRESH_REVOKED", apiCode ? `401 ${apiCode}` : "401 without error.code", 401)
  }

  if (response.ok) return response
  throw statusToAuthError(response.status)
}

export async function authFetch(path: string, options: AuthFetchOptions = {}): Promise<Response> {
  return perform(path, options)
}

/** 同 `authFetch`，但直接解 JSON。解析失败按服务端错误处理（不静默成 undefined） */
export async function apiJson<T>(path: string, options: AuthFetchOptions = {}): Promise<T> {
  const response = await authFetch(path, options)
  try {
    return (await response.json()) as T
  } catch (error) {
    throw toAuthError(error)
  }
}
