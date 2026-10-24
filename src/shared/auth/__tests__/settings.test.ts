/**
 * 设置迁移的回归（AGENTS.md「配置迁移与默认值」检查单 + SPEC §4.5）。
 *
 * 两个容易翻车的点：
 * 1. `validateProviders()` 是**白名单重建对象**——不显式补 `kind`，字段每次读取都会丢；
 * 2. 兜底值**不写回**存储（`trimProviders` 剔掉 `kind: "byok"`），老用户的 sync 存档形态保持不变。
 */
import { describe, expect, it } from "vitest"
import { normalizeSettings, trimProviders } from "@/shared/storage"

const legacyArchive = {
  providers: [{ id: "svc-1", name: " 我的服务 ", apiKey: " sk-1 ", model: " gpt-x ", modelParams: {} }],
  activeProviderId: "svc-1",
  theme: "dark",
  language: "zh_CN",
  telemetryEnabled: false
}

describe("normalizeSettings：官方服务字段", () => {
  it("老存档（provider 无 kind）读出来是 byok", () => {
    const settings = normalizeSettings(legacyArchive)
    expect(settings.providers[0].kind).toBe("byok")
  })

  it("存档里显式写了 official 时不会被静默改写（异常存档只兜底不撒谎）", () => {
    const settings = normalizeSettings({
      ...legacyArchive,
      providers: [{ ...legacyArchive.providers[0], kind: "official" }]
    })
    expect(settings.providers[0].kind).toBe("official")
  })

  it("officialModel 缺省为 undefined（不写默认值）", () => {
    expect(normalizeSettings(legacyArchive).officialModel).toBeUndefined()
  })

  /**
   * M2 的迁移：存档里**已经有 BYOK provider** 且从未表达过偏好 → 落 `false`（继续用自己的 Key）。
   *
   * 为什么必须这样：`undefined` 的语义是「跟随会话」，而 M2 之后每个用户都会拿到匿名主体，
   * 于是存量用户会在升级后**静默**被切到官方网关——选文开始发往我们的服务器，
   * 而商店描述与隐私政策承诺的是「用自己的 Key 时内容不经过我们的服务器」。
   * 这批人当初配 Key 往往就是为了不走第三方。
   */
  it("存量 BYOK 存档（无偏好）→ useOfficialService 落 false：升级不改数据流向", () => {
    expect(normalizeSettings(legacyArchive).useOfficialService).toBe(false)
  })

  it("新装 / 没有任何 provider → 保持 undefined（跟随会话，零配置直接对话）", () => {
    expect(normalizeSettings({}).useOfficialService).toBeUndefined()
    expect(normalizeSettings({ providers: [] }).useOfficialService).toBeUndefined()
  })

  it("用户显式选择过的偏好必须原样保留（迁移不能把「就是要用官方」写坏）", () => {
    expect(normalizeSettings({ ...legacyArchive, useOfficialService: true }).useOfficialService).toBe(true)
    expect(normalizeSettings({ ...legacyArchive, useOfficialService: false }).useOfficialService).toBe(false)
  })

  it("officialModel 去掉首尾空白；空白串视为未设置", () => {
    expect(normalizeSettings({ ...legacyArchive, officialModel: "  aiction-fast " }).officialModel).toBe("aiction-fast")
    expect(normalizeSettings({ ...legacyArchive, officialModel: "   " }).officialModel).toBeUndefined()
    expect(normalizeSettings({ ...legacyArchive, officialModel: 42 }).officialModel).toBeUndefined()
  })

  it("useOfficialService 只接受布尔值（脏值按「没表达过偏好」处理）", () => {
    // 脏值不是偏好 → 按上面那条迁移规则：有 provider 就落 false
    expect(normalizeSettings({ ...legacyArchive, useOfficialService: "yes" }).useOfficialService).toBe(false)
    expect(normalizeSettings({ providers: [], useOfficialService: "yes" }).useOfficialService).toBeUndefined()
  })

  it("老字段仍然完好（迁移不动其它字段）", () => {
    const settings = normalizeSettings(legacyArchive)
    expect(settings.theme).toBe("dark")
    expect(settings.activeProviderId).toBe("svc-1")
    expect(settings.telemetryEnabled).toBe(false)
  })
})

describe("trimProviders：存储形态保持干净", () => {
  it("kind: byok 不写回存档", () => {
    const [trimmed] = trimProviders([{ id: "a", name: " A ", apiKey: " k ", model: " m ", modelParams: {}, kind: "byok" }])
    expect("kind" in trimmed).toBe(false)
    expect(trimmed.name).toBe("A")
  })

  it("kind: official 被剔除（它只能在运行时构造，永远不该落盘）", () => {
    // 旧版曾“如实保留供排查”，实测代价更大：它会出现在提供商列表里供用户编辑 / 导出，
    // 却是一个 apiKey 永远为空的幽灵项（点测试只会报错）。`official` 的唯一来源是
    // `buildOfficialProvider()` 的运行时构造，所以存档里见到它必然是坏数据。
    const trimmed = trimProviders([
      { id: "a", name: "A", apiKey: "", model: "m", modelParams: {}, kind: "official" },
      { id: "b", name: "B", apiKey: "k", model: "m", modelParams: {} }
    ])

    expect(trimmed.map((provider) => provider.id)).toEqual(["b"])
  })
})
