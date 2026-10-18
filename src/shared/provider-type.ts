import type { ProviderConfig } from "@/shared/types"

/**
 * Provider 类型枚举（埋点与 UI 共用）。
 * `none` = 没有配置任何 provider；只保留预设枚举，绝不上报用户填写的 provider 名称
 * （自定义名可能是用户文本，见 docs/ANALYTICS.md §3）。
 */
export type ProviderType = "models_dev" | "custom" | "none"

export function providerTypeOf(provider: ProviderConfig | undefined | null): ProviderType {
  if (!provider) {
    return "none"
  }
  return provider.modelsDevId ? "models_dev" : "custom"
}
