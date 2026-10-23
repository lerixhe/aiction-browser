/**
 * 跨上下文只读入口（SPEC §6.11）。
 *
 * 这是 **content script / popup / options 唯一允许的 auth 入口**（白名单见
 * `scripts/check-auth-boundary.ts`）。刻意只暴露「读快照 + 订阅快照」：
 * 没有 `getAccessToken`、没有 storage 直连、没有网络请求，因此不存在把凭据带出 background 的路径。
 *
 * background 自己不要用本模块，用 `session.ts` / `entitlements.ts`。
 */
import type { AuthSnapshot } from "@/shared/auth/types"
import { AUTH_STORAGE_KEYS, parseAuthSnapshot } from "@/shared/auth/types"
import { MESSAGE_TYPES } from "@/shared/constants"

/** 兜底快照：任何异常路径都退到这里，让 UI 稳定渲染「未登录」而不是崩/空白 */
export function signedOutSnapshot(): AuthSnapshot {
  return { state: "signed-out", plan: "anonymous", updatedAt: 0 }
}

/**
 * 读快照（首帧用）。
 *
 * 只读 `storage.local` 的 `aiction:authSnapshot`——那是 background 写下的只读视图。
 * 读失败 / 无数据 / 解析不了都返回 signed-out 兜底，**不抛错**（首帧不阻塞渲染）。
 */
export async function readAuthSnapshot(): Promise<AuthSnapshot> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return signedOutSnapshot()
  try {
    const result = await chrome.storage.local.get(AUTH_STORAGE_KEYS.snapshot)
    return parseAuthSnapshot(result?.[AUTH_STORAGE_KEYS.snapshot]) ?? signedOutSnapshot()
  } catch {
    return signedOutSnapshot()
  }
}

/**
 * 订阅快照变化，返回退订函数。
 *
 * 两条通道（双保险）：
 * 1. `storage.onChanged(local)`：background 写 `aiction:authSnapshot` 时天然全上下文可见，
 *    **这是主通道**——写入即生效，不依赖广播成功；
 * 2. `runtime.onMessage(AUTH_CHANGED)`：用于「不落盘的变化」（M2 的权益刷新走这条）。
 *
 * 去重按 `updatedAt`：乱序到达的旧消息直接丢弃，同版本只回调一次。
 *
 * **“快照被删除”是例外**：`storage.remove()` 的 `newValue` 为 `undefined`，若直接回退成
 * `signedOutSnapshot()`（`updatedAt: 0`），它会被「旧版本丢弃」的逻辑吃掉 ——
 * 于是已经打开的页面会卡在上一份登录态，直到用户手动刷新。删除意味着
 * 「状态已经不存在」而不是「更旧的状态」，必须绕过时间戳比较（`force`）。
 */
export function subscribeAuthSnapshot(listener: (snapshot: AuthSnapshot) => void): () => void {
  let lastUpdatedAt = -1

  const emit = (snapshot: AuthSnapshot, options: { force?: boolean } = {}) => {
    if (options.force) {
      // 「快照被删除」：先把去重基准复位，再无条件通知。
      // 复位成 -1 而不是当前时间：后续可能还有一个 updatedAt 更早的迟到投递（background 写→删的顺序）,
      // 拿删除时刻当基准会把它当成「旧版本」丢掉，UI 就永远停在 signed-out 了。
      lastUpdatedAt = -1
      listener(snapshot)
      return
    }
    if (snapshot.updatedAt === lastUpdatedAt) return
    if (snapshot.updatedAt < lastUpdatedAt) return
    lastUpdatedAt = snapshot.updatedAt
    listener(snapshot)
  }

  const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
    if (areaName !== "local") return
    const change = changes[AUTH_STORAGE_KEYS.snapshot]
    if (!change) return

    const parsed = parseAuthSnapshot(change.newValue)
    if (parsed) {
      emit(parsed)
      return
    }
    // 被删除（或内容损坏）：内容损坏也按删除处理（storage 层会自己清掉坏 key）
    emit({ state: "signed-out", plan: "anonymous", updatedAt: Date.now() }, { force: true })
  }

  const onMessage: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message) => {
    const request = message as { type?: string; payload?: { snapshot?: unknown } } | undefined
    if (request?.type !== MESSAGE_TYPES.AUTH_CHANGED) return false
    const snapshot = parseAuthSnapshot(request.payload?.snapshot)
    if (snapshot) emit(snapshot)
    return false
  }

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(onStorageChanged)
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(onMessage)
  }

  return () => {
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(onStorageChanged)
    }
    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.removeListener(onMessage)
    }
  }
}
