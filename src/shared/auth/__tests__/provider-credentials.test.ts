/**
 * 凭据注入层（M2 接线）：官方 provider 的凭据必须**运行时**取，且两支都要通。
 *
 * 两个失败模式都在这里钉死：
 * - 只取 access token → 匿名用户的官方请求全部 401（M1 遗留缺口）；
 * - 取不到凭据时悄悄回退到用户的 BYOK Key → 官方服务不可用却照常扣用户自己的钱。
 *
 * `provider-credentials` 通过 `session.getPrincipalToken()` 取凭据，这里用模块级 mock
 * 换掉那个入口（真模块只负责「按主体类型注入」，这正是被测的部分）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  session: false,
  deviceToken: "device-token-1" as string | null,
  deviceError: null as { code: string; status?: number } | null
}))

vi.mock("@/shared/auth/session", async () => {
  const { AuthError } = await import("@/shared/auth/errors")
  return {
    getPrincipalToken: async () => {
      if (state.session) return { token: "access-token-1", kind: "user" as const }
      if (state.deviceError) {
        throw new AuthError(state.deviceError.code as AuthErrorCode, "boom", state.deviceError.status)
      }
      if (!state.deviceToken) throw new AuthError("NO_SESSION")
      return { token: state.deviceToken, kind: "device" as const }
    }
  }
})

import { resetAnonymousIdCache } from "@/shared/anonymous-id"
import { resetAuthRequest } from "@/shared/auth/request"
import type { AuthErrorCode } from "@/shared/auth/types"
import { resolveProvider } from "@/shared/provider-credentials"
import { installChromeStub, uninstallChromeStub } from "./chrome-stub"

const byok = {
  id: "byok-1",
  name: "Mine",
  apiKey: "sk-user",
  model: "gpt-x",
  modelParams: {}
}

const official = {
  id: "official",
  kind: "official" as const,
  name: "AIction",
  apiKey: "",
  model: "aiction-fast",
  apiBaseUrl: "https://api.example/v1",
  modelParams: {}
}

beforeEach(() => {
  installChromeStub()
  resetAnonymousIdCache()
  resetAuthRequest()
  state.session = false
  state.deviceToken = "device-token-1"
  state.deviceError = null
})

afterEach(() => {
  uninstallChromeStub()
  resetAuthRequest()
  resetAnonymousIdCache()
})

describe("resolveProvider", () => {
  it("BYOK：原样透传用户填的 Key（现有链路零变化）", async () => {
    const resolved = await resolveProvider(byok)
    expect(resolved.resolvedApiKey).toBe("sk-user")
    expect(resolved.apiKey).toBe("sk-user")
  })

  it("official + 已登录：注入 access token", async () => {
    state.session = true
    const resolved = await resolveProvider(official)
    expect(resolved.resolvedApiKey).toBe("access-token-1")
    // 配置本身仍然没有凭据（存档里那份永远不是这个对象）
    expect(official.apiKey).toBe("")
  })

  it("official + 匿名：用 device token（否则游客的官方请求全 401）", async () => {
    const resolved = await resolveProvider(official)
    expect(resolved.resolvedApiKey).toBe("device-token-1")
  })

  it("official + 既无会话也无 device token → 抛 NO_SESSION（不降级到 BYOK）", async () => {
    state.deviceToken = null
    await expect(resolveProvider(official)).rejects.toMatchObject({ code: "NO_SESSION" })
  })

  it("official + 取凭据的客户端错误照原样抛出（不吞成「没有主体」）", async () => {
    state.deviceError = { code: "SERVER_ERROR", status: 400 }
    await expect(resolveProvider(official)).rejects.toMatchObject({ code: "SERVER_ERROR", status: 400 })
  })
})
