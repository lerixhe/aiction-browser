/**
 * 会话内核（SPEC §6.6 / §12.1 的 U1–U12）。
 *
 * 这组用例保护的是**最容易造成线上事故的四件事**：
 * 并发刷新把用户踢下线、登出后被迟到的刷新「复活」、一次 500 就丢会话、无会话时发空 Bearer。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 埋点用 spy 代替真实上报：真实实现会走 posthog + fetch，
 * 会把 fetch 桩的调用计数搅乱（本文件大量断言「只发一次请求」）。
 */
const { authEvents } = vi.hoisted(() => ({
  authEvents: [] as Array<{ name: string; props?: Record<string, unknown> }>
}))

vi.mock("@/shared/analytics", () => ({
  trackEvent: async () => undefined,
  trackBackgroundEvent: async (name: string, props?: Record<string, unknown>) => {
    authEvents.push({ name, props })
  }
}))
import { resetAnonymousIdCache } from "@/shared/anonymous-id"
import { PENDING_TTL_MS } from "@/shared/auth/config"
import { clearEntitlementsCache } from "@/shared/auth/entitlements"
import {
  getAccessToken,
  initializeSession,
  resetAuthSession,
  signIn,
  signOut
} from "@/shared/auth/session"
import {
  readAccess,
  readPending,
  readSnapshot,
  readSession,
  writeDeviceToken,
  writePending,
  writePersisted,
  writeSession,
  writeSnapshot
} from "@/shared/auth/storage"
import { AUTH_STORAGE_KEYS } from "@/shared/auth/types"
import { installChromeStub, uninstallChromeStub, type StorageStub } from "./chrome-stub"
import { installFetchStub, jsonResponse, nextTick, unauthorized } from "./fetch-stub"

const originalFetch = globalThis.fetch
let stub: StorageStub

const MINUTE = 60_000

function seedSession(overrides: { accessTokenExpiresAt?: number; accessToken?: string } = {}) {
  return writeSession({
    userId: "u-1",
    plan: "pro",
    refreshToken: "rt-1",
    accessToken: overrides.accessToken ?? "at-1",
    accessTokenExpiresAt: overrides.accessTokenExpiresAt ?? Date.now() + 60 * MINUTE
  })
}

const refreshOk = (access = "at-2", refresh = "rt-2") =>
  jsonResponse(200, { access_token: access, refresh_token: refresh, expires_in: 900 })

const tokenExchangeOk = () =>
  jsonResponse(200, {
    access_token: "at-login",
    refresh_token: "rt-login",
    token_type: "Bearer",
    expires_in: 900,
    user: { id: "user-1", email: "u***@example.com" },
    plan: "free"
  })

const entitlementsOk = (plan = "pro", limit = 1000, used = 250) =>
  jsonResponse(200, {
    principal: { kind: "user", id: "user-1", email: "u***@example.com" },
    plan,
    subscription: { status: "active", provider: "none", period_end: null, cancel_at_period_end: false, manage_url: null },
    quota: { unit: "tokens", limit, used, reserved: 0, reset_at: "2026-12-01T00:00:00Z", window: "subscription" },
    features: { models: ["aiction-fast"], max_output_tokens: 8192, concurrency: 3, context_chars: 200000 },
    server_time: "2026-10-22T00:00:00Z"
  })

beforeEach(() => {
  authEvents.length = 0
  stub = installChromeStub()
  resetAuthSession()
  clearEntitlementsCache()
  resetAnonymousIdCache()
})

afterEach(() => {
  uninstallChromeStub()
  resetAuthSession()
  clearEntitlementsCache()
  resetAnonymousIdCache()
  globalThis.fetch = originalFetch
})

describe("getAccessToken", () => {
  it("无会话 → NO_SESSION，且不发请求", async () => {
    const calls = installFetchStub([() => refreshOk()])

    await expect(getAccessToken()).rejects.toMatchObject({ code: "NO_SESSION" })
    expect(calls).toHaveLength(0)
  })

  it("未临期 → 直接返回，不发请求", async () => {
    await seedSession()
    const calls = installFetchStub([() => refreshOk()])

    await expect(getAccessToken()).resolves.toBe("at-1")
    expect(calls).toHaveLength(0)
  })

  it("剩余不足 5 分钟 → 刷新，并写回轮换后的 refresh token", async () => {
    await seedSession({ accessTokenExpiresAt: Date.now() + MINUTE })
    const calls = installFetchStub([() => refreshOk("at-2", "rt-2")])

    await expect(getAccessToken()).resolves.toBe("at-2")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain("/auth/refresh")
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ refresh_token: "rt-1" })

    const session = await readSession()
    expect(session).toMatchObject({ accessToken: "at-2", refreshToken: "rt-2" })
  })

  it("force 越过「未临期」判断", async () => {
    await seedSession()
    const calls = installFetchStub([() => refreshOk("at-forced")])

    await expect(getAccessToken({ force: true })).resolves.toBe("at-forced")
    expect(calls).toHaveLength(1)
  })

  it("并发 10 次 → 只发一次 refresh，拿到同一 token（单飞）", async () => {
    await seedSession({ accessTokenExpiresAt: Date.now() + MINUTE })
    const calls = installFetchStub([() => refreshOk("at-shared")])

    const results = await Promise.all(Array.from({ length: 10 }, () => getAccessToken({ force: true })))

    expect(calls).toHaveLength(1)
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe("at-shared")
  })

  it("refresh 返回 401 refresh_revoked → 清会话 + 广播 signed-out，不重试", async () => {
    await seedSession({ accessTokenExpiresAt: Date.now() + MINUTE })
    const calls = installFetchStub([() => unauthorized("refresh_revoked")])

    await expect(getAccessToken()).rejects.toMatchObject({ code: "REFRESH_REVOKED" })

    expect(calls).toHaveLength(1) // 不重试
    expect(await readSession()).toBeNull()
    expect((await readSnapshot())?.state).toBe("signed-out")
    expect(stub.broadcasts.length).toBeGreaterThan(0)
    const last = stub.broadcasts.at(-1) as { type: string; payload: { snapshot: { state: string } } }
    expect(last.type).toBe("AICTION_AUTH_CHANGED")
    expect(last.payload.snapshot.state).toBe("signed-out")
  })

  it("refresh 返回 500 → 保留会话（失败分级：不踢人下线）", async () => {
    await seedSession({ accessTokenExpiresAt: Date.now() + MINUTE })
    installFetchStub([() => jsonResponse(500, { error: { code: "internal" } })])

    await expect(getAccessToken()).rejects.toMatchObject({ code: "SERVER_ERROR" })
    expect(await readSession()).not.toBeNull()
  })

  it("refresh 网络异常 → 保留会话", async () => {
    await seedSession({ accessTokenExpiresAt: Date.now() + MINUTE })
    installFetchStub([
      () => {
        throw new TypeError("Failed to fetch")
      }
    ])

    await expect(getAccessToken()).rejects.toMatchObject({ code: "NETWORK" })
    expect(await readSession()).not.toBeNull()
  })
})

describe("代际（generation）", () => {
  it("登出后迟到的刷新结果不写回（否则会把登出的会话复活）", async () => {
    await seedSession({ accessTokenExpiresAt: Date.now() + MINUTE })

    let release: ((response: Response) => void) | null = null
    installFetchStub([
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
      () => jsonResponse(204) // signOut 的 /auth/logout
    ])

    const pending = getAccessToken({ force: true })
    await nextTick() // 让 refresh 请求真正发出

    await signOut()
    release!(refreshOk("at-late", "rt-late"))

    await expect(pending).resolves.toBe("at-late") // 调用方拿到返回值
    expect(await readSession()).toBeNull() // 但没有写回本地
  })
})

describe("signIn", () => {
  const autoApprove = (state: (url: string) => string) => (authorizeUrl: string) => state(authorizeUrl)

  it("完整流程：授权页 → 换 token → 落库 → 拉权益 → signed-in", async () => {
    stub.setWebAuthFlow(
      autoApprove((authorizeUrl) => {
        const state = new URL(authorizeUrl).searchParams.get("state")!
        return `https://stub-extension-id.chromiumapp.org/?code=code-1&state=${state}`
      })
    )
    const calls = installFetchStub([tokenExchangeOk, () => entitlementsOk("pro", 1000, 250)])

    await expect(signIn({ entry: "options" })).resolves.toEqual({ status: "signed-in" })

    // 授权 URL 的 PKCE 参数
    const authorizeUrl = new URL(stub.webAuthFlowCalls[0])
    expect(authorizeUrl.pathname).toBe("/auth/extension/authorize")
    expect(authorizeUrl.searchParams.get("ext_id")).toBe("stub-extension-id")
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256")
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe("https://stub-extension-id.chromiumapp.org/")

    // 换 token 的请求体带 verifier 与 device_id
    expect(calls[0].url).toContain("/auth/extension/token")
    const exchangeBody = JSON.parse(String(calls[0].init.body)) as Record<string, string>
    expect(exchangeBody.code).toBe("code-1")
    expect(exchangeBody.code_verifier).toHaveLength(43)
    expect(exchangeBody.device_id).toMatch(/^[0-9a-f-]{36}$/)

    // 落库
    expect(await readSession()).toMatchObject({
      userId: "user-1",
      plan: "free",
      refreshToken: "rt-login",
      accessToken: "at-login"
    })

    // 快照以 /v1/me 为准（plan 从 free 校准为 pro，额度按比例）
    const snapshot = await readSnapshot()
    expect(snapshot).toMatchObject({
      state: "signed-in",
      plan: "pro",
      principalKind: "user",
      email: "u***@example.com"
    })
    expect(snapshot?.quota?.usedRatio).toBeCloseTo(0.25)

    // pending 已清、且广播过
    expect(await readPending()).toBeNull()
    expect(stub.broadcasts.length).toBeGreaterThanOrEqual(2)
  })

  it("用户关窗（undefined）→ cancelled，不上报失败、不落库", async () => {
    stub.setWebAuthFlow(undefined)
    const calls = installFetchStub([() => jsonResponse(500)])

    await expect(signIn({ entry: "popup" })).resolves.toEqual({ status: "cancelled" })
    expect(calls).toHaveLength(0)
    expect(await readPending()).toBeNull()
    expect(await readSession()).toBeNull()
  })

  it("关窗通过 runtime.lastError 表达时同样按 cancelled 处理", async () => {
    stub.setWebAuthFlow("error")
    installFetchStub([() => jsonResponse(500)])

    await expect(signIn({ entry: "popup" })).resolves.toEqual({ status: "cancelled" })
    expect(await readPending()).toBeNull()
  })

  it("回跳 state 不匹配 → STATE_MISMATCH，且 pending 已删（一次性）", async () => {
    stub.setWebAuthFlow("https://stub-extension-id.chromiumapp.org/?code=code-1&state=wrong-state")
    installFetchStub([tokenExchangeOk])

    await expect(signIn({ entry: "options" })).resolves.toEqual({ status: "failed", code: "STATE_MISMATCH" })
    expect(await readPending()).toBeNull()
    expect(await readSession()).toBeNull()
  })

  it("pending 超过 5 分钟 → STATE_MISMATCH", async () => {
    stub.setWebAuthFlow((authorizeUrl) => {
      const state = new URL(authorizeUrl).searchParams.get("state")!
      // 模拟「用户 6 分钟后才点完成」：覆盖挂起态的 createdAt
      stub.local.set(AUTH_STORAGE_KEYS.pending, { state, verifier: "v", createdAt: Date.now() - PENDING_TTL_MS - 1000 })
      return `https://stub-extension-id.chromiumapp.org/?code=code-1&state=${state}`
    })
    installFetchStub([tokenExchangeOk])

    await expect(signIn({ entry: "options" })).resolves.toEqual({ status: "failed", code: "STATE_MISMATCH" })
  })

  it("回跳带 error=access_denied（无 code）→ cancelled", async () => {
    stub.setWebAuthFlow((authorizeUrl) => {
      const state = new URL(authorizeUrl).searchParams.get("state")!
      return `https://stub-extension-id.chromiumapp.org/?error=access_denied&state=${state}`
    })
    installFetchStub([tokenExchangeOk])

    await expect(signIn({ entry: "options" })).resolves.toEqual({ status: "cancelled" })
    expect(await readPending()).toBeNull()
  })

  it("换 token 被拒（400）→ failed SERVER_ERROR，不落库", async () => {
    stub.setWebAuthFlow((authorizeUrl) => {
      const state = new URL(authorizeUrl).searchParams.get("state")!
      return `https://stub-extension-id.chromiumapp.org/?code=used&state=${state}`
    })
    installFetchStub([() => jsonResponse(400, { error: { code: "invalid_request" } })])

    await expect(signIn({ entry: "options" })).resolves.toEqual({ status: "failed", code: "SERVER_ERROR" })
    expect(await readSession()).toBeNull()
  })

  it("并发点击只拉起一个授权窗口", async () => {
    stub.setWebAuthFlow((authorizeUrl) => {
      const state = new URL(authorizeUrl).searchParams.get("state")!
      return `https://stub-extension-id.chromiumapp.org/?code=code-1&state=${state}`
    })
    installFetchStub([tokenExchangeOk, () => entitlementsOk()])

    const [first, second] = await Promise.all([signIn({ entry: "options" }), signIn({ entry: "popup" })])

    expect(first).toEqual(second)
    expect(stub.webAuthFlowCalls).toHaveLength(1)
  })
})

describe("signOut", () => {
  it("先清本地再尽力通知服务端：断网也立刻 signed-out", async () => {
    await seedSession()
    const calls = installFetchStub([
      () => {
        throw new TypeError("Failed to fetch")
      }
    ])

    await signOut()

    expect(await readSession()).toBeNull()
    expect((await readSnapshot())?.state).toBe("signed-out")

    await nextTick() // /auth/logout 是 fire-and-forget
    expect(calls.some((call) => call.url.includes("/auth/logout"))).toBe(true)
    expect(new Headers(calls[0].init.headers).get("Authorization")).toBe("Bearer at-1")
  })

  it("无会话时登出也不报错", async () => {
    installFetchStub([() => jsonResponse(204)])
    await expect(signOut()).resolves.toBeUndefined()
    expect((await readSnapshot())?.state).toBe("signed-out")
  })

  /**
   * M2：登出 ≠ 从此不能用（AUTH_AND_SUBSCRIPTION §5.1 的状态机是
   * `pro → free → (登出) → anonymous`）。
   * 不回落的实际表现是「点了登出，划词变成『请先填写 API Key』+ 登录 CTA」，
   * 而 device token 明明还有效——只能等 SW 重启后才自愈。
   */
  it("登出后回落到匿名主体（device token 仍有效时不留在 signed-out）", async () => {
    await seedSession()
    await writeDeviceToken({ token: "device-1", expiresAt: Date.now() + 30 * 24 * 60 * 60_000 })
    // 第一个响应给 /auth/logout，之后的 /v1/me 失败（额度拉不到不该影响状态）
    installFetchStub([() => jsonResponse(204), () => jsonResponse(500)])

    await signOut()

    const snapshot = await readSnapshot()
    expect(snapshot?.state).toBe("anonymous")
    expect(snapshot?.principalKind).toBe("device")
  })

  it("登出且拿不到 device token → 保持 signed-out（失败不骗人）", async () => {
    await seedSession()
    installFetchStub([
      () => jsonResponse(204),
      () => {
        throw new TypeError("Failed to fetch")
      }
    ])

    await signOut()

    expect((await readSnapshot())?.state).toBe("signed-out")
  })

  it("登出同时清掉登录挂起态（残留的 state/verifier 只会让下次回跳撞 STATE_MISMATCH）", async () => {
    await seedSession()
    await writePending({ state: "pending-state", verifier: "pending-verifier", createdAt: Date.now() })
    installFetchStub([() => jsonResponse(204)])

    await signOut()

    expect(await readPending()).toBeNull()
  })
})

describe("埋点", () => {
  const approve = (authorizeUrl: string) => {
    const state = new URL(authorizeUrl).searchParams.get("state")!
    return `https://stub-extension-id.chromiumapp.org/?code=code-1&state=${state}`
  }

  it("identity 不可用（权限缺失 / 功能开关关闭）→ NOT_AVAILABLE，不冒充 server_error", async () => {
    // 回滚登录入口那天不能得到一张全是「服务端错误」的漏斗图
    const chromeStub = (globalThis as { chrome?: Record<string, any> }).chrome!
    chromeStub.identity.launchWebAuthFlow = undefined
    const calls = installFetchStub([() => jsonResponse(200, {})])

    const result = await signIn({ entry: "options" })
    await nextTick()

    expect(result).toEqual({ status: "failed", code: "NOT_AVAILABLE" })
    expect(calls).toHaveLength(0)
    const failed = authEvents.find((event) => event.name === "auth_sign_in_failed")
    expect(failed?.props).toEqual({ entry: "options", reason: "unavailable" })
  })

  it("登录成功上报 auth_sign_in_completed（entry / method / 耗时分桶）", async () => {
    stub.setWebAuthFlow(approve)
    installFetchStub([tokenExchangeOk, () => entitlementsOk()])

    await signIn({ entry: "options" })
    await nextTick()

    const completed = authEvents.find((event) => event.name === "auth_sign_in_completed")
    expect(completed?.props).toEqual({ entry: "options", method: "pkce", duration_bucket: "<2s" })
    expect(authEvents.some((event) => event.name === "auth_sign_in_failed")).toBe(false)
  })

  it("用户关窗 → auth_sign_in_failed{reason: window_closed}（放弃也是信号）", async () => {
    stub.setWebAuthFlow(undefined)
    installFetchStub([() => jsonResponse(500)])

    await signIn({ entry: "popup" })
    await nextTick()

    const failed = authEvents.find((event) => event.name === "auth_sign_in_failed")
    expect(failed?.props).toEqual({ entry: "popup", reason: "window_closed" })
  })

  it("state 不匹配 → reason: state_mismatch", async () => {
    stub.setWebAuthFlow("https://stub-extension-id.chromiumapp.org/?code=c&state=wrong")
    installFetchStub([tokenExchangeOk])

    await signIn({ entry: "options" })
    await nextTick()

    expect(authEvents.find((event) => event.name === "auth_sign_in_failed")?.props).toEqual({
      entry: "options",
      reason: "state_mismatch"
    })
  })

  it("换 token 被拒 → reason: server_error", async () => {
    stub.setWebAuthFlow(approve)
    installFetchStub([() => jsonResponse(400, { error: { code: "invalid_request" } })])

    await signIn({ entry: "options" })
    await nextTick()

    expect(authEvents.find((event) => event.name === "auth_sign_in_failed")?.props).toEqual({
      entry: "options",
      reason: "server_error"
    })
  })

  it("用户主动登出 → auth_signed_out{initiated: user}", async () => {
    await seedSession()
    installFetchStub([() => jsonResponse(204)])

    await signOut()
    await nextTick()

    expect(authEvents.find((event) => event.name === "auth_signed_out")?.props).toEqual({ initiated: "user" })
  })

  it("refresh 被撤销 → auth_signed_out{initiated: revoked}，且只报一次", async () => {
    await seedSession({ accessTokenExpiresAt: Date.now() + MINUTE })
    installFetchStub([() => unauthorized("refresh_revoked")])

    await expect(getAccessToken()).rejects.toMatchObject({ code: "REFRESH_REVOKED" })
    // 再来一次类似的失效（并发 401 的第二个人）：此时已无会话，不该重复上报
    await expect(getAccessToken()).rejects.toMatchObject({ code: "NO_SESSION" })
    await nextTick()

    const signOuts = authEvents.filter((event) => event.name === "auth_signed_out")
    expect(signOuts).toHaveLength(1)
    expect(signOuts[0].props).toEqual({ initiated: "revoked" })
  })

  it("埋点属性里没有任何凭据或邮箱", async () => {
    stub.setWebAuthFlow(approve)
    installFetchStub([tokenExchangeOk, () => entitlementsOk()])

    await signIn({ entry: "options" })
    await nextTick()

    const serialized = JSON.stringify(authEvents)
    expect(serialized).not.toMatch(/token|u\*\*\*|user-1/i)
  })
})

describe("initializeSession（冷启动）", () => {
  it("有 signed-in 快照 → 直接返回，不发请求", async () => {
    await writeSnapshot({ state: "signed-in", plan: "pro", updatedAt: 1 })
    const calls = installFetchStub([() => jsonResponse(500)])

    const snapshot = await initializeSession()
    expect(snapshot.state).toBe("signed-in")
    await nextTick()
    expect(calls).toHaveLength(0)
  })

  it("有 signed-out 快照 → 立即返回，同时后台补领 / 续签 device token", async () => {
    // 旧实现的判断是「只有完全没有快照才领 device token」：首次领取赶上网络抖动
    // 写下 signed-out 快照后，这批用户就**永久**没有匿名主体（30 天到期后也无续签时机）。
    await writeSnapshot({ state: "signed-out", plan: "anonymous", updatedAt: 1 })
    const calls = installFetchStub([() => jsonResponse(200, { access_token: "device-at", expires_in: 2592000 })])

    const snapshot = await initializeSession()
    expect(snapshot.state).toBe("signed-out") // 首帧不等请求

    await nextTick()
    expect(calls.some((call) => call.url.includes("/auth/device"))).toBe(true)
    expect((await readSnapshot())?.state).toBe("anonymous")
  })

  it("补领 device token 时用户刚好登录了 → 不用匿名快照覆盖 signed-in", async () => {
    await writeSnapshot({ state: "signed-out", plan: "anonymous", updatedAt: 1 })
    installFetchStub([() => jsonResponse(200, { access_token: "device-at", expires_in: 2592000 })])

    const pending = initializeSession()
    await seedSession() // 领取期间登录完成
    await writeSnapshot({ state: "signed-in", plan: "pro", updatedAt: Date.now() })
    await pending
    await nextTick()
    await nextTick()

    expect((await readSnapshot())?.state).toBe("signed-in")
  })

  it("只有持久层（浏览器重启清空 session）→ 先给 signed-in，再后台补 access", async () => {
    await writePersisted({ userId: "u-1", plan: "pro", refreshToken: "rt-1" })
    installFetchStub([() => refreshOk("at-boot")])

    const snapshot = await initializeSession()
    expect(snapshot).toMatchObject({ state: "signed-in", plan: "pro" })
    expect(await readAccess()).toBeNull() // 不阻塞首帧

    await nextTick()
    expect(await readAccess()).toMatchObject({ accessToken: "at-boot" })
  })

  it("完全冷启动 → 领 device token → anonymous 快照", async () => {
    installFetchStub([() => jsonResponse(200, { access_token: "device-at", expires_in: 2592000 })])

    const snapshot = await initializeSession()
    expect(snapshot).toMatchObject({ state: "anonymous", principalKind: "device", plan: "anonymous" })
    expect((await readSnapshot())?.state).toBe("anonymous")
  })

  it("device token 拿不到（429）→ signed-out，不抛错", async () => {
    installFetchStub([() => jsonResponse(429, { error: { code: "rate_limited" } })])

    const snapshot = await initializeSession()
    expect(snapshot.state).toBe("signed-out")
  })
})
