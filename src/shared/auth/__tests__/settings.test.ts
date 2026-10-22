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

  it("officialModel / useOfficialService 缺省为 undefined（不写默认值）", () => {
    const settings = normalizeSettings(legacyArchive)
    expect(settings.officialModel).toBeUndefined()
    expect(settings.useOfficialService).toBeUndefined()
  })

  it("officialModel 去掉首尾空白；空白串视为未设置", () => {
    expect(normalizeSettings({ ...legacyArchive, officialModel: "  aiction-fast " }).officialModel).toBe("aiction-fast")
    expect(normalizeSettings({ ...legacyArchive, officialModel: "   " }).officialModel).toBeUndefined()
    expect(normalizeSettings({ ...legacyArchive, officialModel: 42 }).officialModel).toBeUndefined()
  })

  it("useOfficialService 只接受布尔值", () => {
    expect(normalizeSettings({ ...legacyArchive, useOfficialService: true }).useOfficialService).toBe(true)
    expect(normalizeSettings({ ...legacyArchive, useOfficialService: false }).useOfficialService).toBe(false)
    expect(normalizeSettings({ ...legacyArchive, useOfficialService: "yes" }).useOfficialService).toBeUndefined()
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

  it("kind: official 保留（不应出现，出现也如实保留供排查）", () => {
    const [trimmed] = trimProviders([{ id: "a", name: "A", apiKey: "", model: "m", modelParams: {}, kind: "official" }])
    expect(trimmed.kind).toBe("official")
  })
})
