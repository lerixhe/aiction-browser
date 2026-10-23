// 入口用 slim + no-external 而不是默认的 module.js：`no-external` 把 rrweb 等外部依赖排出 bundle，
// `slim` 再去掉可选扩展（surveys / 录屏 / 异常自动捕获 / 热图等，本项目的 init 全部关了）。
// 两者相加比 `module.no-external` 少约 190 KB（见 docs/ANALYTICS.md §1.1）。
// 代价：将来要用这些扩展（如 `captureException`）必须手动注册，否则调用静默无效。
import posthog from "posthog-js/dist/module.slim.no-external"

import { getAnonymousId } from "@/shared/anonymous-id"
import { scrubCredentials } from "@/shared/redact"

// 匿名设备标识是基础设施（账号风控与 device token 共用），实现已抽到 `anonymous-id.ts` 以免
// 只想拿 ID 的模块被 posthog 拖下水；这里 re-export 保持原有 import 路径不变
export { getAnonymousId } from "@/shared/anonymous-id"

const POSTHOG_PROJECT_TOKEN = "phc_tPo8ytSVcKEozs6qbNTWEkDTnqXoxUoBuaNo2fu7v2Rh"
const POSTHOG_HOST = "https://us.i.posthog.com"

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

/**
 * 额度使用率分桶（`quota_banner_shown.used_ratio_bucket`）。
 *
 * 只报档位不报精确比例：精确值对「要不要引导升级」没有增量信息，
 * 但能区分「零使用」与「快用完」——而这两者的转化意图完全不同。
 * `unknown` 是真实取值：面板侧不知道 plan / 额度（只拿到失败归因），不能默认为 0。
 */
export function usedRatioBucket(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "unknown"
  if (ratio <= 0) return "0"
  if (ratio < 0.5) return "<50"
  if (ratio < 0.8) return "<80"
  if (ratio < 1) return "<100"
  return "100"
}

// ── 上报出口的凭据护栏（机制保证，见 docs/ANALYTICS.md §3.11）────────
//
// 业务侧怎么写都不影响这条底线：**API Key / Token 永远不会离开本机**。
// 两个动作：① 剔除凭据类属性名（归一化后匹配）；② 对每个字符串值做秘密形态扫描。
// provider 其它元信息（名称 / 端点地址 / 模型名）**允许上报**（按产品决定），不在此列。

/** 归一化后禁止作为属性名出现的键（只限凭据） */
const FORBIDDEN_PROPERTY_KEYS = new Set(
  [
    "apikey",
    "key",
    "keys",
    "token",
    "tokens",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "auth",
    "authorization",
    "authheader",
    "credential",
    "credentials",
    "secret",
    "clientsecret",
    "password",
    "passphrase"
  ]
)

function normalizePropertyKey(key: string): string {
  return key.replace(/[_\-.]/g, "").toLowerCase()
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubCredentials(value)
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue)
  }
  if (value && typeof value === "object") {
    return sanitizeProperties(value as Record<string, unknown>)
  }
  return value
}

/**
 * 出口护栏：剔除凭据属性名，并对值做秘密形态打码。
 * `$` 开头的 PostHog 保留属性不改名（值依旧打码）。
 */
export function sanitizeProperties(
  properties?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!properties) {
    return undefined
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_PROPERTY_KEYS.has(normalizePropertyKey(key))) {
      if (import.meta.env?.DEV) {
        console.warn(`[AIction] 埋点属性 “${key}” 被出口护栏剔除（凭据类字段禁止上报）`)
      }
      continue
    }
    result[key] = scrubValue(value)
  }
  return result
}

// ── Anonymous ID ────────────────────────────────────────────────
// 实现见 `@/shared/anonymous-id`（上方 re-export）：全扩展只有一个 anonymousId，
// 由 getAnonymousId() 懒生成并缓存。

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

      if (!posthog.__loaded) {
        posthog.init(POSTHOG_PROJECT_TOKEN, {
          api_host: POSTHOG_HOST,
          persistence: "memory",
          // 身份必须在 init 时经 bootstrap 传入（不能改用 loaded 里的 identify）：
          // `memory` 不跨页面加载保留 ID，SDK 每次 init 都会先凭空铸一个匿名 ID，
          // 之后 identify() 再把它 merge 进我们的稳定 person。页面刷新一次就多挂一个
          // distinct_id，累积到 PostHog 的 person distinct-ID 上限后，该 person 的事件
          // 不再出现在 person 详情页与 session 标签里（posthog-js 会就此打一条 console 警告）。
          // isIdentifiedID: true 等价于原来 identify() 之后的状态（视为已识别用户）。
          // 见 docs/ANALYTICS.md「上报机制」一节。
          bootstrap: { distinctID: distinctId, isIdentifiedID: true },
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          // 新版字段名（旧名 `advanced_disable_decide` 已 deprecated，设了会打 console 警告）
          advanced_disable_flags: true
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
      posthog.capture(name, sanitizeProperties(properties))
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
          ...(sanitizeProperties(properties) ?? {}),
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
