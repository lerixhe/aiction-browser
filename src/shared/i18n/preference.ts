import { isLocale, type Locale } from "@/shared/i18n/registry"
import { resolveBrowserLocale, resolveLocale } from "@/shared/i18n/translations"
import type { LanguagePreference } from "@/shared/types"

/**
 * 语言偏好（`settings.language`）的唯一定义处。
 *
 * 「自动」= **跟随浏览器**（`chrome.i18n.getUILanguage()`）。它历史上叫「跟随系统」、
 * 存储值为 `"system"`，但扩展没有任何接口能读到操作系统语言，那个名字与实现不符，
 * 因此改名并改用 `"browser"`；旧值在读取时由 `normalizeLanguagePreference()` 迁移。
 */

/** 「自动」项：跟随浏览器 UI 语言 */
export const AUTO_LANGUAGE = "browser" as const

/** 历史存储值：旧版「跟随系统」，语义与 AUTO_LANGUAGE 等价 */
const LEGACY_AUTO_LANGUAGE = "system"

export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = AUTO_LANGUAGE

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === AUTO_LANGUAGE || isLocale(value)
}

/**
 * 存储值 / 导入值规范化：历史值 `"system"` → `"browser"`；
 * 无法识别返回 `null`（由调用方回退 `DEFAULT_LANGUAGE_PREFERENCE`）。
 */
export function normalizeLanguagePreference(value: unknown): LanguagePreference | null {
  if (value === LEGACY_AUTO_LANGUAGE) return AUTO_LANGUAGE
  return isLanguagePreference(value) ? value : null
}

/** 语言偏好 → 实际生效的 locale（自动项由浏览器 UI 语言决定） */
export function preferenceToLocale(preference: LanguagePreference): Locale {
  return preference === AUTO_LANGUAGE ? resolveBrowserLocale() : resolveLocale(preference)
}
