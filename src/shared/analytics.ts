import posthog from "posthog-js/dist/module.no-external"

const POSTHOG_PROJECT_TOKEN = "phc_tPo8ytSVcKEozs6qbNTWEkDTnqXoxUoBuaNo2fu7v2Rh"
const POSTHOG_HOST = "https://us.i.posthog.com"

const ANONYMOUS_ID_KEY = "aiction:anonymousId"

/** 事件来源上下文（埋点属性 `source` 的取值，见 docs/ANALYTICS.md §3） */
export type AnalyticsSource = "web" | "pdf" | "popup" | "options" | "background"

/** 一次性里程碑标记在 chrome.storage.local 中的键前缀 */
const FIRST_TIME_PREFIX = "aiction:first:"

/**
 * 长度分桶：埋点禁止上报自由文本，长度也分桶（见 docs/ANALYTICS.md §3）。
 * 用于文案 / 模板 / 选区内容 / 朗读文本等「长度能说明问题、内容不能上报」的字段。
 */
export function lengthBucket(length: number): string {
  if (length === 0) return "0"
  if (length <= 20) return "1-20"
  if (length <= 60) return "21-60"
  if (length <= 200) return "61-200"
  return "200+"
}

// ── Anonymous ID ────────────────────────────────────────────────

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
    // Extension context may have been invalidated
  }

  const newId = crypto.randomUUID()
  try {
    await chrome.storage.local.set({ [ANONYMOUS_ID_KEY]: newId })
  } catch {
    // Ignore storage errors
  }

  cachedAnonymousId = newId
  return newId
}

// ── Telemetry enabled check ─────────────────────────────────────

export async function isTelemetryEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage.sync.get("aiction:settings")
    const settings = result["aiction:settings"] as Record<string, unknown> | undefined
    if (settings && typeof settings === "object") {
      return settings.telemetryEnabled !== false
    }
  } catch {
    // Extension context may have been invalidated
  }
  return true
}

// ── First-time milestones ───────────────────────────────────────

/**
 * 一次性里程碑：返回 true 表示该 key 首次出现（并写入标记，之后恒为 false）。
 * storage 异常时返回 false —— 宁可漏报，也不要重复计数。
 */
export async function consumeFirstTimeFlag(key: string): Promise<boolean> {
  const storageKey = `${FIRST_TIME_PREFIX}${key}`
  try {
    const result = await chrome.storage.local.get(storageKey)
    if (result[storageKey]) {
      return false
    }
    await chrome.storage.local.set({ [storageKey]: Date.now() })
    return true
  } catch {
    return false
  }
}

/** 仅在 `onceKey` 首次出现时上报（属性自动带上 `is_first: true`） */
export async function trackFirstTimeEvent(
  onceKey: string,
  name: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const isFirst = await consumeFirstTimeFlag(onceKey)
  if (!isFirst) {
    return
  }
  await trackEvent(name, { ...(properties ?? {}), is_first: true })
}

// ── Content Script: PostHog SDK ─────────────────────────────────

let sdkInitialized = false
let initPromise: Promise<boolean> | null = null

export async function initContentScriptAnalytics(): Promise<void> {
  if (sdkInitialized) return

  if (!initPromise) {
    initPromise = (async () => {
      const enabled = await isTelemetryEnabled()
      if (!enabled) return false

      const distinctId = await getAnonymousId()

      if (!(posthog as any).__loaded) {
        posthog.init(POSTHOG_PROJECT_TOKEN, {
          api_host: POSTHOG_HOST,
          persistence: "memory",
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          advanced_disable_decide: true,
          loaded: (ph) => {
            ph.identify(distinctId)
          }
        })
      }
      return true
    })()
  }

  try {
    sdkInitialized = await initPromise
  } catch (error) {
    initPromise = null
    console.warn("[AIction] PostHog SDK init failed:", error)
  }
}

export async function trackEvent(
  name: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const enabled = await isTelemetryEnabled()
  if (!enabled) return

  if (!sdkInitialized) {
    await initContentScriptAnalytics()
  }

  if (sdkInitialized) {
    try {
      posthog.capture(name, properties)
    } catch (error) {
      console.warn("[AIction] PostHog capture failed:", error)
    }
  }
}

// ── Background: HTTP capture API ────────────────────────────────

async function sendBackgroundEvent(
  name: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const enabled = await isTelemetryEnabled()
  if (!enabled) return

  const distinctId = await getAnonymousId()

  try {
    const response = await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        event: name,
        distinct_id: distinctId,
        properties: {
          ...(properties ?? {}),
          $lib: "aiction-background"
        }
      })
    })
    if (!response.ok) {
      console.warn("[AIction] PostHog capture HTTP error:", response.status)
    }
  } catch (error) {
    console.warn("[AIction] PostHog capture failed:", error)
  }
}

export async function trackBackgroundEvent(
  name: string,
  properties?: Record<string, unknown>
): Promise<void> {
  await sendBackgroundEvent(name, properties)
}

export function startBackgroundBatching(): void {
  // No-op: using immediate /capture/ instead of batched /batch/
}

export function stopBackgroundBatching(): void {
  // No-op
}
