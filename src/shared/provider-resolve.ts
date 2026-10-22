/**
 * 「当前实际使用哪个服务」的唯一解析入口（SPEC §6.9）。
 *
 * 为什么必须收敛到一个函数：Popup 的账号行、面板的失败态、background 的请求组装
 * 都需要回答同一个问题。三处各写一遍判断，迟早出现「Popup 显示官方服务、background 却发到 BYOK」。
 *
 * ⚠️ M1 只做**解析与展示**：`streamChat` 仍然走 `getActiveProvider()`（BYOK 链路）。
 * 接线在 M2（`prepareChatRequest` 改造 + `provider-credentials.ts`），
 * 这样 M1 上线不会因为官方链路未就绪而破坏现有用户。
 */
import { API_BASE, DEFAULT_OFFICIAL_MODEL } from "@/shared/auth/config"
import type { AuthSnapshot } from "@/shared/auth/types"
import type { ExtensionSettings, ProviderConfig } from "@/shared/types"

/** 官方 provider 的固定 id：不进 `providers[]`，只在运行时构造 */
export const OFFICIAL_PROVIDER_ID = "official"

/**
 * 构造官方 provider 的运行时配置。
 * `apiKey` 故意留空：真正的凭据由 background 在发请求前注入（`provider-credentials.ts`），
 * 绝不写进这个对象、绝不进存储。
 */
export function buildOfficialProvider(input: { snapshot: AuthSnapshot; officialModel?: string }): ProviderConfig {
  return {
    id: OFFICIAL_PROVIDER_ID,
    kind: "official",
    name: "AIction",
    apiKey: "",
    model: input.officialModel?.trim() || input.snapshot.officialModel?.trim() || DEFAULT_OFFICIAL_MODEL,
    // TODO(M2): 改为从 `/v1/meta` 下发，届时不再依赖构建期 API_BASE
    apiBaseUrl: `${API_BASE}/v1`,
    modelParams: {}
  }
}

/**
 * 解析当前生效的 provider，规则按顺序（先命中先返回）：
 *
 * 1. `useOfficialService === false` → 用户显式关闭官方服务 → 走 BYOK；
 * 2. 快照处于 `signed-in` / `anonymous` → 官方服务；
 * 3. 否则 → `providers[]` 里的 `activeProviderId`（找不到则 null）。
 *
 * `useOfficialService === undefined`（老存档 / 新用户默认）等价于「跟随会话状态」：
 * 已登录或已领到匿名 device token 才走官方服务，未登录时行为与现状完全一致。
 */
export function resolveActiveProvider(
  settings: ExtensionSettings,
  snapshot: AuthSnapshot
): ProviderConfig | null {
  const useOfficial = settings.useOfficialService !== false
  const hasSession = snapshot.state === "signed-in" || snapshot.state === "anonymous"

  if (useOfficial && hasSession) {
    return buildOfficialProvider({ snapshot, officialModel: settings.officialModel })
  }

  // `official` 不该出现在 providers[]（不可编辑 / 删除 / 导出），异常存档直接跳过，
  // 避免把「空 apiKey 的官方 provider」当成 BYOK 发出去。
  const active = settings.providers.find(
    (provider) => provider.id === settings.activeProviderId && provider.kind !== "official"
  )
  // `kind` 缺省即 byok：在这里归一化，上层（尤其 M2 的 `resolveProvider`）永远无需处理 undefined
  return active ? { ...active, kind: active.kind ?? "byok" } : null
}
