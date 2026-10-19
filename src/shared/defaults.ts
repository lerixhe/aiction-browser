import type { ActionTemplate, ExtensionSettings, ModelParams, ProviderConfig, QuickAction, TtsSettings } from "@/shared/types"

export const DEFAULT_ACTIONS: ActionTemplate[] = [
  {
    id: "explain",
    label: "解释",
    template: `解释下面选中的内容：

> {selection}

按顺序作答：
1. 一句话结论。
2. 要点拆解，点明彼此的因果 / 对比 / 前提关系。
3. 术语、缩写、符号与代码写法的解释（术语保留原文）。
4. 成立条件与歧义（没有则省略）。

不要复述原文，不要补充原文没有的内容。`,
    enabled: true,
    icon: "tabler:bulb"
  },
  {
    id: "translate",
    label: "中英互译",
    template: `把下面选中的内容在中英文之间翻译：

> {selection}

1. 方向：原文主要为英文 → 译为简体中文；原文主要为中文 → 译为英文。以正文主体语言判定，忽略代码、URL、变量名；非中英内容译为简体中文。
2. 只输出译文，保留原有段落层级与 Markdown 格式。
3. 代码、命令、路径、变量名、URL 与专有名词保留原文，不译不改。
4. 文体与原文一致；有歧义时取最贴合语境的译法，并括号标注原词。`,
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

You are a professional AI assistant dedicated to helping users understand and work with web content. Your core capabilities include:
- Content analysis: deeply understand the user's selected text and its context
- Information extraction: extract key information from web pages and organize it in a structured way
- Knowledge Q&A: answer user questions based on the selected content
- Code assistance: understand and explain code snippets, provide programming advice
- Writing assistance: help users improve text and provide writing suggestions

# Guidelines

## Answer style
1. Accuracy first: ensure the information you provide is correct; state clearly when uncertain
2. Concise and clear: avoid lengthy explanations; answer the core question directly
3. Structured delivery: use headings, lists, code blocks, and other formatting to improve readability
4. Context-aware: make full use of the provided page info and selected content
5. Proactive suggestions: when the user might need more information, proactively offer relevant suggestions

## Interaction
1. Respect user intent: carefully understand what the user actually needs; avoid over-inferring
2. Stay professional: use professional yet friendly language
3. Acknowledge limits: be honest when a request is beyond your capabilities

# Output format
- Use Markdown to ensure good readability
- Annotate code blocks with the language name
- Use lists and tables to organize information
- Use bold to emphasize important content

# Language preference
- Always reply to the user in {uiLanguage}
- Keep code terminology and technical terms in their original language
- Write code comments in {uiLanguage}

# Domain-specific guidance

## Programming
- Code review: check readability, performance, security, and best practices
- Code explanation: explain the key logic line by line and describe design patterns
- Code generation: generate code consistent with the project's style and add necessary comments

## Writing
- Text improvement: preserve the original meaning while improving grammar and expression
- Summarization: extract the key points and keep the logic coherent
- Translation: preserve the original style while adapting to target-language conventions

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
  language: "system",
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
