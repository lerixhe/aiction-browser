/**
 * i18n 一致性校验：注册表 / 字典 / public/_locales 三者对齐 + 语言匹配矩阵。
 *
 * 用法：npm run check:i18n
 *
 * 为什么需要它：语言清单收敛到 registry 之后，「加一门语言」只剩三处改动（字典文件、
 * _locales 目录、注册表一行），全靠人眼核对太容易漏。这个脚本把三处对齐关系与
 * 匹配规则写成断言，漏一处就在这里失败。
 */
import fs from "node:fs"
import path from "node:path"
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  AUTO_LANGUAGE,
  isLanguagePreference,
  normalizeLanguagePreference,
  preferenceToLocale
} from "@/shared/i18n/preference"
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getLocaleDefinition,
  getMessages,
  matchLocale,
  resolveBrowserLocale,
  resolveLocale
} from "@/shared/i18n/translations"
import { parseLocaleTag } from "@/shared/language-tag"

const ROOT = process.cwd()
const LOCALES_DIR = path.resolve(ROOT, "public/_locales")
const WXT_CONFIG = path.resolve(ROOT, "wxt.config.ts")

let passed = 0
const failures: string[] = []

function expect(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++
    return
  }
  failures.push(detail ? `${label} — ${detail}` : label)
}

function expectEqual<T>(label: string, actual: T, expected: T): void {
  expect(label, Object.is(actual, expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}

function section(title: string): void {
  console.log(`\n── ${title}`)
}

// ── 1. 注册表自洽：tag 合法、能匹配回自身 ────────────────────────────────

section("1. 注册表自洽（tag 合法 / 自反匹配）")
for (const row of SUPPORTED_LOCALES) {
  const parsed = parseLocaleTag(row.tag)
  expect(`tag 合法：${row.id} "${row.tag}"`, parsed !== null)
  if (parsed) {
    const normalized = parsed.maximize()
    console.log(
      `   ${row.id.padEnd(6)} tag=${row.tag.padEnd(6)} → ${normalized.language}-${normalized.script}-${normalized.region}`
    )
  }
  // 自反性：自己的 tag 必须匹配回自己（新增语言时自动覆盖，不需要改脚本）
  expectEqual(`tag 匹配回自身：${row.id}`, matchLocale(row.tag), row.id)
}
expect("DEFAULT_LOCALE 存在于注册表", SUPPORTED_LOCALES.some((row) => row.id === DEFAULT_LOCALE))
expectEqual("resolveLocale(DEFAULT_LOCALE)", resolveLocale(DEFAULT_LOCALE), DEFAULT_LOCALE)

// ── 2. 匹配矩阵 ─────────────────────────────────────────────────────────

section("2. 语言匹配矩阵")

/** 注册表里是否已有繁体中文（决定 Hant 系列候选的去向，P4 加 zh_TW 后本脚本无需修改） */
const hasTraditionalChinese = SUPPORTED_LOCALES.some((row) => row.id === "zh_TW")

/** 注册表里是否已有该语言（让矩阵随注册表生长，而不是写死「当前没有」） */
const hasLocale = (id: string): boolean => SUPPORTED_LOCALES.some((row) => row.id === id)

const MATRIX: { tag: string | null | undefined; expected: string | null }[] = [
  // 英文：地区变体都归到 en（script 相同即可命中）
  { tag: "en", expected: "en" },
  { tag: "en-US", expected: "en" },
  { tag: "en-GB", expected: "en" },
  // 中文：CLDR likely-subtags 归一后按书写系统分流
  { tag: "zh", expected: "zh_CN" },
  { tag: "zh-CN", expected: "zh_CN" },
  { tag: "zh_CN", expected: "zh_CN" }, // 历史配置里的下划线写法
  { tag: "zh-Hans", expected: "zh_CN" },
  { tag: "zh-SG", expected: "zh_CN" },
  { tag: "zh-Hans-SG", expected: "zh_CN" }, // macOS 简中系统语言
  // 繁体：有 zh_TW 就命中它，没有就整体落空（不回退到简体）
  { tag: "zh-TW", expected: hasTraditionalChinese ? "zh_TW" : null },
  { tag: "zh-HK", expected: hasTraditionalChinese ? "zh_TW" : null },
  { tag: "zh-Hant", expected: hasTraditionalChinese ? "zh_TW" : null },
  // 未支持的语言：返回 null（不是回退到 en —— 回退由 resolveLocale 负责）
  { tag: "de-DE", expected: null },
  { tag: "th-TH", expected: null },
  // 这些语言一旦加入注册表就应命中自身（加语言时本脚本无需修改）
  { tag: "ja", expected: hasLocale("ja") ? "ja" : null },
  { tag: "az", expected: hasLocale("az") ? "az" : null },
  // 非法 / 空标签：不猜
  { tag: null, expected: null },
  { tag: undefined, expected: null },
  { tag: "", expected: null },
  { tag: "!!!", expected: null }
]

for (const { tag, expected } of MATRIX) {
  expectEqual(`matchLocale(${JSON.stringify(tag)})`, matchLocale(tag), expected)
}
expectEqual("resolveLocale('de-DE') 回退默认", resolveLocale("de-DE"), DEFAULT_LOCALE)
expectEqual("resolveLocale(null) 回退默认", resolveLocale(null), DEFAULT_LOCALE)

// ── 3. 字典键集一致 ─────────────────────────────────────────────────────

section("3. 字典键集（原始字典，非合并结果）")
// 注意用 row.messages（原始字典）：getMessages() 会与默认语言合并，合并后键集恒等于 en，断言会失效
const referenceKeys = Object.keys(getLocaleDefinition(DEFAULT_LOCALE).messages).sort()
console.log(`   基准（${DEFAULT_LOCALE}）${referenceKeys.length} 键`)
for (const row of SUPPORTED_LOCALES) {
  const keys = Object.keys(row.messages).sort()
  const missing = referenceKeys.filter((key) => !keys.includes(key))
  const extra = keys.filter((key) => !referenceKeys.includes(key))
  // 繁体中文必须全量（繁简混排观感最差），其余语言后续允许缺键回退英文
  const detail = `缺 ${missing.length} 项${missing.length ? `（如 ${missing.slice(0, 3).join(", ")}）` : ""}，多 ${extra.length} 项`
  expect(`字典键集与 ${DEFAULT_LOCALE} 一致：${row.id}`, missing.length === 0 && extra.length === 0, detail)
}

// 合并兜底：非默认语言的 getMessages() 结果必须覆盖 benchmark 全部键（缺键回退英文）
for (const row of SUPPORTED_LOCALES) {
  const merged = getMessages(row.id)
  const missing = referenceKeys.filter((key) => merged[key] === undefined)
  expect(`getMessages(${row.id}) 无缺失键（合并兜底生效）`, missing.length === 0, `缺 ${missing.slice(0, 3).join(", ")}`)
}

expect("getMessages(默认) 不额外拷贝字典", getMessages(DEFAULT_LOCALE) === getLocaleDefinition(DEFAULT_LOCALE).messages)
const nonDefaultRow = SUPPORTED_LOCALES.find((row) => row.id !== DEFAULT_LOCALE)
if (nonDefaultRow) {
  expect(`getMessages(${nonDefaultRow.id}) 是合并副本（不污染原始字典）`, getMessages(nonDefaultRow.id) !== nonDefaultRow.messages)
}

// ── 4. public/_locales 与注册表对齐 ─────────────────────────────────────

section("4. public/_locales")
const localeDirs = fs.existsSync(LOCALES_DIR)
  ? fs
      .readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : []
const registeredIds = SUPPORTED_LOCALES.map((row) => row.id).sort()
expectEqual("_locales 目录集合与注册表一致", localeDirs.join(","), registeredIds.join(","))

const readMessages = (id: string): Record<string, unknown> | null => {
  const file = path.resolve(LOCALES_DIR, id, "messages.json")
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>
  } catch {
    return null
  }
}

const baseMessages = readMessages(DEFAULT_LOCALE)
expect(`_locales/${DEFAULT_LOCALE}/messages.json 可解析`, baseMessages !== null)
if (baseMessages) {
  const baseKeys = Object.keys(baseMessages).sort()
  for (const row of SUPPORTED_LOCALES) {
    const messages = readMessages(row.id)
    expect(`_locales/${row.id}/messages.json 存在且可解析`, messages !== null)
    if (!messages) continue
    expectEqual(
      `_locales/${row.id} 键集与 ${DEFAULT_LOCALE} 一致`,
      Object.keys(messages).sort().join(","),
      baseKeys.join(",")
    )
  }
}

// ── 5. manifest default_locale 与注册表对齐 ─────────────────────────────

section("5. manifest default_locale")
const configSource = fs.existsSync(WXT_CONFIG) ? fs.readFileSync(WXT_CONFIG, "utf8") : ""
const declaredDefault = configSource.match(/default_locale:\s*['"]([^'"]+)['"]/)?.[1] ?? null
expect("wxt.config.ts 声明了 default_locale", declaredDefault !== null)
if (declaredDefault) {
  console.log(`   default_locale = ${declaredDefault}`)
  expectEqual("default_locale 与 DEFAULT_LOCALE 一致", declaredDefault, DEFAULT_LOCALE)
  expect("default_locale 存在于 _locales", localeDirs.includes(declaredDefault))
}

// ── 6. 语言偏好（自动项 = 跟随浏览器） ──────────────────────────────────

section("6. 语言偏好（自动项 = 跟随浏览器）")

// 值域：自动项的当前值 + 历史值迁移
expectEqual('normalizeLanguagePreference("system")（历史值迁移）', normalizeLanguagePreference("system"), AUTO_LANGUAGE)
expectEqual('normalizeLanguagePreference("browser")', normalizeLanguagePreference("browser"), AUTO_LANGUAGE)
expectEqual('normalizeLanguagePreference("en")', normalizeLanguagePreference("en"), "en")
expectEqual('normalizeLanguagePreference("klingon")', normalizeLanguagePreference("klingon"), null)
expectEqual("normalizeLanguagePreference(undefined)", normalizeLanguagePreference(undefined), null)
expectEqual("DEFAULT_LANGUAGE_PREFERENCE", DEFAULT_LANGUAGE_PREFERENCE, AUTO_LANGUAGE)
expect('isLanguagePreference("system") 为 false（历史值不是合法值）', !isLanguagePreference("system"))

/** 把 `chrome.i18n.getUILanguage()` stub 成指定值（null = 该 API 不可用） */
function stubUiLanguage(language: string | null): void {
  ;(globalThis as Record<string, unknown>).chrome =
    language === null ? undefined : { i18n: { getUILanguage: () => language } }
}

const UI_CASES: { ui: string | null; expected: string }[] = [
  { ui: "en-US", expected: "en" },
  { ui: "zh-CN", expected: "zh_CN" },
  { ui: "zh-Hans-SG", expected: "zh_CN" },
  { ui: "zh-TW", expected: hasTraditionalChinese ? "zh_TW" : DEFAULT_LOCALE },
  { ui: "de-DE", expected: DEFAULT_LOCALE }, // 无译文 → 默认，不猜系统语言
  { ui: null, expected: DEFAULT_LOCALE } // chrome.i18n 不可用
]
for (const { ui, expected } of UI_CASES) {
  stubUiLanguage(ui)
  expectEqual(`resolveBrowserLocale()（getUILanguage=${ui ?? "不可用"}）`, resolveBrowserLocale(), expected)
  expectEqual(`preferenceToLocale(AUTO_LANGUAGE)（getUILanguage=${ui ?? "不可用"}）`, preferenceToLocale(AUTO_LANGUAGE), expected)
}

// 关键不变量：navigator 语言不得影响结果（「跟随浏览器」≠「跟随系统」）
stubUiLanguage("en-US")
Object.defineProperty(globalThis, "navigator", {
  value: { language: "zh-CN", languages: ["zh-CN"] },
  configurable: true,
  writable: true
})
expectEqual("英文 UI + 中文 navigator → en（不读 navigator）", resolveBrowserLocale(), "en")

// 固定偏好不受浏览器语言影响
expectEqual('preferenceToLocale("en") 与浏览器语言无关', preferenceToLocale("en"), "en")

// ── 汇总 ────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\n✘ ${failures.length} 项失败（${passed} 项通过）：`)
  for (const failure of failures) console.error(`   - ${failure}`)
  process.exit(1)
}

console.log(`\n✔ 全部通过（${passed} 项断言）`)
