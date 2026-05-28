import type { ActionTemplate, ExtensionSettings, ModelParams, ModelServiceConfig } from "@/shared/types"

export const DEFAULT_ACTIONS: ActionTemplate[] = [
  {
    id: "explain",
    label: "解释",
    template: "帮我解释选中内容「{text}」",
    enabled: true,
    iconText: "释"
  },
  {
    id: "translate",
    label: "翻译",
    template: "请将以下内容翻译为简体中文：\n{text}",
    enabled: true,
    iconText: "译"
  }
]

export const DEFAULT_MODEL_PARAMS: ModelParams = {
  maxTokens: 1024,
  temperature: 0.3,
  topP: 0.9,
  presencePenalty: 0,
  frequencyPenalty: 0
}

export const DEFAULT_CUSTOM_MODEL_SERVICE: ModelServiceConfig = {
  id: "",
  type: "custom",
  name: "",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  modelParams: DEFAULT_MODEL_PARAMS
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  modelServices: [],
  activeModelServiceId: "",
  theme: "auto",
  toolbarMode: "pill",
  actions: DEFAULT_ACTIONS,
  telemetryEnabled: true
}

type SectionKey = "appearance" | "actions" | "about"

export const SECTION_DEFAULTS: Record<SectionKey, Partial<ExtensionSettings>> = {
  appearance: {
    theme: DEFAULT_SETTINGS.theme,
    toolbarMode: DEFAULT_SETTINGS.toolbarMode
  },
  actions: {
    actions: DEFAULT_SETTINGS.actions
  },
  about: {
    telemetryEnabled: DEFAULT_SETTINGS.telemetryEnabled
  }
}
