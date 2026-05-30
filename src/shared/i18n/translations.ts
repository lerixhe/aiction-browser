import en from "@/shared/i18n/locales/en"
import zhCN from "@/shared/i18n/locales/zh_CN"

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

export function resolveLocale(locale: string): Locale {
  // Exact match or Simplified Chinese variants → zh_CN
  if (locale === "zh_CN" || locale === "zh-CN" || locale === "zh") return "zh_CN"
  // Traditional Chinese (zh-TW, zh-Hant, zh-HK, etc.) falls back to English
  // since we don't have Traditional Chinese translations
  if (locale.startsWith("zh")) return "en"
  return "en"
}
