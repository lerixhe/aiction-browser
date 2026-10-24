import type { streamText } from "ai"

import type { ModelsDevData } from "@/shared/models-dev"
import { buildProviderOptions, truncateMessagesToContext } from "@/shared/model-params"
import { resolveLanguageModel } from "@/shared/model-provider"
import type { ChatFeature, ChatMessage, ModelParams, ProviderConfig } from "@/shared/types"

/**
 * chat 请求的构造与形态快照 —— **真实对话与「测试连接」共用这一处**。
 *
 * 为什么必须共用（2026-10-20）：测试连接原本走的是另一套极简请求
 * （`generateText` 非流式 + 单条 `"Hi"` + 硬编码 `maxOutputTokens: 5` + 不带 providerOptions），
 * 于是「测试通过」只证明了鉴权与端点可达，完全覆盖不到下面这些真实失败面：
 * - 端点不支持流式 / SSE 格式不兼容；
 * - 用户填的 `maxTokens` 超过端点上限（→ 400，见 AGENTS.md 记录的 `max_tokens` 事故）；
 * - 端点不接受 `reasoning_effort` / 关闭思考的传参形态（→ 400）；
 * - system 消息不被接受。
 * 现在测试走同一条构造路径，配错会在点「测试连接」时立刻暴露，而不是聊到一半才炸。
 */

export type ChatStreamRole = "system" | "user" | "assistant"

export interface ChatStreamMessage {
  /** 仅用于裁剪函数复用 ChatMessage 形状；真实对话与测试都不依赖它 */
  id?: string
  role: ChatStreamRole
  content: string
}

/** 请求形态快照：只含数值 / 布尔 / 枚举（不含任何消息内容），见 docs/ANALYTICS.md §3.10 */
export interface ChatRequestPlan {
  message_count: number
  input_chars: number
  /** 是否因 `contextSize` 触发裁剪 */
  truncated: boolean
  max_tokens?: number
  context_size?: number
  reasoning?: boolean
  reasoning_effort?: string
  /** 实际带上的 providerOptions 命名空间（`openai` / `deepseek` / `openrouter` / `custom` …） */
  provider_options?: string
}

export interface PreparedChatRequest {
  streamParams: Parameters<typeof streamText>[0]
  plan: ChatRequestPlan
}

/**
 * 构造 `streamText` 参数 + 请求形态快照。
 * 同步函数：`ai` 包仍由调用方动态 import（保持 service worker 启动轻量）。
 */
export function prepareChatRequest(input: {
  provider: ProviderConfig
  messages: ChatStreamMessage[]
  modelsDevData?: ModelsDevData
  signal: AbortSignal
  /** 计费主体（契约 §6.1）：**仅官方 provider 使用**，BYOK 不送无意义的头 */
  feature?: ChatFeature
  /**
   * 官方链路的通用请求头（`X-Ext-Id` / `X-Client-Version` / `X-Device-Id` / `X-Platform`，契约 §1.3）。
   * 由 background 从 `buildApiBaseHeaders()` 取来传入：对话不走 `authFetch`（AI SDK 直连），
   * 但网关同样强制校验这四个头。
   */
  apiHeaders?: Record<string, string>
}): PreparedChatRequest {
  const { provider, messages, modelsDevData, signal } = input
  /**
   * 官方链路**一律不吃** `modelParams`：网关按档位强制覆盖 `max_tokens`、忽略
   * `temperature` / `reasoning` 一类字段（契约 §6.1）。在客户端这一层就掐掉，
   * 比「发出去让网关丢掉」更不容易出事——用户看不出参数没生效，而参数不合规会变成 400。
   * 副作用：官方链路也不做客户端上下文裁剪（`contextSize` 属于 `modelParams`），
   * 超长时由网关返回 `413 context_too_long`，不做静默裁剪（与既有决策一致）。
   */
  const params: ModelParams = provider.kind === "official" ? {} : (provider.modelParams ?? {})

  // 只发送用户显式填充的参数；未填充 = 忽略（跟随模型默认）
  const finalMessages =
    typeof params.contextSize === "number" && params.contextSize > 0
      ? truncateMessagesToContext(messages as ChatMessage[], params.contextSize)
      : messages

  const streamParams: Parameters<typeof streamText>[0] = {
    model: resolveLanguageModel(provider, modelsDevData),
    messages: finalMessages,
    abortSignal: signal
  }

  if (typeof params.maxTokens === "number" && params.maxTokens >= 1) {
    streamParams.maxOutputTokens = params.maxTokens
  }

  const providerOptions = buildProviderOptions(provider, modelsDevData, params)
  if (providerOptions) {
    streamParams.providerOptions = providerOptions
  }

  /**
   * 官方链路的计费主体只能放在**请求头**（契约 §6.1）：
   * - body 会与 AI SDK 的 `providerOptions` 等机制互相干扰；
   * - 路径前缀会让 `baseURL` 语义变形，且要按 feature 拆 provider 实例（`resolveLanguageModel` 是纯函数，没口子）。
   * `streamText` 的 `headers` 会透传给 provider，所以 AI SDK 侧零改造。
   *
   * 缺省填 `selection_chat`：服务端白名单校验，未知值也按 `selection_chat` 计（宽容 > 拒绝），
   * 但客户端仍应显式传（调用点知道自己是划词还是页内提问）。
   */
  if (provider.kind === "official") {
    streamParams.headers = {
      ...(input.apiHeaders ?? {}),
      "X-AIction-Feature": input.feature ?? "selection_chat"
    }
  }

  const plan: ChatRequestPlan = {
    message_count: finalMessages.length,
    input_chars: finalMessages.reduce((total, message) => total + message.content.length, 0),
    truncated: finalMessages !== messages
  }
  if (typeof params.maxTokens === "number" && params.maxTokens >= 1) {
    plan.max_tokens = params.maxTokens
  }
  if (typeof params.contextSize === "number" && params.contextSize > 0) {
    plan.context_size = params.contextSize
  }
  if (params.reasoning !== undefined) {
    plan.reasoning = params.reasoning
  }
  if (params.reasoningEffort) {
    plan.reasoning_effort = params.reasoningEffort
  }
  if (providerOptions) {
    plan.provider_options = Object.keys(providerOptions)[0]
  }

  return { streamParams, plan }
}

/**
 * 把 AI SDK 的 `CallWarning` 转成一行可读文本（参数被端点忽略 / 不支持时由 SDK 给出）。
 * 直接读字段而不做正则解析——形态见 `ai` 包的类型定义。
 */
export function describeCallWarning(warning: unknown): string {
  if (!warning || typeof warning !== "object") {
    return String(warning)
  }

  const record = warning as { type?: unknown; setting?: unknown; message?: unknown; details?: unknown }
  const parts = [record.type, record.setting, record.message ?? record.details]
    .filter((part): part is string => typeof part === "string" && part.length > 0)

  return parts.length > 0 ? parts.join(": ") : JSON.stringify(warning)
}

/**
 * 官方对话的 401 救援判定（契约 §1.6：非幂等接口**只允许**在 401 时刷新凭据后重试一次）。
 *
 * 为什么需要单独一个函数：这条规则有三个条件，写散在 `catch` 里最容易漏掉最后一条，
 * 而漏掉的后果是**双倍计费 + 重复文本**（已经产出内容再重试，用户会看到答案重复一遍）。
 *
 * - `isOfficial`：BYOK 的 401 是用户端点的事，刷新我们的 token 没有任何意义；
 * - `status === 401`：401 意味着请求没被接受，重试不会重复扣费；
 * - `!retried`：只允许一次，不循环；
 * - `!hasContent`：已经出过字就不重试。
 */
export function shouldRescueOfficial401(input: {
  isOfficial: boolean
  retried: boolean
  status?: number
  hasContent: boolean
}): boolean {
  return input.isOfficial && !input.retried && input.status === 401 && !input.hasContent
}
