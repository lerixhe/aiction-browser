/**
 * 匿名设备标识（`aiction:anonymousId`）。
 *
 * 从 `analytics.ts` 抽出的原因有两个：
 * 1. 它是**基础设施**（账号风控的 `X-Device-Id`、device token 主体都用它），埋点只是消费者；
 * 2. `analytics.ts` 顶层 import posthog，任何只想拿匿名 ID 的模块（如认证请求层）都会被拖进埋点 SDK。
 *
 * 口径不变：全扩展**只有一个** anonymousId，由 `getAnonymousId()` 懒生成并缓存。
 */

const ANONYMOUS_ID_KEY = "aiction:anonymousId"

let cachedAnonymousId: string | null = null

export async function getAnonymousId(): Promise<string> {
  if (cachedAnonymousId) {
    return cachedAnonymousId
  }

  try {
    const result = await chrome.storage.local.get(ANONYMOUS_ID_KEY)
    const existing = result[ANONYMOUS_ID_KEY] as string | undefined
    if (existing) {
      cachedAnonymousId = existing
      return existing
    }
  } catch {
    // 扩展上下文失效：继续走生成分支（本次会话内仍然可用）
  }

  const newId = crypto.randomUUID()
  try {
    await chrome.storage.local.set({ [ANONYMOUS_ID_KEY]: newId })
  } catch {
    // 同上，写失败不影响本次使用
  }

  cachedAnonymousId = newId
  return newId
}

/** 仅供单测：清掉内存缓存，让下一次调用重新读存储 */
export function resetAnonymousIdCache(): void {
  cachedAnonymousId = null
}
