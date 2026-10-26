/**
 * 「当前生效 provider」的解析规则（SPEC §6.9）。
 *
 * 这个解析是 Popup 账号行 / 面板失败态 / background 请求组装三处共用的唯一入口，
 * 错一处的表现是「UI 显示官方服务、请求却发到 BYOK」，所以四条规则逐条钉死。
 */
import { describe, expect, it } from "vitest"
import { API_BASE, DEFAULT_OFFICIAL_MODEL } from "@/shared/auth/config"
import type { AuthSnapshot, AuthState } from "@/shared/auth/types"
import { OFFICIAL_PROVIDER_ID, buildOfficialProvider, resolveActiveProvider, resolveEngine } from "@/shared/provider-resolve"
import { normalizeSettings } from "@/shared/storage"
import type { ExtensionSettings } from "@/shared/types"

function settingsWith(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    providers: [
      { id: "byok-1", name: "BYOK", apiKey: "sk-1", model: "gpt-x", modelParams: {} }
    ],
    activeProviderId: "byok-1",
    theme: "auto",
    language: "browser",
    actions: [],
    quickActions: [],
    tts: { provider: "edge", edgeVoice: "voice", rate: 1, autoLocale: true },
    telemetryEnabled: false,
    systemPrompt: "",
    ...overrides
  }
}

function snapshotOf(state: AuthState, extra: Partial<AuthSnapshot> = {}): AuthSnapshot {
  return {
    state,
    plan: state === "signed-out" ? "anonymous" : "pro",
    updatedAt: 1_000,
    ...extra
  }
}

describe("resolveActiveProvider", () => {
  it("M2（已接线）→ 已登录走官方服务；注入 false 可回滚到 BYOK", () => {
    const settings = settingsWith()
    const snapshot = snapshotOf("signed-in", { email: "u***@example.com" })

    // 默认取构建期常量（M2 = true）
    expect(resolveActiveProvider(settings, snapshot)).toMatchObject({ id: OFFICIAL_PROVIDER_ID, kind: "official" })
    // 回滚开关（`OFFICIAL_AI_ENABLED = false` 发版）：显示与实际仍同源，一起退回 BYOK
    expect(resolveActiveProvider(settings, snapshot, { officialEnabled: false })).toMatchObject({ id: "byok-1" })
  })

  it("链路接线后：已登录 + 未显式关闭官方服务 → 官方 provider", () => {
    const provider = resolveActiveProvider(
      settingsWith(),
      snapshotOf("signed-in", { email: "u***@example.com" }),
      { officialEnabled: true }
    )

    expect(provider).toMatchObject({ id: OFFICIAL_PROVIDER_ID, kind: "official", apiKey: "" })
  })

  it("链路接线后：匿名（已领 device token）也走官方服务", () => {
    expect(resolveActiveProvider(settingsWith(), snapshotOf("anonymous"), { officialEnabled: true })).toMatchObject({
      kind: "official"
    })
  })

  it("未登录 → 回落 BYOK，行为与现状一致（链路接线后同理）", () => {
    expect(resolveActiveProvider(settingsWith(), snapshotOf("signed-out"))).toMatchObject({ id: "byok-1", kind: "byok" })
    expect(
      resolveActiveProvider(settingsWith(), snapshotOf("signed-out"), { officialEnabled: true })
    ).toMatchObject({ id: "byok-1", kind: "byok" })
  })

  /**
   * M2 的迁移口径（见 `normalizeSettings`）：存量用户配了自己的 Key、从没表达过偏好，
   * 升级后**不能**被静默切到官方网关——那会让「用自己的 Key 时选文不经过我们的服务器」变成假话。
   * 这条断言把「迁移」与「解析」串起来验，只测其中一半都可能漏。
   */
  it("存量 BYOK 存档（无偏好）迁移后仍走 BYOK，即使已有匿名主体", () => {
    const migrated = normalizeSettings({
      providers: [{ id: "byok-1", name: "Mine", apiKey: "sk-user", model: "gpt-x", modelParams: {} }],
      activeProviderId: "byok-1"
    })
    expect(resolveActiveProvider(migrated, snapshotOf("anonymous"))).toMatchObject({ id: "byok-1" })
    expect(resolveActiveProvider(migrated, snapshotOf("signed-in"))).toMatchObject({ id: "byok-1" })
  })

  it("useOfficialService === false 优先于登录态（显式关闭）", () => {
    const provider = resolveActiveProvider(
      settingsWith({ useOfficialService: false }),
      snapshotOf("signed-in"),
      { officialEnabled: true }
    )
    expect(provider).toMatchObject({ id: "byok-1" })
  })

  it("activeProviderId 找不到 → null（不猜第一个）", () => {
    const settings = settingsWith({ activeProviderId: "gone" })
    expect(resolveActiveProvider(settings, snapshotOf("signed-out"))).toBeNull()
  })

  it("providers[] 里残留 kind: official 的项不被当成 BYOK 发出（异常存档兜底）", () => {
    const settings = settingsWith({
      providers: [{ id: "official", name: "AIction", apiKey: "", model: "x", modelParams: {}, kind: "official" }],
      activeProviderId: "official"
    })
    expect(resolveActiveProvider(settings, snapshotOf("signed-out"))).toBeNull()
  })
})

describe("buildOfficialProvider", () => {
  it("凭据留空，端点指向官方网关 /v1", () => {
    const provider = buildOfficialProvider({ snapshot: snapshotOf("signed-in") })
    expect(provider.apiKey).toBe("")
    expect(provider.apiBaseUrl).toBe(`${API_BASE}/v1`)
  })

  it("模型优先级：settings.officialModel > 快照 > 默认值", () => {
    const snapshot = snapshotOf("signed-in", { officialModel: "from-snapshot" })
    expect(buildOfficialProvider({ snapshot, officialModel: "from-settings" }).model).toBe("from-settings")
    expect(buildOfficialProvider({ snapshot }).model).toBe("from-snapshot")
    expect(buildOfficialProvider({ snapshot: snapshotOf("signed-in") }).model).toBe(DEFAULT_OFFICIAL_MODEL)
  })

  it("空白模型名不生效（回退默认）", () => {
    expect(buildOfficialProvider({ snapshot: snapshotOf("signed-in"), officialModel: "   " }).model).toBe(
      DEFAULT_OFFICIAL_MODEL
    )
  })
})

/**
 * `resolveEngine()`：官方模型的**最终**解析。
 *
 * 这一组是 M3 评审 P1-1 的回归保护。缺陷形态是：`resolveOfficialModel()` 只喂给 UI，
 * 请求路径仍取 `settings.officialModel || DEFAULT`，于是「设置页显示 aiction-fast、
 * 请求发 aiction-pro」→ 降档后每次对话 403 `model_not_allowed`。
 * 所以断言必须落在 `resolveEngine` 的**返回值**（= 真正拿去发请求的 provider）上，
 * 而不是只断言纯函数 `resolveOfficialModel`。
 */
describe("resolveEngine", () => {
  const fast = {
    id: "aiction-fast",
    name: "AIction Fast",
    description: "",
    minPlan: "anonymous" as const,
    contextChars: 0,
    maxOutputTokens: 0,
    supportsReasoning: false,
    recommended: false
  }
  const pro = { ...fast, id: "aiction-pro", name: "AIction Pro", minPlan: "pro" as const }

  it("偏好模型在当前档位不可用时，校正为可用模型（降档不再 403）", async () => {
    const engine = await resolveEngine({
      settings: settingsWith({ useOfficialService: true, officialModel: pro.id }),
      snapshot: snapshotOf("signed-in", { plan: "free" }),
      loadOfficialModels: async () => [fast, pro]
    })
    expect(engine?.kind).toBe("official")
    expect(engine?.model).toBe(fast.id)
  })

  it("无偏好时用服务端的 recommended（UI 显示与实际请求同一个值）", async () => {
    const models = [{ ...fast, recommended: false }, { ...pro, recommended: true }]
    const engine = await resolveEngine({
      settings: settingsWith({ useOfficialService: true }),
      snapshot: snapshotOf("signed-in", { plan: "pro" }),
      loadOfficialModels: async () => models
    })
    // 关键：不等于 DEFAULT_OFFICIAL_MODEL，证明请求侧真的用了白名单解析
    expect(engine?.model).toBe(pro.id)
  })

  it("白名单拿不到时保持原值（一次列表失败不换掉用户的模型）", async () => {
    const engine = await resolveEngine({
      settings: settingsWith({ useOfficialService: true, officialModel: pro.id }),
      snapshot: snapshotOf("signed-in", { plan: "pro" }),
      loadOfficialModels: async () => null
    })
    expect(engine?.model).toBe(pro.id)
  })

  it("loader 抛错也不影响请求（原样返回）", async () => {
    const engine = await resolveEngine({
      settings: settingsWith({ useOfficialService: true }),
      snapshot: snapshotOf("signed-in"),
      loadOfficialModels: async () => {
        throw new Error("boom")
      }
    })
    expect(engine?.model).toBe(DEFAULT_OFFICIAL_MODEL)
  })

  it("BYOK 时不加载白名单（不因一次多余的 /v1/models 拖慢首字节）", async () => {
    let calls = 0
    const engine = await resolveEngine({
      settings: settingsWith({ useOfficialService: false }),
      snapshot: snapshotOf("signed-in"),
      loadOfficialModels: async () => {
        calls++
        return [fast]
      }
    })
    expect(engine?.kind ?? "byok").toBe("byok")
    expect(calls).toBe(0)
  })

  it("官方链路关闭（回滚开关）时直接走 BYOK，且不加载白名单", async () => {
    let calls = 0
    const engine = await resolveEngine({
      settings: settingsWith({ useOfficialService: true }),
      snapshot: snapshotOf("signed-in"),
      officialEnabled: false,
      loadOfficialModels: async () => {
        calls++
        return [fast]
      }
    })
    expect(engine?.kind ?? "byok").toBe("byok")
    expect(calls).toBe(0)
  })
})
