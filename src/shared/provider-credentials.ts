/**
 * 凭据注入层（M2 接线）。
 *
 * 存在理由：`ProviderConfig` 是「可序列化配置」，而官方服务的凭据必须**运行时**取，
 * 且只能在 background 取。把这两件事分开，才能保证「配置里永远没有 access token」。
 *
 * 🚫 本模块被边界脚本禁止进入 content / pdf-viewer（它 import 了 `getPrincipalToken`）。
 */
import { getPrincipalToken } from "@/shared/auth/session"
import type { ProviderConfig } from "@/shared/types"

export interface ResolvedProvider extends ProviderConfig {
  /** 真正用于发请求的凭据：BYOK = 用户填的 Key；official = 运行时铸出的 access / device token */
  resolvedApiKey: string
}

/**
 * 把配置解析成可直接发请求的 provider。
 *
 * - BYOK：原样透传用户填的 Key（现有行为不变）；
 * - official：`getPrincipalToken()` —— 登录用户取 access token（含单飞刷新），
 *   匿名取 device token。**两支都必须通**：官方服务对游客开放（契约 §1.2 的两种 `sub`），
 *   只取 access token 会让匿名用户的官方请求全部 401。
 *
 * 失败按 `AuthError` 抛出（`NO_SESSION` / `REFRESH_REVOKED` / `NETWORK` …），
 * 由 background 翻译成 `ChatErrorCode`（见 `background.ts` 的 `authErrorToChatFailure`）。
 * 这里**不做降级重试**：官方服务不可用时不能让请求悄悄改道去用用户的 BYOK Key。
 */
export async function resolveProvider(provider: ProviderConfig): Promise<ResolvedProvider> {
  if (provider.kind !== "official") {
    return { ...provider, resolvedApiKey: provider.apiKey }
  }

  const credential = await getPrincipalToken()
  return { ...provider, resolvedApiKey: credential.token }
}
