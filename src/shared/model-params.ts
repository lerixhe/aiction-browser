import type { ProviderConfig, ModelParams } from "./types"
import type { ModelsDevData } from "./models-dev"

/**
 * 模型参数 → 请求参数的组装逻辑（background 使用）。
 */

type ChatMessage = { role: "user" | "assistant" | "system"; content: string }

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

/** 与 resolveLanguageModel 相同的 npm 解析逻辑，导出复用 */
export function resolveProviderNpm(provider: ProviderConfig, modelsDevData?: ModelsDevData): string {
  let npm = "@ai-sdk/openai-compatible"
  if (provider.modelsDevId && modelsDevData) {
    const entry = modelsDevData[provider.modelsDevId]
    if (entry?.npm) npm = entry.npm
  }
  return npm
}

/**
 * providerOptions 的键名按 SDK provider 而异：
 * - @ai-sdk/openai → "openai"（支持 reasoningEffort）
 * - @ai-sdk/deepseek → "deepseek"（支持 reasoningEffort，自动映射档位）
 * - @openrouter/ai-sdk-provider → "openrouter"（整个对象透传进请求体）
 * - @ai-sdk/openai-compatible → 创建时的 name（本项目 fallback 为 "custom"，schema 支持 reasoningEffort）
 * - 其余（anthropic/google）→ 键名不匹配会被 SDK 忽略，发送即无效（无副作用）
 */
export function resolveProviderOptionsName(provider: ProviderConfig, modelsDevData?: ModelsDevData): string {
  switch (resolveProviderNpm(provider, modelsDevData)) {
    case "@ai-sdk/openai":
      return "openai"
    case "@ai-sdk/deepseek":
      return "deepseek"
    case "@openrouter/ai-sdk-provider":
      return "openrouter"
    default:
      return "custom"
  }
}

/**
 * reasoning / reasoningEffort → providerOptions（按 SDK provider 分别映射）。
 * - 未填充（undefined reasoning 且 undefined reasoningEffort）→ 不发送任何 providerOptions
 * - reasoning=false（显式禁用思考）→ **永远不传 effort 档位**（传档位会隐式开启思考，违背禁用意图）：
 *   - @ai-sdk/openai → reasoningEffort: "none"（OpenAI 官方枚举）
 *   - @ai-sdk/deepseek → thinking: { type: "disabled" }（DeepSeek 官方枚举）
 *   - @openrouter/ai-sdk-provider → reasoning: { enabled: false }（OpenRouter 官方格式）
 *   - 通用 openai-compatible → reasoning_effort: "off"（对应 OpenAI 官方的 "none"；
 *     曾尝试不发送，但那样无法关闭思考，兼容端点普遍接受 off 值）
 * - effort 只在 reasoning !== false 时生效（未填充/启用时按用户填写值发送）
 * - reasoning=true 且未填 effort → 不发送额外内容（跟随模型默认，思考模型默认开启）
 */
export function buildProviderOptions(
  provider: ProviderConfig,
  modelsDevData: ModelsDevData | undefined,
  params: ModelParams
): Record<string, Record<string, JSONValue>> | undefined {
  const npm = resolveProviderNpm(provider, modelsDevData)
  const options: Record<string, JSONValue> = {}

  if (params.reasoning === false) {
    // 显式禁用思考：优先生效，effort 档位（若同时被填）不随请求发送
    switch (npm) {
      case "@ai-sdk/openai":
        options.reasoningEffort = "none"
        break
      case "@ai-sdk/deepseek":
        options.thinking = { type: "disabled" }
        break
      case "@openrouter/ai-sdk-provider":
        options.reasoning = { enabled: false }
        break
      default:
        // 通用 openai-compatible：禁用值统一发 "off"（对应 OpenAI 官方的 "none"，
        // 如部分兼容端点的合法枚举为 off|low|medium|high|xhigh|max）
        options.reasoningEffort = "off"
        break
    }
  } else {
    if (params.reasoningEffort) {
      if (npm === "@openrouter/ai-sdk-provider") {
        options.reasoning = { effort: params.reasoningEffort }
      } else {
        // @ai-sdk/openai / @ai-sdk/deepseek / @ai-sdk/openai-compatible 均以 reasoningEffort 传参
        options.reasoningEffort = params.reasoningEffort
      }
    }
  }

  if (Object.keys(options).length === 0) {
    return undefined
  }

  return { [resolveProviderOptionsName(provider, modelsDevData)]: options }
}

/**
 * 按上下文窗口上限（字符数）裁剪输入消息：
 * - total <= contextSize → 原样返回
 * - 超出时按比例裁剪非用户消息（保留开头 60% + 结尾 40%），用户消息不裁剪
 */
export function truncateMessagesToContext(messages: ChatMessage[], contextSize: number): ChatMessage[] {
  if (contextSize <= 0 || messages.length === 0) {
    return messages
  }

  const total = messages.reduce((sum, m) => sum + m.content.length, 0)
  if (total <= contextSize) {
    return messages
  }

  return messages.map((message) => {
    if (message.role === "user") {
      return message
    }

    const maxLen = Math.max(64, Math.floor((message.content.length / total) * contextSize))
    if (message.content.length <= maxLen) {
      return message
    }

    const head = Math.floor(maxLen * 0.6)
    const tail = maxLen - head
    return {
      ...message,
      content: `${message.content.slice(0, head)}\n\n[...]\n\n${message.content.slice(-tail)}`
    }
  })
}
