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
import { API_BASE, DEFAULT_OFFICIAL_MODEL, OFFICIAL_AI_ENABLED } from "@/shared/auth/config"
import { resolveOfficialModel } from "@/shared/auth/official-model"
import type { AuthSnapshot, OfficialModel } from "@/shared/auth/types"
import type { ExtensionSettings, ProviderConfig } from "@/shared/types"

/** 官方 provider 的固定 id：不进 `providers[]`，只在运行时构造 */
export const OFFICIAL_PROVIDER_ID = "official"

/**
 * 构造官方 provider 的运行时配置。
 * `apiKey` 故意留空：真正的凭据由 background 在发请求前注入（`provider-credentials.ts`），
 * 绝不写进这个对象、绝不进存储。
 *
 * 这里的 `model` 是**未经白名单校正**的初步值（`settings.officialModel` → 兜底常量）。
 * 真正发请求时用 `resolveEngine()` 再校正一次（见那个函数的注释）。
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
 * 0. `OFFICIAL_AI_ENABLED === false`（M1）→ **直接走 BYOK**：官方链路尚未接线，
 *    此时声称「官方服务」会让界面显示的引擎与实际发请求的提供商分成两套；
 * 1. `useOfficialService === false` → 用户显式关闭官方服务 → 走 BYOK；
 * 2. 快照处于 `signed-in` / `anonymous` → 官方服务；
 * 3. 否则 → `providers[]` 里的 `activeProviderId`（找不到则 null）。
 *
 * `useOfficialService === undefined`（老存档 / 新用户默认）等价于「跟随会话状态」：
 * 已登录或已领到匿名 device token 才走官方服务，未登录时行为与现状完全一致。
 *
 * `options.officialEnabled` 只给单测用：默认取构建期常量，注入后能双向断言
 * 「M1 未接线 → 恒 BYOK」与「M2 接线后 → 按会话选官方」两种行为，
 * 否则一旦常量置 true，M1 的回归断言就没人保护了。
 */
export function resolveActiveProvider(
  settings: ExtensionSettings,
  snapshot: AuthSnapshot,
  options: { officialEnabled?: boolean } = {}
): ProviderConfig | null {
  const officialEnabled = options.officialEnabled ?? OFFICIAL_AI_ENABLED
  const useOfficial = officialEnabled && settings.useOfficialService !== false
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

/**
 * 当前引擎的**最终**解析（官方模型已按白名单校正）。
 *
 * 为什么还需要这一层：`resolveActiveProvider()` 是同步纯函数，它看不到白名单，
 * 因此只能给「用户偏好 || 兜底常量」。而白名单决定了这个偏好**当前档位还能不能用**：
 * 用户选了 `aiction-pro` 后降档到 free，偏好仍留在设置里 —— 不校正的话每一次官方对话
 * 都 403 `model_not_allowed`，而设置页却会显示 `aiction-fast`（那是另一份解析）。
 *
 * 三条约束：
 * 1. 只在官方引擎下加载白名单：BYOK 不该因为一次多余的 `/v1/models` 拖慢首字节；
 * 2. **白名单拿不到时原样返回**（保持现有行为，不因一次列表失败换掉用户的模型）；
 * 3. I/O 由调用方注入（`loadOfficialModels`）而不是这里 import：本模块在 Options / Popup
 *    的依赖链上，直接引 `models.ts` 会把 `request.ts`（取 token 的代码路径）带进 UI bundle。
 */
export async function resolveEngine(input: {
  settings: ExtensionSettings
  snapshot: AuthSnapshot
  loadOfficialModels: () => Promise<OfficialModel[] | null>
  /** 只给单测用：默认取构建期常量 */
  officialEnabled?: boolean
}): Promise<ProviderConfig | null> {
  const { settings, snapshot, loadOfficialModels } = input
  const provider = resolveActiveProvider(settings, snapshot, { officialEnabled: input.officialEnabled })
  if (!provider || provider.kind !== "official") return provider

  let models: OfficialModel[] | null = null
  try {
    models = await loadOfficialModels()
  } catch {
    models = null
  }
  if (!models) return provider

  const model = resolveOfficialModel(models, snapshot.plan, settings.officialModel)
  return model && model !== provider.model ? { ...provider, model } : provider
}
