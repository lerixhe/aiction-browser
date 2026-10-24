import type { ProviderConfig } from "@/shared/types"

/**
 * Provider 类型枚举（埋点与 UI 共用）。
 * `none` = 没有配置任何 provider；`official` = 官方托管服务（运行时构造，不在 `providers[]` 里）。
 */
export type ProviderType = "models_dev" | "custom" | "official" | "none"

export function providerTypeOf(provider: ProviderConfig | undefined | null): ProviderType {
  if (!provider) {
    return "none"
  }
  // 官方 provider 没有 modelsDevId（它不是某个第三方厂商），必须单独一档：
  // 否则官方链路的失败会全部堆在 `custom` 桶里，看起来像“用户自定义端点出了问题”
  if (provider.kind === "official") {
    return "official"
  }
  return provider.modelsDevId ? "models_dev" : "custom"
}

/**
 * 错误排查用的 provider 身份（埋点属性，见 docs/ANALYTICS.md §3.10）。
 *
 * 口径：**唯一禁区是 API Key**。名称 / 端点地址 / 模型名都允许上报（已获产品确认），
 * 便于直接定位「哪个 provider 的哪个端点报 400」。`has_api_key` 只报布尔，
 * 绝不带 Key 的内容、长度或前后缀。
 */
export interface ProviderIdentityProps {
  provider_type: ProviderType
  /** 用户填写的 provider 名称（可选上报，便于识别自己的自定义端点） */
  provider_name?: string
  /** 内部 uuid：把同一 provider 的多次失败归组 */
  provider_id?: string
  /** models.dev 枚举 id（openai / deepseek …），自定义 provider 没有 */
  models_dev_id?: string
  /** 用户填写的端点地址（原样，出口护栏会打掉其中的 query 凭据） */
  api_base_url?: string
  /** 是否手填了自定义端点 */
  is_custom_endpoint: boolean
  /** 是否配置了 API Key（只报布尔，绝不带 Key 内容） */
  has_api_key: boolean
}

export function providerIdentityOf(
  provider: ProviderConfig | undefined | null
): ProviderIdentityProps {
  const identity: ProviderIdentityProps = {
    provider_type: providerTypeOf(provider),
    is_custom_endpoint: Boolean(provider?.apiBaseUrl?.trim()),
    has_api_key: Boolean(provider?.apiKey?.trim())
  }

  if (!provider) {
    return identity
  }

  if (provider.name?.trim()) identity.provider_name = provider.name.trim()
  if (provider.id) identity.provider_id = provider.id
  if (provider.modelsDevId) identity.models_dev_id = provider.modelsDevId
  if (provider.apiBaseUrl?.trim()) identity.api_base_url = provider.apiBaseUrl.trim()

  return identity
}
