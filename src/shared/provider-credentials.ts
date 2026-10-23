/**
 * 凭据注入层（M1 **只建壳**，接线在 M2）。
 *
 * 存在理由：`ProviderConfig` 是「可序列化配置」，而官方服务的凭据必须**运行时**取，
 * 且只能在 background 取。把这两件事分开，才能保证「配置里永远没有 access token」。
 *
 * 🚫 本模块被边界脚本禁止进入 content / pdf-viewer（它迟早会 import `getAccessToken`）。
 */
import type { ProviderConfig } from "@/shared/types"

export interface ResolvedProvider extends ProviderConfig {
  /** 真正用于发请求的凭据：BYOK = 用户填的 Key；official = 运行时铸出的 access token */
  resolvedApiKey: string
}

/**
 * 把配置解析成可直接发请求的 provider。
 *
 * M1：只有 BYOK 分支是真实的。官方分支暂时抛错——**不做假实现**，
 * 免得 M2 接线时误以为已经通了一条永远失败的路径。
 *
 * M2 的官方分支不是简单一句 `await getAccessToken()`：
 * - 已登录 → `getAccessToken()`（内含单飞与 `NO_SESSION`）；
 * - **匿名（只有 device token）→ 取 `readDeviceToken()`**，否则官方请求对游客全部 401。
 *   这一支现在完全未接线（`request.ts` 的 `authFetch` 也只认 session 的 access token），
 *   详见 `session.ts:initializeSession()` 的注释。
 */
export async function resolveProvider(provider: ProviderConfig): Promise<ResolvedProvider> {
  if (provider.kind !== "official") {
    return { ...provider, resolvedApiKey: provider.apiKey }
  }
  throw new Error("official provider 尚未接线（M2）")
}
