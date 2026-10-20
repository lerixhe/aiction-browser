import en from "@/shared/i18n/locales/en"
import ja from "@/shared/i18n/locales/ja"
import ko from "@/shared/i18n/locales/ko"
import ru from "@/shared/i18n/locales/ru"
import vi from "@/shared/i18n/locales/vi"
import zhCN from "@/shared/i18n/locales/zh_CN"
import zhTW from "@/shared/i18n/locales/zh_TW"

/**
 * 界面语言注册表：语言清单的**唯一真源**。
 *
 * - `id` 用下划线形态，它同时是**存储值（`settings.language`）+ 字典键 + `public/_locales` 目录名**，
 *   三者刻意保持一致、不做映射。
 * - `tag` 是 BCP-47 标签，**语言匹配的唯一依据**（解析与打分在 `translations.ts`，本文件不猜）。
 * - `nativeName` 是该语言的自称，直接作为语言选择器的显示名（不翻译：「日本語」对所有用户都可读）。
 * - `promptName` 注入系统提示词，让模型明确该用什么语言回答。
 *
 * 新增一门语言 = 加字典文件 + 加 `public/_locales/<id>/messages.json` + 这里追加一行，
 * 其余（`Locale` 类型 / 设置校验 / 下拉选项 / 提示词显示名）全部从这里派生。
 *
 * 数组顺序 = 同分时的匹配优先级，也是设置页下拉的显示顺序（按语言代码字母序，方便人工核对）。
 */
export const SUPPORTED_LOCALES = [
  { id: "en", tag: "en", nativeName: "English", promptName: "English", messages: en },
  { id: "ja", tag: "ja", nativeName: "日本語", promptName: "日本語（Japanese）", messages: ja },
  { id: "ko", tag: "ko", nativeName: "한국어", promptName: "한국어（Korean）", messages: ko },
  { id: "ru", tag: "ru", nativeName: "Русский", promptName: "Русский（Russian）", messages: ru },
  { id: "vi", tag: "vi", nativeName: "Tiếng Việt", promptName: "Vietnamese (Tiếng Việt)", messages: vi },
  { id: "zh_CN", tag: "zh-CN", nativeName: "简体中文", promptName: "简体中文（Simplified Chinese）", messages: zhCN },
  { id: "zh_TW", tag: "zh-TW", nativeName: "繁體中文", promptName: "繁體中文（Traditional Chinese）", messages: zhTW }
] as const satisfies readonly LocaleDefinition[]

export interface LocaleDefinition {
  /** 存储值 / 字典键 / `_locales` 目录名 */
  id: string
  /** BCP-47 语言标签 */
  tag: string
  /** 语言选择器显示名（自称，不翻译） */
  nativeName: string
  /** 注入系统提示词的可读描述 */
  promptName: string
  /** 该语言的文案字典 */
  messages: Record<string, string>
}

/** 受支持的界面语言 id */
export type Locale = (typeof SUPPORTED_LOCALES)[number]["id"]

/** 无法识别语言标签时的最终回退 */
export const DEFAULT_LOCALE: Locale = "en"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_LOCALES.some((row) => row.id === value)
}

export function getLocaleDefinition(locale: Locale): LocaleDefinition {
  return SUPPORTED_LOCALES.find((row) => row.id === locale) ?? SUPPORTED_LOCALES[0]
}

/**
 * 取某语言的文案字典。
 *
 * 非默认语言会**与默认语言合并**：运行时缺键回退英文，而不是把 key 本身显示给用户。
 * 键集一致已由各字典的 `satisfies Record<MessageKey, string>` 在**编译期**保证
 * （缺键 / 多键 / 拼错键名都会报错），这里的合并是运行时双保险。
 */
export function getMessages(locale: Locale): Record<string, string> {
  const definition = getLocaleDefinition(locale)
  if (locale === DEFAULT_LOCALE) return definition.messages
  return { ...getLocaleDefinition(DEFAULT_LOCALE).messages, ...definition.messages }
}
