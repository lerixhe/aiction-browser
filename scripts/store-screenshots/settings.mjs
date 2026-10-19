export const SETTINGS = {
  providers: [
    {
      id: "p-openai",
      name: "OpenAI",
      apiKey: "sk-demo",
      model: "gpt-4o-mini",
      apiBaseUrl: `http://127.0.0.1:${Number(process.env.PORT ?? 4173)}/v1`,
      modelParams: {}
    },
    {
      id: "p-anthropic",
      name: "Anthropic",
      apiKey: "sk-demo",
      model: "claude-sonnet-4-5",
      apiBaseUrl: `http://127.0.0.1:${Number(process.env.PORT ?? 4173)}/v1`,
      modelParams: {}
    }
  ],
  activeProviderId: "p-openai",
  theme: "light",
  language: "en",
  actions: [
    {
      id: "explain",
      label: "Explain",
      template: `Explain this passage for a curious reader:\n\n{selection}`,
      enabled: true,
      icon: "tabler:bulb"
    },
    {
      id: "translate",
      label: "Translate",
      template: `Translate between English and Chinese:\n\n{selection}`,
      enabled: true,
      icon: "tabler:language"
    },
    {
      id: "summarize",
      label: "Summarize",
      template: `Summarize this in three sentences:\n\n{selection}`,
      enabled: true,
      icon: "tabler:align-left"
    },
    {
      id: "rewrite",
      label: "Polish",
      template: `Rewrite this more clearly, same meaning and length:\n\n{selection}`,
      enabled: true,
      icon: "tabler:sparkles"
    }
  ],
  quickActions: [
    { id: "copyToClipboard", type: "copyToClipboard", icon: "tabler:copy", enabled: true },
    { id: "speakText", type: "speakText", icon: "tabler:volume", enabled: true }
  ],
  tts: { provider: "edge", edgeVoice: "en-US-AriaNeural", rate: 1, autoLocale: true },
  telemetryEnabled: false,
  systemPrompt: ""
}
