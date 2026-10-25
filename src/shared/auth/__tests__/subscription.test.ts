/**
 * M3 服务层单测：`/v1/meta`、`/v1/models`、`/v1/me/usage`、结算会话。
 *
 * 这些模块的共同点是「服务端说了算」：客户端能做的只有
 * ① 正确解析（不认识的档位 / 模型 / 非法 URL 一律丢弃而不是猜）、
 * ② 缓存失败不缓存、③ 幂等（同一个点击不产生两个结算会话）。
 * 所以断言集中在「丢掉了什么」而不是「渲染成什么样」。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetAnonymousIdCache } from "@/shared/anonymous-id"
import {
  createCheckoutSession,
  isBillingInterval,
  isPurchasablePlan,
  isSafeCheckoutUrl,
  resetCheckoutCache
} from "@/shared/auth/billing"
import { clearMetaCache, compareVersions, getServerMeta, isClientOutdated, parseMeta } from "@/shared/auth/meta"
import {
  clearOfficialModelsCache,
  modelsForPlan,
  parseOfficialModels,
  resolveOfficialModel
} from "@/shared/auth/models"
import { configureAuthRequest, resetAuthRequest } from "@/shared/auth/request"
import { parseUsageSeries, peakTokens } from "@/shared/auth/usage"
import { hasPlanChanged, isPlanUpgrade } from "@/shared/auth/types"
import { installChromeStub, uninstallChromeStub } from "./chrome-stub"
import { installFetchStub, jsonResponse } from "./fetch-stub"

const originalFetch = globalThis.fetch

const metaPayload = {
  min_client_version: "0.7.0",
  maintenance: { active: true, message: "迁移中" },
  plans: [
    { id: "team", price: 50, currency: "CNY", interval: "month", quota_tokens: 1 }, // 未知档位 → 丢
    { id: "free", price: 0, currency: "CNY", interval: null, quota_tokens: 1 }, // 0 价 → 丢
    { id: "max", price: 20, currency: "CNY", interval: "month", quota_tokens: 4000 },
    { id: "pro", price: 10, currency: "CNY", interval: "month", quota_tokens: 2000 },
    { id: "pro", price: 10, currency: "", interval: "month", quota_tokens: 2000 }, // 缺货币 → 丢
    { id: "pro", price: 100, currency: "CNY", interval: "year", quota_tokens: 2000 }
  ]
}

const modelsPayload = {
  data: [
    {
      id: "aiction-pro",
      name: "AIction Pro",
      description: "",
      min_plan: "pro",
      context_chars: 200000,
      max_output_tokens: 8192,
      supports_reasoning: false,
      recommended: false
    },
    {
      id: "aiction-fast",
      name: "AIction Fast",
      description: "",
      min_plan: "anonymous",
      context_chars: 100000,
      max_output_tokens: 4096,
      supports_reasoning: false,
      recommended: true
    },
    { id: "", name: "没有 id" } // 丢
  ]
}

beforeEach(() => {
  installChromeStub()
  resetAnonymousIdCache()
  clearMetaCache()
  clearOfficialModelsCache()
  resetCheckoutCache()
  configureAuthRequest({
    getAccessToken: async () => "at-1",
    getPrincipalToken: async () => ({ token: "at-1", kind: "user" as const }),
    invalidateSession: async () => undefined
  })
})

afterEach(() => {
  uninstallChromeStub()
  resetAuthRequest()
  resetAnonymousIdCache()
  clearMetaCache()
  clearOfficialModelsCache()
  resetCheckoutCache()
  globalThis.fetch = originalFetch
})

describe("parseMeta", () => {
  it("丢掉未知档位 / 0 价档 / 缺货币的条目，并按权益高低排序", () => {
    const meta = parseMeta(metaPayload)!
    expect(meta.plans.map((offer) => `${offer.id}/${offer.interval}`)).toEqual([
      "pro/month",
      "pro/year",
      "max/month"
    ])
  })

  it("缺字段不抛错：maintenance / min_client_version 缺失时退化成「没设门槛」", () => {
    const meta = parseMeta({ plans: [] })!
    expect(meta.minClientVersion).toBe("")
    expect(meta.maintenance.active).toBe(false)
    expect(meta.maintenance.message).toBeNull()
  })

  it("结构不对 → null（不把 undefined 当空套餐表）", () => {
    expect(parseMeta(null)).toBeNull()
    expect(parseMeta("nope")).toBeNull()
  })
})

describe("compareVersions / isClientOutdated", () => {
  it("逐段比较，缺失段按 0 补齐", () => {
    expect(compareVersions("0.6.0", "0.7.0")).toBe(-1)
    expect(compareVersions("0.7.0", "0.7")).toBe(0)
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1)
  })

  it("无法解析的版本返回 null（不猜方向）", () => {
    expect(compareVersions("latest", "0.7.0")).toBeNull()
    expect(compareVersions("", "0.7.0")).toBeNull()
  })

  it("客户端低于门槛 → true；无法比较 / 未设门槛 → false（未知按可用处理）", () => {
    const meta = parseMeta(metaPayload)!
    expect(isClientOutdated(meta, "0.6.9")).toBe(true)
    expect(isClientOutdated(meta, "0.7.0")).toBe(false)
    expect(isClientOutdated(null, "0.1.0")).toBe(false)
    expect(isClientOutdated(parseMeta({ plans: [] })!, "0.1.0")).toBe(false)
    expect(isClientOutdated(meta, "unknown")).toBe(false)
  })
})

describe("parseOfficialModels / 档位过滤", () => {
  it("丢掉没有 id 的条目，按 min_plan 排序", () => {
    const models = parseOfficialModels(modelsPayload)!
    expect(models.map((model) => model.id)).toEqual(["aiction-fast", "aiction-pro"])
  })

  it("结构不对 → null，空数组是合法响应", () => {
    expect(parseOfficialModels({})).toBeNull()
    expect(parseOfficialModels({ data: [] })).toEqual([])
  })

  it("免费档只看到 anonymous/free 可用的模型", () => {
    const models = parseOfficialModels(modelsPayload)!
    expect(modelsForPlan(models, "free").map((model) => model.id)).toEqual(["aiction-fast"])
    expect(modelsForPlan(models, "pro").map((model) => model.id)).toEqual(["aiction-fast", "aiction-pro"])
  })

  it("用户偏好可用时优先；降档后偏好不可用则落到 recommended", () => {
    const models = parseOfficialModels(modelsPayload)!
    expect(resolveOfficialModel(models, "pro", "aiction-pro")).toBe("aiction-pro")
    // 降档到 free：aiction-pro 需要 pro，回落到 recommended 的 aiction-fast
    expect(resolveOfficialModel(models, "free", "aiction-pro")).toBe("aiction-fast")
    expect(resolveOfficialModel([], "pro")).toBeNull()
  })
})

describe("parseUsageSeries", () => {
  it("按日期排序并丢掉没有日期的点", () => {
    const series = parseUsageSeries({
      points: [
        { date: "2026-11-14", in_tokens: 10, out_tokens: 5, requests: 2 },
        { date: "", in_tokens: 1, out_tokens: 1, requests: 1 },
        { date: "2026-11-13", in_tokens: 1, out_tokens: 1, requests: 1 }
      ]
    })!
    expect(series.points.map((point) => point.date)).toEqual(["2026-11-13", "2026-11-14"])
    expect(peakTokens(series.points)).toBe(15)
  })

  it("points 不是数组 → null（不拿空图冒充零用量）", () => {
    expect(parseUsageSeries({})).toBeNull()
    expect(parseUsageSeries(null)).toBeNull()
  })
})

describe("结算会话", () => {
  it("只接受可购买的档位与合法周期（白名单在 background 侧也有一道）", () => {
    expect(isPurchasablePlan("pro")).toBe(true)
    expect(isPurchasablePlan("max")).toBe(true)
    expect(isPurchasablePlan("free")).toBe(false)
    expect(isPurchasablePlan("anonymous")).toBe(false)
    expect(isBillingInterval("month")).toBe(true)
    expect(isBillingInterval("week")).toBe(false)
  })

  it("URL 只放 http(s)：javascript: / 相对路径一律拒", () => {
    expect(isSafeCheckoutUrl("https://checkout.example.com/x")).toBe(true)
    expect(isSafeCheckoutUrl("http://127.0.0.1:8787/billing/checkout?session=cs_1")).toBe(true)
    expect(isSafeCheckoutUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeCheckoutUrl("/billing/checkout")).toBe(false)
  })

  it("请求带 Idempotency-Key；同 plan + interval 在窗口内复用，不打第二次", async () => {
    const calls = installFetchStub([
      () => jsonResponse(200, { url: "https://checkout.example.com/cs_1", session_id: "cs_1" })
    ])

    await expect(createCheckoutSession({ plan: "pro", interval: "month" })).resolves.toBe(
      "https://checkout.example.com/cs_1"
    )
    const headers = new Headers(calls[0].init.headers)
    expect(headers.get("Idempotency-Key")).toBeTruthy()
    expect(headers.get("Authorization")).toBe("Bearer at-1")

    await expect(createCheckoutSession({ plan: "pro", interval: "month" })).resolves.toBe(
      "https://checkout.example.com/cs_1"
    )
    expect(calls).toHaveLength(1)
  })

  it("换周期会重新创建会话（不同商品不能复用同一个 key）", async () => {
    const calls = installFetchStub([
      () => jsonResponse(200, { url: "https://checkout.example.com/cs_1" }),
      () => jsonResponse(200, { url: "https://checkout.example.com/cs_2" })
    ])

    await createCheckoutSession({ plan: "pro", interval: "month" })
    await expect(createCheckoutSession({ plan: "pro", interval: "year" })).resolves.toBe(
      "https://checkout.example.com/cs_2"
    )
    expect(calls).toHaveLength(2)
  })

  it("服务端返回非法地址 → 抛错（不打开一个 javascript: 链接）", async () => {
    installFetchStub([() => jsonResponse(200, { url: "javascript:alert(1)" })])
    await expect(createCheckoutSession({ plan: "max", interval: "month" })).rejects.toThrow()
  })

  it("档位变化判定：升级只认「变高」，任何方向的变化都算「变了」", () => {
    expect(isPlanUpgrade("free", "pro")).toBe(true)
    expect(isPlanUpgrade("pro", "free")).toBe(false)
    expect(hasPlanChanged("pro", "free")).toBe(true)
    expect(hasPlanChanged("pro", "pro")).toBe(false)
  })
})

describe("失败不写缓存", () => {
  it("/v1/meta 500 → null，且下一次请求会重试（没被钉住一整个 TTL）", async () => {
    const calls = installFetchStub([
      () => jsonResponse(500, { error: { code: "internal" } }),
      () => jsonResponse(200, metaPayload)
    ])

    await expect(getServerMeta()).resolves.toBeNull()
    const meta = await getServerMeta()
    expect(meta?.plans).toHaveLength(3)
    expect(calls).toHaveLength(2)
  })
})
