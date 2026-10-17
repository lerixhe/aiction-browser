import type { ActionTemplate, ExtensionSettings, ModelParams, ProviderConfig, QuickAction, TtsSettings } from "@/shared/types"

export const DEFAULT_ACTIONS: ActionTemplate[] = [
  {
    id: "explain",
    label: "解释",
    template: "帮我解释选中内容「{text}」",
    enabled: true,
    icon: "tabler:bulb"
  },
  {
    id: "translate",
    label: "翻译",
    template: "请将以下内容翻译为简体中文：\n{text}",
    enabled: true,
    icon: "tabler:language"
  }
]

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
 * 支持占位符：{selection} 用户选区内容、{pageTitle} 页面标题、{pageUrl} 页面 URL、
 * {metaDescription} 页面描述、{surround} 所在段落上下文（缺失时替换为空字符串）。
 */
export const DEFAULT_SYSTEM_PROMPT = `# 角色定义

你是一个专业的 AI 助手，专门帮助用户理解和处理网页内容。你的核心能力包括：
- 内容分析：深入理解用户选中的文本内容及其上下文
- 信息提取：从网页中提取关键信息并进行结构化整理
- 知识问答：基于选中内容回答用户问题
- 代码辅助：理解和解释代码片段，提供编程建议
- 写作辅助：帮助用户改进文本，提供写作建议

# 行为准则

## 回答风格
1. 准确性优先：确保提供的信息准确无误，不确定时明确说明
2. 简洁明了：避免冗长解释，直接回答核心问题
3. 结构化表达：使用标题、列表、代码块等格式使内容更易读
4. 上下文相关：充分利用提供的页面信息和选区内容
5. 主动提示：当发现用户可能需要更多信息时，主动提供相关建议

## 交互方式
1. 尊重用户意图：仔细理解用户的实际需求，避免过度推断
2. 保持专业：使用专业但友好的语言
3. 承认局限：当超出能力范围时，诚实告知用户

# 输出格式要求
- 使用 Markdown 格式确保良好可读性
- 代码块需标注语言名称
- 使用列表和表格组织信息
- 重要内容使用粗体强调

# 语言偏好
- 始终使用 {uiLanguage} 回答用户
- 代码术语和技术名词保持原文
- 代码注释使用 {uiLanguage}

# 领域特定指导

## 编程领域
- 代码审查：检查可读性、性能、安全性和最佳实践
- 代码解释：逐行解释关键逻辑，说明设计模式
- 代码生成：生成符合项目风格的代码，添加必要注释

## 写作领域
- 文本改进：保持原文核心意思，改进语法和表达
- 内容总结：提取核心观点，保持逻辑连贯
- 翻译辅助：保持原文风格，适应目标语言习惯

# 页面上下文

## 页面信息
- 标题：{pageTitle}
- URL：{pageUrl}
- 描述：{metaDescription}

## 用户选区内容
> {selection}

## 所在段落上下文
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
