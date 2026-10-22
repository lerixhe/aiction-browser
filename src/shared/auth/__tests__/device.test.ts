/**
 * 匿名设备 token（SPEC §6.4 / §12.1）。
 *
 * 关键口径：**失败一律静默降级为 null**（429 / 网络 / 5xx），
 * 因为匿名用户本来就没有「必须成功」的契约；但客户端配置错误（400）要抛出来。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetAnonymousIdCache } from "@/shared/anonymous-id"
import { DEVICE_RENEW_BUFFER_MS } from "@/shared/auth/config"
import { ensureDeviceToken } from "@/shared/auth/device"
import { resetAuthRequest } from "@/shared/auth/request"
import { AUTH_STORAGE_KEYS } from "@/shared/auth/types"
import { installChromeStub, uninstallChromeStub, type StorageStub } from "./chrome-stub"
import { installFetchStub, jsonResponse } from "./fetch-stub"

const originalFetch = globalThis.fetch

const deviceOk = (token = "device-token-1", expiresIn = 30 * 24 * 60 * 60) =>
  jsonResponse(200, { access_token: token, token_type: "Bearer", expires_in: expiresIn })

let stub: StorageStub

beforeEach(() => {
  stub = installChromeStub({ runtimeId: "ext-under-test" })
  resetAnonymousIdCache()
  resetAuthRequest()
})

afterEach(() => {
  uninstallChromeStub()
  resetAnonymousIdCache()
  globalThis.fetch = originalFetch
})

describe("ensureDeviceToken", () => {
  it("首次领取：POST /auth/device 并落盘", async () => {
    const calls = installFetchStub([() => deviceOk()])

    await expect(ensureDeviceToken()).resolves.toBe("device-token-1")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain("/auth/device")
    expect(calls[0].init.method).toBe("POST")

    const body = JSON.parse(String(calls[0].init.body)) as Record<string, string>
    expect(body.device_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.ext_id).toBe("ext-under-test")
    expect(body.platform).toMatch(/^(chrome|firefox|edge)$/)

    const stored = stub.local.get(AUTH_STORAGE_KEYS.deviceToken) as { token: string; expiresAt: number }
    expect(stored.token).toBe("device-token-1")
    expect(stored.expiresAt).toBeGreaterThan(Date.now())
  })

  it("复用同一个匿名 ID（不新建第二个 UUID）", async () => {
    stub.local.set("aiction:anonymousId", "fixed-anonymous-id")
    const calls = installFetchStub([() => deviceOk()])

    await ensureDeviceToken()
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, string>
    expect(body.device_id).toBe("fixed-anonymous-id")
  })

  it("缓存剩余有效期 > 7 天 → 不请求", async () => {
    stub.local.set(AUTH_STORAGE_KEYS.deviceToken, {
      token: "cached-token",
      expiresAt: Date.now() + DEVICE_RENEW_BUFFER_MS + 24 * 60 * 60_000
    })
    const calls = installFetchStub([() => deviceOk()])

    await expect(ensureDeviceToken()).resolves.toBe("cached-token")
    expect(calls).toHaveLength(0)
  })

  it("进入 7 天续签窗口 → 重新领取并覆盖", async () => {
    stub.local.set(AUTH_STORAGE_KEYS.deviceToken, {
      token: "old-token",
      expiresAt: Date.now() + DEVICE_RENEW_BUFFER_MS - 60_000
    })
    const calls = installFetchStub([() => deviceOk("new-token")])

    await expect(ensureDeviceToken()).resolves.toBe("new-token")
    expect(calls).toHaveLength(1)
    expect((stub.local.get(AUTH_STORAGE_KEYS.deviceToken) as { token: string }).token).toBe("new-token")
  })

  it("429 → null（静默降级，不落盘）", async () => {
    installFetchStub([() => jsonResponse(429, { error: { code: "rate_limited" } })])

    await expect(ensureDeviceToken()).resolves.toBeNull()
    expect(stub.local.has(AUTH_STORAGE_KEYS.deviceToken)).toBe(false)
  })

  it("网络异常 → null", async () => {
    installFetchStub([
      () => {
        throw new TypeError("Failed to fetch")
      }
    ])

    await expect(ensureDeviceToken()).resolves.toBeNull()
  })

  it("5xx → null（服务端抖动不该让匿名态报错）", async () => {
    installFetchStub([() => jsonResponse(503, { error: { code: "maintenance" } })])

    await expect(ensureDeviceToken()).resolves.toBeNull()
  })

  it("400 invalid_request → 抛（客户端 bug 必须暴露）", async () => {
    installFetchStub([() => jsonResponse(400, { error: { code: "invalid_request" } })])

    await expect(ensureDeviceToken()).rejects.toMatchObject({ code: "SERVER_ERROR" })
  })

  it("响应缺 access_token → null（不存空 token）", async () => {
    installFetchStub([() => jsonResponse(200, { expires_in: 3600 })])

    await expect(ensureDeviceToken()).resolves.toBeNull()
    expect(stub.local.has(AUTH_STORAGE_KEYS.deviceToken)).toBe(false)
  })
})
