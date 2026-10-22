/**
 * 认证请求层（SPEC §6.5 / §12.1）。
 *
 * 这里钉的是「出错时**到底该不该踢人下线**」：401 token_expired 要刷新重试一次，
 * 其余 401 立刻登出；402/429/5xx/网络错误一律**保留会话**只报错。
 * 一次 500 就把用户踢下线、或并发刷新导致后到的 token 失效，都是线上事故。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetAnonymousIdCache } from "@/shared/anonymous-id"
import { AuthError } from "@/shared/auth/errors"
import { apiJson, authFetch, configureAuthRequest, resetAuthRequest } from "@/shared/auth/request"
import type { AuthTokenProvider } from "@/shared/auth/request"
import { installChromeStub, uninstallChromeStub } from "./chrome-stub"

const originalFetch = globalThis.fetch

type FetchCall = { url: string; init: RequestInit }

function installFetchStub(factories: Array<() => Response | Promise<Response>>): FetchCall[] {
  const calls: FetchCall[] = []
  let index = 0
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const factory = factories[Math.min(index, factories.length - 1)]
    index++
    return factory()
  }) as unknown as typeof fetch
  return calls
}

const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const unauthorized = (code?: string) =>
  jsonResponse(401, code ? { error: { code, message: "nope" } } : { error: { message: "no code" } })

let invalidations: string[] = []

function configure(token: string | AuthTokenProvider) {
  invalidations = []
  configureAuthRequest({
    getAccessToken:
      typeof token === "string"
        ? async () => token
        : token,
    invalidateSession: async (reason) => {
      invalidations.push(reason)
    }
  })
}

beforeEach(() => {
  installChromeStub({ runtimeId: "ext-under-test" })
  resetAnonymousIdCache()
  resetAuthRequest()
})

afterEach(() => {
  uninstallChromeStub()
  resetAuthRequest()
  resetAnonymousIdCache()
  globalThis.fetch = originalFetch
})

describe("请求头", () => {
  it("注入契约 §1.3 的四个通用头与 Authorization", async () => {
    configure("at-1")
    const calls = installFetchStub([() => jsonResponse(200)])

    await authFetch("/v1/me")
    const headers = new Headers(calls[0].init.headers)

    expect(headers.get("X-Ext-Id")).toBe("ext-under-test")
    expect(headers.get("X-Client-Version")).toBe("0.0.0-test")
    expect(headers.get("X-Device-Id")).toMatch(/^[0-9a-f-]{36}$/)
    expect(headers.get("X-Platform")).toMatch(/^(chrome|firefox|edge)$/)
    expect(headers.get("Authorization")).toBe("Bearer at-1")
  })

  it("auth: false 时不带 Authorization（/auth/* 无认证端点）", async () => {
    configure("at-1")
    const calls = installFetchStub([() => jsonResponse(200)])

    await authFetch("/auth/device", { auth: false, method: "POST" })
    const headers = new Headers(calls[0].init.headers)

    expect(headers.get("Authorization")).toBeNull()
    expect(headers.get("X-Ext-Id")).toBe("ext-under-test")
  })

  it("cache: no-store 默认生效，调用方可覆盖", async () => {
    configure("at-1")
    const calls = installFetchStub([() => jsonResponse(200)])

    await authFetch("/v1/me")
    expect(calls[0].init.cache).toBe("no-store")

    await authFetch("/v1/me", { cache: "default" })
    expect(calls[1].init.cache).toBe("default")
  })
})

describe("凭证来源", () => {
  it("NO_SESSION 直接冒泡，不拼空 Bearer", async () => {
    configure(async () => {
      throw new AuthError("NO_SESSION")
    })
    const calls = installFetchStub([() => jsonResponse(200)])

    await expect(authFetch("/v1/me")).rejects.toMatchObject({ code: "NO_SESSION" })
    expect(calls).toHaveLength(0)
  })

  it("未注册 token provider 时报配置错误（说明绕过了 session.ts）", async () => {
    installFetchStub([() => jsonResponse(200)])
    await expect(authFetch("/v1/me")).rejects.toMatchObject({ code: "SERVER_ERROR" })
  })
})

describe("401 救援", () => {
  it("token_expired → 强制刷新一次后重试成功", async () => {
    const tokens = ["stale-token", "fresh-token"]
    let providerCalls = 0
    configure(async (options) => {
      providerCalls++
      return options?.force ? tokens[1] : tokens[0]
    })

    const calls = installFetchStub([() => unauthorized("token_expired"), () => jsonResponse(200, { ok: true })])

    const response = await authFetch("/v1/me")
    expect(response.status).toBe(200)
    expect(providerCalls).toBe(2)
    expect(calls).toHaveLength(2)
    // 重试请求带的是刷新后的 token
    expect(new Headers(calls[1].init.headers).get("Authorization")).toBe("Bearer fresh-token")
    // 内部重试标记不能泄漏到 fetch init
    expect("__retried" in calls[1].init).toBe(false)
    expect(invalidations).toHaveLength(0)
  })

  it("重试后仍 401 → 不再刷新，直接登出（不循环）", async () => {
    let providerCalls = 0
    configure(async () => {
      providerCalls++
      return "token"
    })
    const calls = installFetchStub([() => unauthorized("token_expired")])

    await expect(authFetch("/v1/me")).rejects.toMatchObject({ code: "REFRESH_REVOKED" })
    expect(calls).toHaveLength(2) // 原始 + 一次重试
    expect(providerCalls).toBe(2) // 首次取 token + 强制刷新
    expect(invalidations).toEqual(["REFRESH_REVOKED"])
  })

  it("401 token_invalid → 不刷新，直接登出", async () => {
    let providerCalls = 0
    configure(async () => {
      providerCalls++
      return "token"
    })
    const calls = installFetchStub([() => unauthorized("token_invalid")])

    await expect(authFetch("/v1/me")).rejects.toMatchObject({ code: "REFRESH_REVOKED" })
    expect(calls).toHaveLength(1)
    expect(providerCalls).toBe(1)
    expect(invalidations).toEqual(["REFRESH_REVOKED"])
  })

  it("401 无 error.code → 同样按 token_invalid 处理（不猜）", async () => {
    configure("token")
    installFetchStub([() => unauthorized()])

    await expect(authFetch("/v1/me")).rejects.toMatchObject({ code: "REFRESH_REVOKED" })
    expect(invalidations).toEqual(["REFRESH_REVOKED"])
  })

  it("auth: false 的 401 不触发登出（device 端点异常不该清会话）", async () => {
    configure("token")
    installFetchStub([() => unauthorized("token_invalid")])

    await expect(authFetch("/auth/device", { auth: false })).rejects.toMatchObject({ code: "REFRESH_REVOKED" })
    expect(invalidations).toHaveLength(0)
  })
})

describe("错误归类（只看状态码）", () => {
  it.each([
    [402, "QUOTA_EXCEEDED"],
    [429, "RATE_LIMITED"],
    [500, "SERVER_ERROR"],
    [502, "SERVER_ERROR"],
    [400, "SERVER_ERROR"],
    [404, "SERVER_ERROR"]
  ])("%i → %s", async (status, expected) => {
    configure("token")
    installFetchStub([() => jsonResponse(status, { error: { code: "whatever" } })])

    await expect(authFetch("/v1/me")).rejects.toMatchObject({ code: expected })
    expect(invalidations).toHaveLength(0) // 都不该登出
  })

  it("网络异常 → NETWORK（保留会话）", async () => {
    configure("token")
    installFetchStub([
      () => {
        throw new TypeError("Failed to fetch")
      }
    ])

    await expect(authFetch("/v1/me")).rejects.toMatchObject({ code: "NETWORK" })
    expect(invalidations).toHaveLength(0)
  })
})

describe("apiJson", () => {
  it("解析成功", async () => {
    configure("token")
    installFetchStub([() => jsonResponse(200, { plan: "pro" })])

    await expect(apiJson<{ plan: string }>("/v1/me")).resolves.toEqual({ plan: "pro" })
  })

  it("响应体不是 JSON → SERVER_ERROR（不静默成 undefined）", async () => {
    configure("token")
    installFetchStub([() => new Response("<html>oops</html>", { status: 200 })])

    await expect(apiJson("/v1/me")).rejects.toMatchObject({ code: "SERVER_ERROR" })
  })
})
