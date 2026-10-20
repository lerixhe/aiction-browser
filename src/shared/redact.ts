/**
 * 埋点脱敏（纯正则，无任何外部依赖）。
 *
 * 独立成模块的原因：`analytics.ts`（上报出口护栏）与 `errors.ts`（错误诊断）都要用它，
 * 放在任一侧都会让模块关系变扭（且分析/错误两侧共享同一套凭据规则才不会漂）。
 *
 * 口径（docs/ANALYTICS.md §3.10 / §3.11）：**唯一禁区是 provider 的 token / API Key**。
 * 错误消息、响应体、provider 名称、端点地址、模型名一律**完整上报**——
 * 早期用户量少，原文比"猜出来的结构化字段"更有分析价值，所以这里
 * **不做**任何从文本里推断结构的事情（不抓状态码、不抠 JSON 字段、不打码 URL/长串）。
 *
 * 只做两件事：
 * - `scrubCredentials()`：抹掉凭据形态（`Bearer xxx` / `sk-…` / `key=` / `token=` / `secret=`）。
 * - `sanitizeErrorMessage()`：`scrubCredentials()` + 超长截断（防单条属性过大）。
 */

export const REDACTED = "[redacted]"

/** `Bearer xxx` / `Basic xxx` 之类的凭证头 */
const AUTH_HEADER_RE = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi
/** `sk-xxx` / `api_key=xxx` 之类的 Key 形态 */
const API_KEY_RE = /\b(sk|pk|rk|api[-_]?key)[-_:=][A-Za-z0-9._-]{6,}/gi
/** `key=xxx` / `token: xxx` / `"api_key":"xxx"` 一类的参数形态（含 URL query 与 JSON） */
const SECRET_PARAM_RE =
  /\b(api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|password|passphrase|key)("?\s*[:=]\s*"?)[^\s"',;&}]{4,}/gi

/**
 * 抹掉凭据形态，其余内容原样保留（URL、域名、错误原文、响应体全部不动）。
 * 这是「绝不上报 token」的底线实现，两处共用：错误字段与上报出口。
 */
export function scrubCredentials(text: string): string {
  if (!text) {
    return text
  }
  return text
    .replace(AUTH_HEADER_RE, "$1 [redacted]")
    .replace(API_KEY_RE, "[key]")
    .replace(SECRET_PARAM_RE, "$1$2[redacted]")
}

/**
 * 错误字段的上报值：抹凭据 + 超长截断。
 * 不做结构解析、不打码 URL、不抹用户文本回显——完整信息留给人工分析。
 */
export function sanitizeErrorMessage(text: string, maxLength = 2000): string {
  const cleaned = scrubCredentials(text).trim()
  if (cleaned.length <= maxLength) {
    return cleaned
  }
  return `${cleaned.slice(0, maxLength)}…`
}
