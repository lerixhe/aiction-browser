import { ERROR_MESSAGES } from "@/shared/constants"

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
 */
export type ChatErrorCode =
  | "timeout"
  | "auth"
  | "rate_limit"
  | "network"
  | "aborted"
  | "no_api_key"
  | "missing_config"
  | "no_content"
  | "provider_error"
  | "unknown"

/** 取 HTTP 状态码：AI SDK 的 APICallError 带 statusCode，其余从消息里的三位数兜底提取 */
function getStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = (error as { statusCode?: unknown }).statusCode
    if (typeof code === "number") {
      return code
    }
  }
  const match = getErrorMessage(error).match(/\b(4\d{2}|5\d{2})\b/)
  return match ? Number(match[1]) : undefined
}

/**
 * 把各种错误（本地化文案的字符串 / Error / AI SDK 错误）归入固定枚举。
 * 先看结构化信号（状态码、本地化文案的常量比对），再退化到关键词匹配。
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
  if (status === 404) return "missing_config"
  if (status === 408 || status === 504) return "timeout"
  if (status === 429) return "rate_limit"
  if (status && status >= 400) return "provider_error"

  if (/abort/i.test(message)) return "aborted"
  if (/timeout|timed? out/i.test(message)) return "timeout"
  if (/unauthorized|invalid api key|api key|forbidden/i.test(message)) return "auth"
  if (/rate ?limit|too many requests/i.test(message)) return "rate_limit"
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|socket hang up/i.test(message)) return "network"

  return "unknown"
}

/**
 * Format API error response
 */
export function formatApiError(status: number, body: string): string {
  return `${ERROR_MESSAGES.INVALID_RESPONSE} (${status}): ${body || ERROR_MESSAGES.UNKNOWN_ERROR}`
}
