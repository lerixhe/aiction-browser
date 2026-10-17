import type { ExtensionSettings, SelectionContext } from "@/shared/types"
import { DEFAULT_SYSTEM_PROMPT } from "@/shared/defaults"

/** 系统提示词支持的占位符（未列出的占位符原样保留） */
const SYSTEM_PROMPT_PLACEHOLDERS = ["selection", "pageTitle", "pageUrl", "metaDescription", "surround"] as const

type SystemPromptPlaceholder = (typeof SYSTEM_PROMPT_PLACEHOLDERS)[number]

/**
 * 占位符替换值（缺失的上下文项替换为空字符串）
 */
function resolvePlaceholderValue(placeholder: SystemPromptPlaceholder, context: SelectionContext): string {
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
  }
}

export function resolveActionTemplate(
  template: string,
  context: SelectionContext,
  settings: ExtensionSettings
): string {
  return template
    .replaceAll("{text}", context.text)
}

export function formatFreeInputPrompt(input: string, text: string): string {
  return `帮我${input}「${text}」`
}

/**
 * 构建随请求发送的 system 消息。
 * 指令部分来自用户编辑的系统提示词模板（空白/未配置时回退默认模板），
 * 模板中的占位符由选区上下文在运行时注入。
 */
export function buildContextSystemMessage(context: SelectionContext, systemPrompt?: string): string {
  const template = systemPrompt && systemPrompt.trim() ? systemPrompt : DEFAULT_SYSTEM_PROMPT

  const content = template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if ((SYSTEM_PROMPT_PLACEHOLDERS as readonly string[]).includes(name)) {
      return resolvePlaceholderValue(name as SystemPromptPlaceholder, context)
    }
    return match
  })

  // 清理因缺失上下文（空替换）产生的多余空行
  return content.replace(/\n{3,}/g, "\n\n").trim()
}

export function hasTextPlaceholder(template: string): boolean {
  return template.includes("{text}")
}
