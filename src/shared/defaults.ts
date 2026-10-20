import { AUTO_LANGUAGE } from "@/shared/i18n/preference"
import type { ActionTemplate, ExtensionSettings, ModelParams, ProviderConfig, QuickAction, TtsSettings } from "@/shared/types"

export const DEFAULT_ACTIONS: ActionTemplate[] = [
  {
    id: "explain",
    label: "解释",
    template: `解释下面选中的内容：

> {selection}

- 先说结论，不要开场白，不要复述原文。
- 内容简单（一个词、短语或符号）时，一两句说清含义与用法就够了，不要展开成多角度的分析。
- 内容确实复杂（多个概念、多步骤、有歧义）时才分点，每点都要有实质信息；不要为了凑结构罗列并列关系、因果关系或适用条件。
- 术语、缩写与代码写法保留原文；不补充原文没有的信息。`,
    enabled: true,
    icon: "tabler:bulb"
  },
  {
    id: "translate",
    label: "中英互译",
    template: `把下面选中的内容在中英文之间翻译：

> {selection}

- 方向：原文主要为英文 → 简体中文；原文主要为中文 → 英文。以正文主体语言判定，忽略代码、URL、变量名；非中英内容译为简体中文。
- 只输出译文，保留原有段落层级与 Markdown 格式；不加解释、不加总结、不加译注。
- 代码、命令、路径、变量名、URL 与专有名词保留原文，不译不改。
- 文体与原文一致；有歧义时取最贴合语境的译法。`,
    enabled: true,
    icon: "tabler:language"
  }
]

/** 内置动作 ID：不可删除、不算「自定义动作」（可改名 / 改模板 / 禁用） */
export const BUILTIN_ACTION_IDS = ["explain", "translate"] as const

const BUILTIN_ACTION_ID_SET: ReadonlySet<string> = new Set(BUILTIN_ACTION_IDS)

/** 是否内置动作（埋点与 UI 统一以此区分 is_custom） */
export function isBuiltinActionId(actionId: string | undefined): boolean {
  return Boolean(actionId) && BUILTIN_ACTION_ID_SET.has(actionId as string)
}

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "copyToClipboard",
    type: "copyToClipboard",
    icon: "tabler:copy",
    enabled: true
  },
  {
    id: "speakText",
    type: "speakText",
    icon: "tabler:volume",
    enabled: true
  }
]

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  provider: "edge",
  edgeVoice: "zh-CN-XiaoxiaoNeural",
  rate: 1,
  autoLocale: true
}

/** 模型参数默认值：所有项均未填充（undefined = 忽略，不随请求发送） */
export const DEFAULT_MODEL_PARAMS: ModelParams = {}

/**
 * 系统提示词默认模板：静态指令 + 页面上下文占位符。
 * 支持占位符：{selection} 用户选区内容（与动作模板一致）、{pageTitle} 页面标题、{pageUrl} 页面 URL、
 * {metaDescription} 页面描述、{surround} 所在段落上下文（缺失时替换为空字符串）。
 */
export const DEFAULT_SYSTEM_PROMPT = `# Role

You are an AI assistant that helps users understand and work with the content they select on web pages.

# Guidelines

- Accuracy first: be correct, and say plainly when something is uncertain.
- Follow the user's request and the action instructions; do not over-interpret or expand the scope.
- Concise by default: lead with the answer, then add only what the user needs. Match the length to the request — a single term, sentence or short snippet needs a short answer, not a report.
- Plain paragraphs are the default. Use Markdown only when it genuinely helps (code blocks with a language tag, a short list for parallel items); do not add headings, tables or nested structure just to look organized.
- Do not restate the selected text.
- Do not proactively add suggestions, follow-up offers, summaries or "next steps".
- Acknowledge limits: be honest when a request is beyond your capabilities.

# Language preference
- Always reply to the user in {uiLanguage}
- Keep code terminology and technical terms in their original language
- Write code comments in {uiLanguage}

# Domain-specific guidance

## Programming
- Code explanation: explain what the code does and the logic that matters; skip line-by-line narration for short snippets
- Code review: raise correctness, performance, security and readability issues that actually matter; skip nitpicks
- Code generation: match the style of the surrounding code and comment only where the intent isn't obvious

## Writing
- Text improvement: keep the original meaning and voice; change only what needs changing
- Summarization: keep the key points and the original logic
- Translation: preserve the original style while following target-language conventions

# Page context

## Page info
- Title: {pageTitle}
- URL: {pageUrl}
- Description: {metaDescription}

## Selected content
> {selection}

## Surrounding context
{surround}`

export const DEFAULT_CUSTOM_MODEL_PROVIDER: ProviderConfig = {
  id: "",
  name: "",
  apiKey: "",
  model: "",
  modelParams: DEFAULT_MODEL_PARAMS
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  providers: [],
  activeProviderId: "",
  theme: "auto",
  language: AUTO_LANGUAGE,
  actions: DEFAULT_ACTIONS,
  quickActions: DEFAULT_QUICK_ACTIONS,
  tts: DEFAULT_TTS_SETTINGS,
  telemetryEnabled: true,
  systemPrompt: DEFAULT_SYSTEM_PROMPT
}

type SectionKey = "appearance" | "actions" | "about"

export const SECTION_DEFAULTS: Record<SectionKey, Partial<ExtensionSettings>> = {
  appearance: {
    theme: DEFAULT_SETTINGS.theme
  },
  actions: {
    actions: DEFAULT_SETTINGS.actions,
    quickActions: DEFAULT_SETTINGS.quickActions,
    tts: DEFAULT_SETTINGS.tts
  },
  about: {
    telemetryEnabled: DEFAULT_SETTINGS.telemetryEnabled
  }
}
