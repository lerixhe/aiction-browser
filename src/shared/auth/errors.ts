/**
 * 认证内部错误。
 *
 * 与 `shared/errors.ts` 的 `ChatErrorCode` **刻意分开**：
 * - `ChatErrorCode` 描述「一次聊天请求为什么失败」，走流式事件、进埋点；
 * - `AuthErrorCode` 描述「会话内核自己出了什么状况」，走调用栈、决定是否登出。
 *
 * 归因口径与 `AGENTS.md` 一致：**只看结构化字段**（HTTP status + 响应体里的 `error.code`），
 * 不从 message 文本里猜。
 */
import type { ApiErrorCode, AuthErrorCode } from "@/shared/auth/types"

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = "AuthError"
  }
}

/**
 * `ApiErrorCode` 的白名单（契约 §2.1）。
 * `readApiErrorCode` 只返回这里面的值——响应体里出现未知字符串时返回 `undefined`，
 * 让调用方走「无 code」的默认分支，而不是把一个不认识的字符串当事实使用。
 */
const API_ERROR_CODES: readonly ApiErrorCode[] = [
  "invalid_request",
  "token_expired",
  "token_invalid",
  "token_wrong_client",
  "refresh_revoked",
  "refresh_race",
  "quota_exceeded",
  "subscription_required",
  "subscription_expired",
  "model_not_allowed",
  "no_model",
  "context_too_long",
  "rate_limited",
  "concurrency_exceeded",
  "internal",
  "upstream_error",
  "maintenance"
]

/**
 * 读取响应体里的 `error.code`。
 *
 * 解析不出来（非 JSON / 结构不对 / 不在白名单）一律返回 `undefined`，**不抛错、不猜**。
 * 用 `clone()` 是因为调用方随后可能还要读 body。
 */
export async function readApiErrorCode(response: Response): Promise<ApiErrorCode | undefined> {
  try {
    const body: unknown = await response.clone().json()
    if (!body || typeof body !== "object") return undefined
    const error = (body as { error?: unknown }).error
    if (!error || typeof error !== "object") return undefined
    const code = (error as { code?: unknown }).code
    return typeof code === "string" && (API_ERROR_CODES as readonly string[]).includes(code)
      ? (code as ApiErrorCode)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * 把 fetch / unknown 异常统一成 `AuthError`。
 *
 * 只做两件事，不猜原因：
 * - `AuthError` 原样返回；
 * - `AbortError` 归 `NETWORK`（超时 / 中止都属网络层，且都**保留会话**）；
 * - 其余落 `SERVER_ERROR` 兜底（同样是保留会话的桶）。
 */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error
  if (error instanceof DOMException && error.name === "AbortError") {
    return new AuthError("NETWORK", "request aborted")
  }
  return new AuthError("SERVER_ERROR", error instanceof Error ? error.message : String(error))
}
