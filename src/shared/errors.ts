import { ERROR_MESSAGES } from "@/shared/constants"
import { ProviderError } from "@/shared/model-provider"

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
  if (error instanceof ProviderError) {
    switch (error.code) {
      case "MISSING_API_KEY":
        return ERROR_MESSAGES.NO_API_KEY
      case "MISSING_BASE_URL":
        return "API Base URL is required. Please configure it in provider settings."
      case "INVALID_PROVIDER_CONFIG":
        return "Invalid provider configuration. Please check your settings."
      case "UNSUPPORTED_PROVIDER":
        return "Unsupported provider. Please select a different provider."
      case "UNSUPPORTED_MODEL":
        return `Unsupported model: ${error.message}`
      case "PROVIDER_NOT_FOUND":
        return "Provider not found. Please check your provider configuration."
      default:
        return error.message
    }
  }
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
  return `${ERROR_MESSAGES.INVALID_RESPONSE} (${status}): ${body || ERROR_MESSAGES.UNKNOWN_ERROR}`
}
