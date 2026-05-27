import posthog from "posthog-js/dist/module.no-external"

const POSTHOG_PROJECT_TOKEN = "phc_tPo8ytSVcKEozs6qbNTWEkDTnqXoxUoBuaNo2fu7v2Rh"
const POSTHOG_HOST = "https://us.i.posthog.com"

const ANONYMOUS_ID_KEY = "aiction:anonymousId"

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

// ── Content Script: PostHog SDK ─────────────────────────────────

let sdkInitialized = false

export async function initContentScriptAnalytics(): Promise<void> {
  if (sdkInitialized) return

  const enabled = await isTelemetryEnabled()
  if (!enabled) return

  const distinctId = await getAnonymousId()

  try {
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
    sdkInitialized = true
  } catch (error) {
    console.warn("[Aiction] PostHog SDK init failed:", error)
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
      console.warn("[Aiction] PostHog capture failed:", error)
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
      console.warn("[Aiction] PostHog capture HTTP error:", response.status)
    }
  } catch (error) {
    console.warn("[Aiction] PostHog capture failed:", error)
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
