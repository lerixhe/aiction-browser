/**
 * 凭据注入层（M2 接线）。
 *
 * 存在理由：`ProviderConfig` 是「可序列化配置」，而官方服务的凭据必须**运行时**取，
 * 且只能在 background 取。把这两件事分开，才能保证「配置里永远没有 access token」。
 *
 * 🚫 本模块被边界脚本禁止进入 content / pdf-viewer（它 import 了 `getPrincipalToken`）。
 */
import { getPrincipalToken } from "@/shared/auth/session"
import type { PrincipalKind } from "@/shared/auth/types"
import type { ProviderConfig } from "@/shared/types"

export interface ResolvedProvider extends ProviderConfig {
  /** 真正用于发请求的凭据：BYOK = 用户填的 Key；official = 运行时铸出的 access / device token */
  resolvedApiKey: string
  /**
   * 官方链路的**主体类型**（BYOK 恒为 `undefined`）。
   *
   * 两个用处，都不是可选项：
   * - 401 救援要知道「换 access token」还是「重领 device token」；
   * - 响应头校准额度时要核对「这份额度属于哪个主体」，否则 A 的用量会落到 B 的界面。
   */
  principalKind?: PrincipalKind
}

/**
 * 把配置解析成可直接发请求的 provider。
 *
 * - BYOK：原样透传用户填的 Key（现有行为不变）；
 * - official：`getPrincipalToken()` —— 登录用户取 access token（含单飞刷新），
 *   匿名取 device token。**两支都必须通**：官方服务对游客开放（契约 §1.2 的两种 `sub`），
 *   只取 access token 会让匿名用户的官方请求全部 401。
 *
 * 失败按 `AuthError` 抛出（`NO_SESSION` / `REFRESH_REVOKED` / `NETWORK` / `RATE_LIMITED` …），
 * 由 background 翻译成 `ChatErrorCode`（见 `background.ts` 的 `authFailureOf`）。
 * 这里**不做降级**：官方服务不可用时不能让请求悄悄改道去用用户的 BYOK Key
 *（那等于把「官方挂了」变成「悄悄花用户自己的钱」）。
 *
 * `force: true`：凭据被判过期 / 无效时的救援路径，越过本地缓存换一张（见调用方的一次重试）。
 */
export async function resolveProvider(
  provider: ProviderConfig,
  options: { force?: boolean } = {}
): Promise<ResolvedProvider> {
  if (provider.kind !== "official") {
    return { ...provider, resolvedApiKey: provider.apiKey }
  }

  const credential = await getPrincipalToken(options)
  return { ...provider, resolvedApiKey: credential.token, principalKind: credential.kind }
}
