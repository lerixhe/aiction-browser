import type { ActionTemplate, ExtensionSettings, ModelParams, ModelServiceConfig } from "@/shared/types"

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

export const DEFAULT_MODEL_PARAMS: ModelParams = {
  maxTokens: 1024,
  temperature: 0.3,
  topP: 0.9,
  presencePenalty: 0,
  frequencyPenalty: 0
}

export const DEFAULT_CUSTOM_MODEL_SERVICE: ModelServiceConfig = {
  id: "",
  provider: "openai",
  name: "",
  apiKey: "",
  model: "gpt-4o-mini",
  modelParams: DEFAULT_MODEL_PARAMS
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  modelServices: [],
  activeModelServiceId: "",
  theme: "auto",
  language: "system",
  actions: DEFAULT_ACTIONS,
  telemetryEnabled: true
}

type SectionKey = "appearance" | "actions" | "about"

export const SECTION_DEFAULTS: Record<SectionKey, Partial<ExtensionSettings>> = {
  appearance: {
    theme: DEFAULT_SETTINGS.theme
  },
  actions: {
    actions: DEFAULT_SETTINGS.actions
  },
  about: {
    telemetryEnabled: DEFAULT_SETTINGS.telemetryEnabled
  }
}
