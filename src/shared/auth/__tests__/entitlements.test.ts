/**
 * 权益快照（SPEC §6.7 / §12.1）。
 *
 * 三条口径：缓存 5 分钟、`force` 越过 TTL、**失败不写缓存**（否则一次 500 会把
 * 「没有权益」这个结论钉死一整个 TTL，用户刚充完钱也看不到变化）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetAnonymousIdCache } from "@/shared/anonymous-id"
import {
  clearEntitlementsCache,
  entitlementsToSnapshot,
  getEntitlements,
  parseEntitlements,
  quotaFromHeaders
} from "@/shared/auth/entitlements"
import { configureAuthRequest, resetAuthRequest } from "@/shared/auth/request"
import { installChromeStub, uninstallChromeStub } from "./chrome-stub"
import { installFetchStub, jsonResponse } from "./fetch-stub"

const originalFetch = globalThis.fetch

const fullResponse = {
  principal: { kind: "user", id: "user-1", email: "u***@example.com", created_at: "2026-01-01T00:00:00Z" },
  plan: "pro",
  subscription: {
    status: "active",
    provider: "paddle",
    period_end: "2026-12-01T00:00:00Z",
    cancel_at_period_end: true,
    manage_url: "https://aiction.app/billing"
  },
  quota: {
    unit: "tokens",
    limit: 1000,
    used: 250,
    reserved: 10,
    reset_at: "2026-12-01T00:00:00Z",
    window: "subscription"
  },
  features: { models: ["aiction-fast", "aiction-pro"], max_output_tokens: 8192, concurrency: 3, context_chars: 200000 },
  server_time: "2026-10-22T00:00:00Z"
}

beforeEach(() => {
  installChromeStub()
  resetAnonymousIdCache()
  clearEntitlementsCache()
  configureAuthRequest({
    getAccessToken: async () => "at-1",
    invalidateSession: async () => undefined
  })
})

afterEach(() => {
  uninstallChromeStub()
  resetAuthRequest()
  resetAnonymousIdCache()
  clearEntitlementsCache()
  globalThis.fetch = originalFetch
})

describe("parseEntitlements", () => {
  it("完整响应：snake_case → camelCase 全量映射", () => {
    const parsed = parseEntitlements(fullResponse)
    expect(parsed).toMatchObject({
      principal: { kind: "user", id: "user-1", email: "u***@example.com", createdAt: "2026-01-01T00:00:00Z" },
      plan: "pro",
      subscription: {
        status: "active",
        provider: "paddle",
        periodEnd: "2026-12-01T00:00:00Z",
        cancelAtPeriodEnd: true,
        manageUrl: "https://aiction.app/billing"
      },
      quota: { unit: "tokens", limit: 1000, used: 250, reserved: 10, resetAt: "2026-12-01T00:00:00Z", window: "subscription" },
      features: { models: ["aiction-fast", "aiction-pro"], maxOutputTokens: 8192, concurrency: 3, contextChars: 200000 },
      serverTime: "2026-10-22T00:00:00Z"
    })
    expect(parsed?.fetchedAt).toBeGreaterThan(0)
  })

  it("缺 plan → null（未知档位不能猜成 free）", () => {
    expect(parseEntitlements({ ...fullResponse, plan: undefined })).toBeNull()
  })

  it("plan 不在枚举内 → null", () => {
    expect(parseEntitlements({ ...fullResponse, plan: "enterprise" })).toBeNull()
  })

  it("缺 principal.kind / id → null（快照无法渲染）", () => {
    expect(parseEntitlements({ ...fullResponse, principal: { id: "user-1" } })).toBeNull()
    expect(parseEntitlements({ ...fullResponse, principal: { kind: "user" } })).toBeNull()
  })

  it("非对象输入 → null", () => {
    expect(parseEntitlements(null)).toBeNull()
    expect(parseEntitlements("nope")).toBeNull()
  })

  it("可选字段缺失时给缺省值（契约 §10：缺字段不抛错）", () => {
    const parsed = parseEntitlements({
      principal: { kind: "device", id: "device-1" },
      plan: "anonymous"
    })
    expect(parsed).toMatchObject({
      principal: { kind: "device", id: "device-1" },
      plan: "anonymous",
      subscription: { status: "none", provider: "none", periodEnd: null, manageUrl: null },
      quota: { limit: 0, used: 0, reserved: 0, resetAt: "", window: "subscription" },
      features: { models: [], maxOutputTokens: 0, concurrency: 0, contextChars: 0 }
    })
    expect(parsed?.principal.email).toBeUndefined()
  })

  it("未知的订阅状态 / 支付渠道 → 落到 none", () => {
    const parsed = parseEntitlements({
      ...fullResponse,
      subscription: { status: "weird", provider: "alipay" }
    })
    expect(parsed?.subscription.status).toBe("none")
    expect(parsed?.subscription.provider).toBe("none")
  })

  it("features.models 过滤非字符串项", () => {
    const parsed = parseEntitlements({
      ...fullResponse,
      features: { models: ["aiction-fast", 42, null, "aiction-pro"] }
    })
    expect(parsed?.features.models).toEqual(["aiction-fast", "aiction-pro"])
  })
})

describe("getEntitlements", () => {
  it("成功 → 缓存，5 分钟内不重复请求", async () => {
    const calls = installFetchStub([() => jsonResponse(200, fullResponse)])

    await expect(getEntitlements()).resolves.toMatchObject({ plan: "pro" })
    await getEntitlements()
    await getEntitlements()

    expect(calls).toHaveLength(1)
  })

  it("force 越过 TTL", async () => {
    const calls = installFetchStub([() => jsonResponse(200, fullResponse)])

    await getEntitlements()
    await getEntitlements({ force: true })

    expect(calls).toHaveLength(2)
  })

  it("并发合并成一次上游请求", async () => {
    const calls = installFetchStub([() => jsonResponse(200, fullResponse)])

    const results = await Promise.all([getEntitlements(), getEntitlements(), getEntitlements()])

    expect(calls).toHaveLength(1)
    expect(results.every((item) => item?.plan === "pro")).toBe(true)
  })

  it("失败返回 null 且**不写缓存**（下一次能重试成功）", async () => {
    const calls = installFetchStub([
      () => jsonResponse(500, { error: { code: "internal" } }),
      () => jsonResponse(200, fullResponse)
    ])

    await expect(getEntitlements()).resolves.toBeNull()
    // 失败没有把「null」缓存进 TTL，所以下一次会真的再请求
    await expect(getEntitlements()).resolves.toMatchObject({ plan: "pro" })
    expect(calls).toHaveLength(2)
  })

  it("401 → null（交给会话层处理，不在权益层抛）", async () => {
    installFetchStub([() => jsonResponse(401, { error: { code: "token_invalid" } })])
    await expect(getEntitlements()).resolves.toBeNull()
  })

  it("响应结构无效 → null，不写缓存", async () => {
    installFetchStub([() => jsonResponse(200, { principal: {}, plan: "pro" })])
    await expect(getEntitlements()).resolves.toBeNull()

    installFetchStub([() => jsonResponse(200, fullResponse)])
    await expect(getEntitlements()).resolves.toMatchObject({ plan: "pro" })
  })
})

describe("entitlementsToSnapshot", () => {
  it("额度换算成比例，并保留 resetAt", () => {
    const snapshot = entitlementsToSnapshot(parseEntitlements(fullResponse)!)
    expect(snapshot.plan).toBe("pro")
    expect(snapshot.principalKind).toBe("user")
    expect(snapshot.email).toBe("u***@example.com")
    expect(snapshot.quota).toEqual({ usedRatio: 0.25, resetAt: "2026-12-01T00:00:00Z" })
  })

  it("used 超过 limit 时钳制到 1", () => {
    const parsed = parseEntitlements({ ...fullResponse, quota: { ...fullResponse.quota, used: 5000 } })!
    expect(entitlementsToSnapshot(parsed).quota?.usedRatio).toBe(1)
  })

  it("limit 为 0 或缺少 resetAt → quota 为 null（未知，不是 0%）", () => {
    const noLimit = parseEntitlements({ ...fullResponse, quota: { ...fullResponse.quota, limit: 0 } })!
    expect(entitlementsToSnapshot(noLimit).quota).toBeNull()

    const noReset = parseEntitlements({ ...fullResponse, quota: { ...fullResponse.quota, reset_at: "" } })!
    expect(entitlementsToSnapshot(noReset).quota).toBeNull()
  })

  it("device 主体的快照不带 email", () => {
    const parsed = parseEntitlements({ principal: { kind: "device", id: "device-1" }, plan: "anonymous" })!
    const snapshot = entitlementsToSnapshot(parsed)
    expect(snapshot.principalKind).toBe("device")
    expect(snapshot.email).toBeUndefined()
  })
})

describe("quotaFromHeaders（契约 §1.5 的额度校准）", () => {
  it("取 limit / used / reset 并算成比例", () => {
    expect(
      quotaFromHeaders({
        "X-Quota-Unit": "tokens",
        "X-Quota-Limit": "3000000",
        "X-Quota-Used": "1500000",
        "X-Quota-Reset": "2026-12-01T00:00:00Z",
        "X-Plan": "pro"
      })
    ).toEqual({ usedRatio: 0.5, resetAt: "2026-12-01T00:00:00Z" })
  })

  it("头名大小写不敏感（AI SDK 给的是普通对象，不是 Headers）", () => {
    expect(
      quotaFromHeaders({ "x-quota-limit": "100", "x-quota-used": "10", "x-quota-reset": "2026-12-01T00:00:00Z" })
    ).toEqual({ usedRatio: 0.1, resetAt: "2026-12-01T00:00:00Z" })
  })

  it("缺 limit / reset 或数值不合法 → null（未知，不是 0%）", () => {
    expect(quotaFromHeaders(undefined)).toBeNull()
    expect(quotaFromHeaders({})).toBeNull()
    expect(quotaFromHeaders({ "x-quota-limit": "0", "x-quota-used": "1", "x-quota-reset": "r" })).toBeNull()
    expect(quotaFromHeaders({ "x-quota-limit": "100", "x-quota-used": "NaN", "x-quota-reset": "r" })).toBeNull()
    expect(quotaFromHeaders({ "x-quota-limit": "100", "x-quota-used": "1" })).toBeNull()
  })

  it("used 超过 limit 时钳制到 1（同周期最后一次请求允许超额）", () => {
    expect(
      quotaFromHeaders({ "x-quota-limit": "100", "x-quota-used": "180", "x-quota-reset": "2026-12-01T00:00:00Z" })
    ).toEqual({ usedRatio: 1, resetAt: "2026-12-01T00:00:00Z" })
  })
})
