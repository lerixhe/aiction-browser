import { ERROR_MESSAGES } from "@/shared/constants"
import { sanitizeErrorMessage, scrubCredentials } from "@/shared/redact"

// 脱敏实现已抽到 `@/shared/redact`（analytics 出口护栏也用它），此处 re-export 保持调用方不变
export { sanitizeErrorMessage, scrubCredentials }

/**
 * Application error class with localized messages
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = "AppError"
  }
}

/**
 * Create an error event for chat stream
 */
export function createErrorEvent(error: unknown): { type: "failed"; error: string } {
  const message = getErrorMessage(error)
  return {
    type: "failed",
    error: `${ERROR_MESSAGES.REQUEST_FAILED}: ${message}`
  }
}

/**
 * Get error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return ERROR_MESSAGES.UNKNOWN_ERROR
}

/**
 * Check if error is an AbortError
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

/**
 * 对话失败的归因枚举（只上报枚举，不上报错误原文，见 docs/ANALYTICS.md §3）。
 * 取值与 background 侧 `ChatStreamFailedEvent.code` 保持一致。
 *
 * `quota_exceeded`（HTTP 402）是 M2 额度墙的预留桶：M1 只做归因，不接升级 CTA。
 * 它由**结构化 status 判断**得出，不从响应体文本推。
 */
export type ChatErrorCode =
  | "timeout"
  | "auth"
  | "rate_limit"
  | "quota_exceeded"
  /**
   * 官方链路的 `403 model_not_allowed` / `404 no_model`（契约 §1.4：换模型，不是重新登录）。
   * 由 `background.streamChat` 按 `isOfficial + statusCode` 覆写得出，**不由 `classifyChatError` 产生**：
   * 通用层只看状态码，而 BYOK 的 403 通常是 Key 权限问题，归 `auth` 才对。
   */
  | "model_unavailable"
  | "network"
  | "aborted"
  | "no_api_key"
  | "missing_config"
  | "no_content"
  | "provider_error"
  | "unknown"

/**
 * 取 HTTP 状态码：**只认结构化字段**（AI SDK 的 APICallError / fetch 错误带 statusCode）。
 * 不从消息文本里正则抓三位数——那会把 `max_tokens: 393216` 一类数字误当状态码，
 * 且不同 provider 的错误文案格式差异极大（见 docs/ANALYTICS.md §3.10）。
 */
export function getStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = (error as { statusCode?: unknown }).statusCode
    if (typeof code === "number" && Number.isFinite(code)) {
      return code
    }
  }
  return undefined
}

/**
 * 把错误归入**粗分类**兜底枚举（11 个桶），仅用于趋势 / 占比这类聚合分析。
 *
 * **只看事实，不猜类型**（docs/ANALYTICS.md §3.10）：
 * 1. `error.name` 字段（结构化）；
 * 2. 我们自己写的文案常量精确比对（`ERROR_MESSAGES.*`）；
 * 3. `statusCode` 字段（HTTP 层事实，不是从文本里抓的）。
 *
 * 都对应不上就落到 `unknown` 兜底桶——**不做任何关键词 / 正则推断**。
 * 早期尝试过 `/timeout|unauthorized|rate limit/` 这类兜底，已移除：各家错误文案差异极大，
 * 猜出来的分类会直接误导分析（用户看到的是错桶，原文里的真实原因反而没人看）。
 * 具体原因一律看 `error_detail` / `response_body` 原文。
 */
export function classifyChatError(error: unknown): ChatErrorCode {
  if (isAbortError(error)) return "aborted"

  const message = getErrorMessage(error)
  if (message === ERROR_MESSAGES.NO_API_KEY) return "no_api_key"
  if (message === ERROR_MESSAGES.API_TEST_MISSING_FIELDS) return "missing_config"
  if (message === ERROR_MESSAGES.NO_VALID_CONTENT) return "no_content"
  if (message === ERROR_MESSAGES.REQUEST_TIMEOUT) return "timeout"
  if (message === ERROR_MESSAGES.STREAM_DISCONNECTED) return "network"
  if (message === ERROR_MESSAGES.CONTEXT_INVALIDATED) return "aborted"

  const status = getStatusCode(error)
  if (status === 401 || status === 403) return "auth"
  if (status === 402) return "quota_exceeded"
  if (status === 404) return "missing_config"
  if (status === 408 || status === 504) return "timeout"
  if (status === 429) return "rate_limit"
  if (status !== undefined && status >= 400) return "provider_error"

  // 兜底：不猜。
  return "unknown"
}

/**
 * Format API error response
 */
export function formatApiError(status: number, body: string): string {
  return `${ERROR_MESSAGES.INVALID_RESPONSE} (${status}): ${body || ERROR_MESSAGES.UNKNOWN_ERROR}`
}

// ── 错误诊断属性（埋点用，见 docs/ANALYTICS.md §3.10）────────────────
//
// 口径：**粗分类 + 原文全量**。分类只到 `error_code` 这 10 个桶（外加结构化的 statusCode），
// 不再从文本里抠 `error.type` / 结构字段——早期用户量少，直接看原文分析更准。
// 唯一限制是：字段值必须过 `sanitizeErrorMessage()`（只抹凭据 + 超长截断）。

/** 埋点可上报的错误诊断属性 */
export interface ApiErrorDiagnostics {
  /** 粗分类枚举（同 ChatErrorCode） */
  error_code: ChatErrorCode
  /** 错误类名（`AI_APICallError` / `TypeError` …） */
  error_name: string
  /** HTTP 状态码（只取结构化字段，取不到就不带） */
  http_status?: number
  /** 完整错误消息（仅抹凭据，超长截断） */
  error_detail: string
  /** 端点响应体原文（仅抹凭据，超长截断） */
  response_body?: string
}

/** 错误类名（Error.name 优先，其次构造函数名），只做取值不做猜测 */
export function getErrorName(error: unknown): string {
  if (typeof error === "string") {
    return "string"
  }
  if (!error || typeof error !== "object") {
    return typeof error
  }

  const name = (error as { name?: unknown }).name
  if (typeof name === "string" && name) {
    return name
  }
  const ctor = (error as { constructor?: { name?: unknown } }).constructor
  return typeof ctor?.name === "string" && ctor.name ? ctor.name : "unknown"
}

/** AI SDK 的 APICallError 带 responseBody（字符串），其余错误没有 */
function getResponseBody(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined
  }
  const body = (error as { responseBody?: unknown }).responseBody
  return typeof body === "string" && body.length > 0 ? body : undefined
}

/**
 * 把任意错误转成可上报的诊断属性集（docs/ANALYTICS.md §3.10）。
 * 只做「粗分类 + 原文」：分类要么用结构化字段，要么用既有 `classifyChatError()`；
 * 原文（message / responseBody）**完整上报**，仅抹凭据与超长截断。
 */
export function describeApiError(error: unknown, code?: ChatErrorCode): ApiErrorDiagnostics {
  const diagnostics: ApiErrorDiagnostics = {
    error_code: code ?? classifyChatError(error),
    error_name: getErrorName(error),
    error_detail: sanitizeErrorMessage(getErrorMessage(error))
  }

  const status = getStatusCode(error)
  if (status !== undefined) {
    diagnostics.http_status = status
  }

  const body = getResponseBody(error)
  if (body) {
    diagnostics.response_body = sanitizeErrorMessage(body)
  }

  return diagnostics
}
