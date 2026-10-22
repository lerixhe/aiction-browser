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
import type { AuthErrorCode } from "@/shared/auth/types"

export interface AuthFetchOptions extends RequestInit {
  /** 默认 `true`；`/auth/*` 的无认证端点（device / token / refresh）传 `false` */
  auth?: boolean
  /** 内部重试标记，**调用方不要传** */
  __retried?: boolean
}

/** 取凭证：`force` 表示越过「未临期」判断强制刷新（401 救援用） */
export type AuthTokenProvider = (options?: { force?: boolean }) => Promise<string>
/** 会话失效：清存储 + 广播（由 session.ts 提供） */
export type SessionInvalidator = (reason: AuthErrorCode) => Promise<void>

let accessTokenProvider: AuthTokenProvider | null = null
let sessionInvalidator: SessionInvalidator | null = null

/**
 * 由 `session.ts` 在模块加载期调用一次。
 * 显式配置而不是「偷偷 import」：加载顺序可见，单测也能注入假实现。
 */
export function configureAuthRequest(options: {
  getAccessToken: AuthTokenProvider
  invalidateSession: SessionInvalidator
}): void {
  accessTokenProvider = options.getAccessToken
  sessionInvalidator = options.invalidateSession
}

/** 仅供单测：清掉已注册的钩子 */
export function resetAuthRequest(): void {
  accessTokenProvider = null
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

/** 契约 §1.3 的四个通用头（Authorization 另算） */
async function buildBaseHeaders(): Promise<Record<string, string>> {
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
 * `providedToken` 用于 401 救援：刷新拿到的新 token 直接用于重试，
 * **不再回头问一次 provider**（否则一次救援会触发两次取凭证/判断）。
 */
async function perform(path: string, options: AuthFetchOptions, providedToken?: string): Promise<Response> {
  const { auth = true, __retried = false, headers, ...init } = options

  const requestHeaders = new Headers(headers)
  for (const [name, value] of Object.entries(await buildBaseHeaders())) {
    requestHeaders.set(name, value)
  }

  if (auth) {
    if (providedToken) {
      requestHeaders.set("Authorization", `Bearer ${providedToken}`)
    } else {
      const provider = accessTokenProvider
      if (!provider) {
        // 配置错误，不是运行时错误：说明调用方绕过了 session.ts
        throw new AuthError("SERVER_ERROR", "认证请求层未初始化（未加载 session.ts）")
      }
      // 没有会话时 provider 会抛 NO_SESSION —— 这里**不兜底**，绝不拼 `Bearer ` 空头
      requestHeaders.set("Authorization", `Bearer ${await provider()}`)
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
    const provider = accessTokenProvider

    // 只有「过期」才允许刷新一次并重试一次（`__retried` 标记，不用循环）
    if (auth && !__retried && apiCode === "token_expired" && provider) {
      const freshToken = await provider({ force: true })
      return perform(path, { ...options, __retried: true }, freshToken)
    }

    // 其余 401：token_invalid / token_wrong_client / refresh_revoked / 无 code / 重试后仍 401
    // 一律登出 —— 不猜原因，也不无限重试
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
