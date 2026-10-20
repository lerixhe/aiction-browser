import en from "@/shared/i18n/locales/en"
import zhCN from "@/shared/i18n/locales/zh_CN"
import { parseLocaleTag } from "@/shared/language-tag"

export type Locale = "en" | "zh_CN"

export const SUPPORTED_LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh_CN", label: "简体中文" }
]

const messages: Record<Locale, Record<string, string>> = {
  en: en as unknown as Record<string, string>,
  zh_CN: zhCN as unknown as Record<string, string>
}

export function getMessages(locale: Locale): Record<string, string> {
  return messages[locale] ?? messages.en
}

// 语言 → 默认 locale（key 为 ISO 639 主语言子标签，封闭集；未列出的语言一律回退 en）
const PREFERRED_LOCALE_BY_LANGUAGE = new Map<string, Locale>([
  ["en", "en"],
  ["zh", "zh_CN"]
])

/** 暂无译文的中文书写系统（CLDR 的 script 代码），命中则回退英文 */
const UNSUPPORTED_CHINESE_SCRIPT = "Hant"

/**
 * 把语言标签解析为受支持的 locale；不认识的语言返回 null（区别于「认识但无译文」）。
 *
 * 简繁判定交给 `Intl.Locale.maximize()`（CLDR likely-subtags 数据）：
 * `zh` → zh-Hans-CN、`zh-SG` / `zh-Hans-SG` → Hans、`zh-TW` / `zh-HK` / `zh-MO` → Hant。
 * 因此不需要自己维护「哪些地区算简体」的名单（那是永远不全的枚举）。
 */
function matchSupportedLocale(tag: string | null | undefined): Locale | null {
  const locale = parseLocaleTag(tag)
  if (!locale) return null
  const preferred = PREFERRED_LOCALE_BY_LANGUAGE.get(locale.language)
  if (!preferred) return null
  if (preferred === "zh_CN" && locale.maximize().script === UNSUPPORTED_CHINESE_SCRIPT) {
    return "en"
  }
  return preferred
}

/** 任意语言标签 → 受支持 locale（无法识别时回退 en） */
export function resolveLocale(tag: string | null | undefined): Locale {
  return matchSupportedLocale(tag) ?? "en"
}

/**
 * 当前环境可用的语言标签候选（按可信度排序）。
 *
 * 扩展里 `navigator.language` 跟随浏览器 UI 语言，而不是操作系统语言；
 * `chrome.i18n.getUILanguage()` 是 MV3 下最权威的浏览器语言来源。
 * 两者都可能被用户单独改过，所以全部收集起来，由 `resolveSystemLocale()` 决策。
 */
export function getSystemLanguageTags(): string[] {
  const tags: string[] = []
  try {
    // 必须先用 typeof 判断：可选链保护不了「变量未声明」的 ReferenceError
    if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
      const uiLanguage = chrome.i18n.getUILanguage()
      if (uiLanguage) tags.push(uiLanguage)
    }
  } catch {
    // chrome.i18n 在某些上下文（页面注入 / 测试环境）不可用，忽略
  }
  if (typeof navigator !== "undefined") {
    if (navigator.language) tags.push(navigator.language)
    for (const language of navigator.languages ?? []) tags.push(language)
  }
  return [...new Set(tags)]
}

/**
 * 「跟随系统」的实际取值：用平台解析全部候选标签，任一来源为中文即中文。
 * 理由：Chrome UI 语言与系统语言可以各自单独设置，「中文系统 + 英文 UI」极常见，
 * 任一来源表明中文都代表用户的中文偏好；纯英文环境不受影响。
 */
export function resolveSystemLocale(): Locale {
  const resolved = getSystemLanguageTags()
    .map((tag) => matchSupportedLocale(tag))
    .filter((locale): locale is Locale => locale !== null)
  if (resolved.includes("zh_CN")) return "zh_CN"
  return resolved[0] ?? "en"
}
