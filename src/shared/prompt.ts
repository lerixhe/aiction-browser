import type { ExtensionSettings, LanguagePreference, SelectionContext } from "@/shared/types"
import { DEFAULT_SYSTEM_PROMPT } from "@/shared/defaults"
import { resolveLocale, resolveSystemLocale, type Locale } from "@/shared/i18n/translations"

/** 系统提示词支持的占位符（未列出的占位符原样保留） */
const SYSTEM_PROMPT_PLACEHOLDERS = [
  "selection",
  "pageTitle",
  "pageUrl",
  "metaDescription",
  "surround",
  "uiLanguage"
] as const

type SystemPromptPlaceholder = (typeof SYSTEM_PROMPT_PLACEHOLDERS)[number]

/** 占位符替换时的额外注入值（与选区上下文无关、随请求传入） */
interface PlaceholderExtras {
  /** 当前界面语言的可读描述（如「简体中文」） */
  uiLanguage: string
}

/**
 * 旧版占位符兼容：AI actions 动作模板的选区占位符曾为 {text}，现统一为 {selection}
 * （与系统提示词 {pageTitle} 等语义化占位符命名一致），已保存的旧模板在读取时自动迁移。
 */
export function migrateLegacyActionTemplate(template: string): string {
  return template.replaceAll("{text}", "{selection}")
}

/** Locales 在提示词中的可读描述：让模型明确知道该用什么语言回答 */
const LOCALE_DISPLAY_NAMES: Record<Locale, string> = {
  en: "English",
  zh_CN: "简体中文（Simplified Chinese）"
}

/**
 * 解析用户语言偏好为当前界面语言的可读描述。
 * 「跟随系统」时读取浏览器 / 系统语言标签；仅内容脚本上下文调用（后台不构建 system 消息）。
 */
export function resolveUILanguageLabel(preference?: LanguagePreference | null): string {
  const pref: LanguagePreference = preference ?? "system"
  const locale = pref === "system" ? resolveSystemLocale() : resolveLocale(pref)
  return LOCALE_DISPLAY_NAMES[locale]
}

/**
 * 占位符替换值（缺失的上下文项替换为空字符串）
 */
function resolvePlaceholderValue(
  placeholder: SystemPromptPlaceholder,
  context: SelectionContext,
  extras: PlaceholderExtras
): string {
  switch (placeholder) {
    case "selection":
      return context.text
    case "pageTitle":
      return context.title
    case "pageUrl":
      return context.url
    case "metaDescription":
      return context.meta?.description ?? ""
    case "surround":
      return context.surround ?? ""
    case "uiLanguage":
      return extras.uiLanguage
  }
}

/**
 * 解析动作模板。当前动作模板只有 `{selection}` 一个占位符，解析**不依赖设置项**，
 * 所以 `settings` 只是历史签名（保留可选以免调用方必须 await 读取设置）：
 * 触发路径可以在任何 await 之前同步算出 prompt，防抖判断才不会踩到竞态。
 */
export function resolveActionTemplate(
  template: string,
  context: SelectionContext,
  settings?: ExtensionSettings
): string {
  void settings
  return template
    .replaceAll("{selection}", context.text)
}

export function formatFreeInputPrompt(input: string, text: string): string {
  return `帮我${input}「${text}」`
}

/**
 * 构建随请求发送的 system 消息。
 * 指令部分来自用户编辑的系统提示词模板（空白/未配置时回退默认模板），
 * 模板中的占位符由选区上下文在运行时注入。
 */
export function buildContextSystemMessage(
  context: SelectionContext,
  systemPrompt?: string,
  uiLanguage?: string
): string {
  const template = systemPrompt && systemPrompt.trim() ? systemPrompt : DEFAULT_SYSTEM_PROMPT
  const extras: PlaceholderExtras = {
    uiLanguage: uiLanguage && uiLanguage.trim() ? uiLanguage.trim() : LOCALE_DISPLAY_NAMES.en
  }

  const content = template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if ((SYSTEM_PROMPT_PLACEHOLDERS as readonly string[]).includes(name)) {
      return resolvePlaceholderValue(name as SystemPromptPlaceholder, context, extras)
    }
    return match
  })

  // 清理因缺失上下文（空替换）产生的多余空行
  return content.replace(/\n{3,}/g, "\n\n").trim()
}

export function hasTextPlaceholder(template: string): boolean {
  return template.includes("{selection}")
}
