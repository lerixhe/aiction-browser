/**
 * PKCE（RFC 7636）与授权 URL（SPEC §6.2 / 契约 §3.2）。
 *
 * 三条比参考实现更严的地方（`reference/selectly` 的缺陷，见 LOGIN_DEV_PLAN §2.1）：
 * 1. `verifier` / `state` 用 `crypto.getRandomValues`，**不用 `Math.random()`**；
 * 2. challenge 严格用 S256（`base64url(SHA-256(ascii(verifier)))`，**不带 padding**）；
 * 3. `state` 一次性落盘 + 5 分钟 TTL，校验失败也先删（在 `session.ts` 里）。
 *
 * 本模块是**纯函数**：不读存储、不发请求，因此可以直接用 RFC 7636 的测试向量断言。
 */
import { AUTHORIZE_BASE, type Platform } from "@/shared/auth/config"

/** base64url 编码（无 padding）：PKCE 与 state 都要求这个形态 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * 密码学随机串：`base64url(random(byteLength))`。
 * 32 字节 → 43 字符，正好落在 RFC 7636 要求的 43–128 区间内。
 */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

/** `base64url(SHA-256(ascii(verifier)))` —— 导出是为了能用 RFC 7636 附录 B 的向量比对 */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return toBase64Url(new Uint8Array(digest))
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32)
  return { verifier, challenge: await challengeOf(verifier) }
}

/**
 * 拼授权页 URL。参数顺序固定（便于单测做快照式断言）。
 *
 * `redirect_uri` 必须与 `chrome.identity.getRedirectURL()` **逐字一致**（含尾斜杠），
 * 且要和服务端白名单登记的一模一样——差一个字符就是 `invalid_request`。
 */
export function buildAuthorizeUrl(input: {
  extId: string
  platform: Platform
  state: string
  challenge: string
  redirectUri: string
  /** 默认按环境取（prod = 官网，dev = mock 网关）；单测可显式传 */
  baseUrl?: string
}): string {
  const url = new URL("/auth/extension/authorize", input.baseUrl ?? AUTHORIZE_BASE)
  url.searchParams.set("ext_id", input.extId)
  url.searchParams.set("platform", input.platform)
  url.searchParams.set("state", input.state)
  url.searchParams.set("code_challenge", input.challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("redirect_uri", input.redirectUri)
  return url.toString()
}

/**
 * 解析回跳 URL（`https://<ext-id>.chromiumapp.org/?code=…&state=…`）。
 *
 * 只做取值，**不做任何判定**：`state` 是否匹配、`code` 是否为空、是否有 `error`
 * 全部由 `session.ts` 按固定顺序校验（先删待验态再判断）。
 */
export function parseCallbackUrl(url: string): { code?: string; state?: string; error?: string } {
  try {
    const parsed = new URL(url)
    const result: { code?: string; state?: string; error?: string } = {}
    const code = parsed.searchParams.get("code")
    const state = parsed.searchParams.get("state")
    const error = parsed.searchParams.get("error")
    if (code) result.code = code
    if (state) result.state = state
    if (error) result.error = error
    return result
  } catch {
    return {}
  }
}
