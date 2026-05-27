import { ERROR_MESSAGES } from "~/shared/constants"

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
    error: `${ERROR_MESSAGES.REQUEST_FAILED}：${message}`
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
 * Format API error response
 */
export function formatApiError(status: number, body: string): string {
  return `${ERROR_MESSAGES.INVALID_RESPONSE} (${status})：${body || ERROR_MESSAGES.UNKNOWN_ERROR}`
}
