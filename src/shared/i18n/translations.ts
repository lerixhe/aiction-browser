import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/shared/i18n/registry"
import { parseLocaleTag } from "@/shared/language-tag"

// 语言清单与字典在 registry（唯一真源）；这里原样透出，保持既有 import 路径可用
export { DEFAULT_LOCALE, SUPPORTED_LOCALES, getLocaleDefinition, getMessages, isLocale } from "@/shared/i18n/registry"
export type { Locale, LocaleDefinition } from "@/shared/i18n/registry"

/** 候选 locale 的归一化形态（全部来自注册表的 `tag`，见文件末尾的 CANDIDATES） */
interface LocaleCandidate {
  id: Locale
  language: string
  script?: string
  region?: string
}

/**
 * 候选预计算：每行的 `tag` 一律 `maximize()` 归一，得到 language / script / region。
 *
 * 例：`en` → en-Latn-US、`zh-CN` → zh-Hans-CN、`zh-TW` → zh-Hant-TW、`ja` → ja-Jpan-JP。
 * 匹配规则只依赖这三个维度，不依赖任何「哪些地区算简体」的名单。
 */
const CANDIDATES: LocaleCandidate[] = SUPPORTED_LOCALES.map((row) => {
  const parsed = parseLocaleTag(row.tag)
  if (!parsed) {
    throw new Error(`[i18n] locale "${row.id}" 的 tag "${row.tag}" 不是合法的 BCP-47 语言标签`)
  }
  const normalized = parsed.maximize()
  return {
    id: row.id as Locale,
    language: normalized.language,
    script: normalized.script,
    region: normalized.region
  }
})

/**
 * 语言标签 → 受支持的 locale；不认识、或该书写系统没有译文时返回 **null**（不猜、不跨语言降级）。
 *
 * 规则（全部从 `tag` 派生，无特例）：
 * 1. 主语言不同 → 不是候选。
 * 2. 书写系统都有值且不同 → 淘汰。`zh-Hant` 与 `zh-CN`(Hans) 冲突；注册表里有 `zh-TW`(Hant) 时
 *    自动命中它，没有就整体落空（宁可回退默认语言，也不用错字形/术语）。
 * 3. 同语言内打分：script 相同 +2，region 相同 +1。
 * 4. 取最高分；同分取 `SUPPORTED_LOCALES` 靠前者（声明顺序即优先级）。
 */
export function matchLocale(tag: string | null | undefined): Locale | null {
  const parsed = parseLocaleTag(tag)
  if (!parsed) return null
  const normalized = parsed.maximize()
  let best: { id: Locale; score: number } | null = null
  for (const candidate of CANDIDATES) {
    if (candidate.language !== normalized.language) continue
    if (candidate.script && normalized.script && candidate.script !== normalized.script) continue
    let score = 0
    if (candidate.script && candidate.script === normalized.script) score += 2
    if (candidate.region && candidate.region === normalized.region) score += 1
    // 严格大于：同分保留先声明者
    if (!best || score > best.score) best = { id: candidate.id, score }
  }
  return best?.id ?? null
}

/** 任意语言标签 → 受支持 locale（无法识别时回退默认语言） */
export function resolveLocale(tag: string | null | undefined): Locale {
  return matchLocale(tag) ?? DEFAULT_LOCALE
}

/**
 * 浏览器 UI 语言标签：**唯一来源**。
 *
 * 只认 `chrome.i18n.getUILanguage()`（MV3 权威来源；Firefox 经 WXT 的 browser/chrome 兼容层同样可用）。
 * 刻意**不读** `navigator.language` / `navigator.languages`：在 macOS 上它们可能反映**系统语言**，
 * 读进来会让「跟随浏览器」静默退化成「跟随系统」。
 * 拿不到（非扩展上下文：合成页测试 / 纯网页注入）→ null，由调用方落默认语言。
 */
export function getBrowserUiLanguage(): string | null {
  try {
    // 必须先用 typeof 判断：可选链保护不了「变量未声明」的 ReferenceError
    if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
      return chrome.i18n.getUILanguage() || null
    }
  } catch {
    // chrome.i18n 在某些上下文（页面注入 / 测试环境）不可用，忽略
  }
  return null
}

/**
 * 「跟随浏览器」的实际取值：把浏览器 UI 语言解析为受支持 locale，无法识别时回退默认语言。
 *
 * ⚠️ 与旧的「跟随系统 + 中文优先」相比是**有意的行为变更**：
 * 旧的实现会把 `navigator.*`（macOS 上可能是系统语言）也纳入候选并偏爱中文，
 * 于「英文浏览器 + 中文系统」会得到中文；现在语言偏好以浏览器 UI 语言为准，那批用户会得到英文。
 */
export function resolveBrowserLocale(): Locale {
  return matchLocale(getBrowserUiLanguage()) ?? DEFAULT_LOCALE
}
