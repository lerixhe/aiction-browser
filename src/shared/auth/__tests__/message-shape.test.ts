/**
 * 消息协议的**形状护栏**（SPEC §7 / §12.1 U11）。
 *
 * 跨上下文的消息负载是最容易泄露凭据的地方：给 `AuthSnapshot` 顺手加一个 `accessToken` 字段、
 * 或者在错误响应里塞一个 `refresh_token`，编译器不会拦，代码评审也未必看得到。
 * 所以这里用**序列化后的字符串**做断言，而不是断言「我记住了哪些字段」。
 */
import { describe, expect, it } from "vitest"
import { parseEntitlements } from "@/shared/auth/entitlements"
import type {
  AuthSignInResponse,
  AuthSnapshot,
  AuthStateResponse,
  EntitlementsResponse
} from "@/shared/auth/types"

/**
 * 凭据类**键名**模式。
 *
 * 不能写成裸 `/(token|secret)/i`：`maxOutputTokens`（模型能力）与 `quota.unit: "tokens"`（额度单位）
 * 都是合法字段，会被误判成泄露。
 *
 * 也不能只做前缀锛定：`sessionToken` / `deviceToken` 这类「主语在前、token 在后」的键会漏网。
 * 所以 token 一族按**整词 + 可选主语前缀**匹配（`token` / `accessToken` / `session_token` 全盖）。
 * 尾部的复数 `s` 必须排除（`tokens` 是额度单位）—— 注意正则带 `/i`，不能用 `[A-Z]` 区分大小写，
 * 所以干脆只认「整词 token」，到 `$` 为止；键名是我们自己定的，没有 `tokenExpiresAt` 这类尾巴写法。
 * 其余凭据词仍按前缀匹配。
 */
const CREDENTIAL_KEY_PATTERN =
  /^(?:(?:access|refresh|id|session|device)_?)?token$|^(?:bearer|secret|api_?key|authorization|password|credential)/i

/**
 * 递归收集**键名**（不看值）。
 *
 * 为什不用「序列化全文不匹配」：`quota.unit` 的合法取值就是 `"tokens"`，
 * 全文匹配会把它当泄露。凭据泄露的风险在**键**（或真实 token 字符串），不在固定枚举值上。
 */
function collectKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc)
    return acc
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      acc.push(key)
      collectKeys(child, acc)
    }
  }
  return acc
}

const fullSnapshot: AuthSnapshot = {
  state: "signed-in",
  principalKind: "user",
  email: "u***@example.com",
  plan: "pro",
  quota: { usedRatio: 0.42, resetAt: "2026-12-01T00:00:00Z" },
  officialModel: "aiction-fast",
  updatedAt: 1760000000000
}

const fullEntitlements = parseEntitlements({
  principal: { kind: "user", id: "user-1", email: "u***@example.com" },
  plan: "pro",
  subscription: { status: "active", provider: "paddle", period_end: "2026-12-01T00:00:00Z", cancel_at_period_end: false, manage_url: null },
  quota: { unit: "tokens", limit: 1000, used: 420, reserved: 0, reset_at: "2026-12-01T00:00:00Z", window: "subscription" },
  features: { models: ["aiction-fast"], max_output_tokens: 8192, concurrency: 3, context_chars: 200000 },
  server_time: "2026-10-22T00:00:00Z"
})!

describe("AuthSnapshot 的形状", () => {
  it("键集固定：加字段必须同时过这道断言（防顺手带个 accessToken 进来）", () => {
    expect(Object.keys(fullSnapshot).sort()).toEqual([
      "email",
      "officialModel",
      "plan",
      "principalKind",
      "quota",
      "state",
      "updatedAt"
    ])
  })

  it("序列化后不含任何凭据字样", () => {
    expect(collectKeys(fullSnapshot).filter((key) => CREDENTIAL_KEY_PATTERN.test(key))).toEqual([])
  })

  it("凭据键名模式盖住「主语在前」的写法，又不误判合法字段", () => {
    // `sessionToken` / `deviceToken` 这类后缀写法曾经漏网（旧模式是纯前缀锛定）
    for (const key of [
      "token",
      "accessToken",
      "access_token",
      "refreshToken",
      "sessionToken",
      "device_token",
      "apiKey",
      "Authorization"
    ]) {
      expect({ key, matched: CREDENTIAL_KEY_PATTERN.test(key) }).toEqual({ key, matched: true })
    }
    // 模型能力与额度单位不能被当成凭据
    for (const key of ["maxOutputTokens", "max_output_tokens", "tokens", "unit"]) {
      expect({ key, matched: CREDENTIAL_KEY_PATTERN.test(key) }).toEqual({ key, matched: false })
    }
  })
})

describe("消息响应", () => {
  it("AUTH_STATE_REQUEST 的响应键集为 { success, snapshot }，且键名无凭据字样", () => {
    const response: AuthStateResponse = { success: true, snapshot: fullSnapshot }
    expect(Object.keys(response).sort()).toEqual(["snapshot", "success"])
    const credentialKeys = collectKeys(response).filter((key) => CREDENTIAL_KEY_PATTERN.test(key))
    expect(credentialKeys).toEqual([])
  })

  it("AUTH_STATE_REQUEST 失败时也只带 { success, error }", () => {
    const response: AuthStateResponse = { success: false, error: "boom" }
    expect(Object.keys(response).sort()).toEqual(["error", "success"])
  })

  it("ENTITLEMENTS_REQUEST 的响应键名里没有凭据字样（值里的「tokens」是合法额度单位）", () => {
    const response: EntitlementsResponse = { success: true, entitlements: fullEntitlements }
    const credentialKeys = collectKeys(response).filter((key) => CREDENTIAL_KEY_PATTERN.test(key))
    expect(credentialKeys).toEqual([])
    // 额度单位确实是 "tokens"，且模型能力字段叫 maxOutputTokens —— 两个合法值不会被误判
    expect(fullEntitlements.quota.unit).toBe("tokens")
    expect(fullEntitlements.features.maxOutputTokens).toBe(8192)
  })

  it("SIGN_IN 响应：failed 时 success=false 且带 code（cancelled 不算失败）", () => {
    const failed: AuthSignInResponse = { success: false, status: "failed", code: "STATE_MISMATCH" }
    const cancelled: AuthSignInResponse = { success: true, status: "cancelled" }
    const done: AuthSignInResponse = { success: true, status: "signed-in" }

    expect(failed.success).toBe(false)
    expect(failed.code).toBe("STATE_MISMATCH")
    expect(cancelled.success).toBe(true)
    expect(done.success).toBe(true)
  })
})
