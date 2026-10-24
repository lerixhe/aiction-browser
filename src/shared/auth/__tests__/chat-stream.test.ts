/**
 * 请求构造（`prepareChatRequest`）：真实对话与「测试连接」共用这一处，M2 只加了两件事。
 *
 * 这两件事都很容易被「顺手改坏」：
 * - `X-AIction-Feature` 只在**官方** provider 上加（给第三方端点送无意义的头不合适）；
 * - 官方链路不吃用户的 `modelParams`（网关按档位强制覆盖，客户端传什么都不重要）。
 */
import { describe, expect, it } from "vitest"
import { prepareChatRequest, shouldRescueOfficial401 } from "@/shared/chat-stream"
import type { ProviderConfig } from "@/shared/types"

const signal = new AbortController().signal

const official: ProviderConfig = {
  id: "official",
  kind: "official",
  name: "AIction",
  apiKey: "",
  apiBaseUrl: "https://api.example/v1",
  model: "aiction-fast",
  modelParams: {}
}

const byok: ProviderConfig = {
  id: "byok-1",
  name: "Mine",
  apiKey: "sk-1",
  apiBaseUrl: "https://endpoint.example/v1",
  model: "gpt-x",
  modelParams: {}
}

const messages = [
  { role: "system" as const, content: "sys" },
  { role: "user" as const, content: "hi" }
]

describe("官方链路的计费主体头（契约 §6.1）", () => {
  it("官方 provider 带上 X-AIction-Feature", () => {
    const { streamParams } = prepareChatRequest({ provider: official, messages, signal, feature: "page_qa" })
    expect(streamParams.headers).toEqual({ "X-AIction-Feature": "page_qa" })
  })

  it("调用点没传 feature 时落到 selection_chat（服务端白名单里最保守的一档）", () => {
    const { streamParams } = prepareChatRequest({ provider: official, messages, signal })
    expect(streamParams.headers).toEqual({ "X-AIction-Feature": "selection_chat" })
  })

  it("BYOK 不加这个头（不给第三方端点送无意义的计费标注）", () => {
    const { streamParams } = prepareChatRequest({ provider: byok, messages, signal, feature: "selection_chat" })
    expect(streamParams.headers).toBeUndefined()
  })

  it("官方链路带上契约 §1.3 的四个通用头（网关强制校验）", () => {
    const apiHeaders = {
      "X-Ext-Id": "ext-1",
      "X-Client-Version": "0.0.0",
      "X-Device-Id": "device-1",
      "X-Platform": "chrome"
    }
    const { streamParams } = prepareChatRequest({
      provider: official,
      messages,
      signal,
      feature: "page_qa",
      apiHeaders
    })
    expect(streamParams.headers).toEqual({ ...apiHeaders, "X-AIction-Feature": "page_qa" })
  })
})

describe("官方链路的参数", () => {
  it("官方 provider 即使带着 modelParams 也不发（网关按档位强制覆盖）", () => {
    // 这条断言必须是**真的不变量**而不是 fixture 恰好为空：
    // 官方 provider 的 modelParams 由 buildOfficialProvider 造成 {}，但「恰好为空」
    // 一旦有人给官方 provider 填上参数就会失效，而网关会忽略/报错，用户看不到任何提示。
    const officialWithParams = {
      ...official,
      modelParams: { maxTokens: 4096, contextSize: 500, reasoning: true, reasoningEffort: "high" as const }
    }
    const { streamParams, plan } = prepareChatRequest({ provider: officialWithParams, messages, signal })
    expect(streamParams.providerOptions).toBeUndefined()
    expect(streamParams.maxOutputTokens).toBeUndefined()
    expect(plan.max_tokens).toBeUndefined()
    expect(plan.context_size).toBeUndefined()
    expect(plan.provider_options).toBeUndefined()
    expect(plan.reasoning).toBeUndefined()
  })

  it("请求形态快照仍然可用（message_count / input_chars）", () => {
    const { plan } = prepareChatRequest({ provider: official, messages, signal })
    expect(plan.message_count).toBe(2)
    expect(plan.input_chars).toBe(messages.reduce((sum, message) => sum + message.content.length, 0))
  })
})

describe("官方对话的 401 救援判定（契约 §1.6）", () => {
  const base = { isOfficial: true, retried: false, status: 401, hasContent: false }

  it("官方链路 + 首次 + 401 + 还没出字 → 换凭据重试一次", () => {
    expect(shouldRescueOfficial401(base)).toBe(true)
  })

  it("已经重试过 → 不再重试（不循环）", () => {
    expect(shouldRescueOfficial401({ ...base, retried: true })).toBe(false)
  })

  it("已经产出内容 → 不重试（否则双倍计费 + 文本重复）", () => {
    expect(shouldRescueOfficial401({ ...base, hasContent: true })).toBe(false)
  })

  it("BYOK 的 401 不救援（刷新我们的 token 与用户的端点无关）", () => {
    expect(shouldRescueOfficial401({ ...base, isOfficial: false })).toBe(false)
  })

  it("非 401 不救援（400/429/5xx 重试会重复扣费或掩盖参数错误）", () => {
    expect(shouldRescueOfficial401({ ...base, status: 400 })).toBe(false)
    expect(shouldRescueOfficial401({ ...base, status: 429 })).toBe(false)
    expect(shouldRescueOfficial401({ ...base, status: 500 })).toBe(false)
    expect(shouldRescueOfficial401({ ...base, status: undefined })).toBe(false)
  })
})
