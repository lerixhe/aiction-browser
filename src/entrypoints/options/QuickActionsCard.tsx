import { useEffect, useRef, useState } from "react"

import { useI18n } from "@/shared/i18n/context"
import { MESSAGE_TYPES } from "@/shared/constants"
import { EDGE_TTS_VOICE_GROUPS, isKnownEdgeTtsVoice } from "@/shared/edge-tts-voices"
import { useUiThemeName } from "@/shared/ui/theme"
import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { uiThemes } from "@/shared/ui/tokens"
import type { ExtensionSettings, QuickAction, TtsProvider, TtsSettings, TtsSynthesizeResponse } from "@/shared/types"
import { Button, FieldGroup, SectionCard, SelectField, SettingRow, StatusMessage } from "./ui"

interface QuickActionsCardProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

/** 快捷动作：全是即时项（开关 / 下拉 / 滑条），卡片不带保存条 */
export function QuickActionsCard({ settings, saveSettingsNow }: QuickActionsCardProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const updateQuickAction = (index: number, patch: Partial<QuickAction>) => {
    saveSettingsNow((current) => ({
      ...current,
      quickActions: current.quickActions.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }))
  }

  const updateTts = (patch: Partial<TtsSettings>) => {
    saveSettingsNow((current) => ({
      ...current,
      tts: { ...current.tts, ...patch }
    }))
  }

  const quickActionLabel = (action: QuickAction): string => t(`options.actions.quickAction.${action.type}`)

  const quickActionDescription = (action: QuickAction): string | undefined => {
    const key = `options.actions.quickAction.${action.type}.description` as const
    const value = t(key)
    return value === key ? undefined : value
  }

  // --- 试听 ---
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "playing">("idle")
  const [previewError, setPreviewError] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const stopPreview = () => {
    previewAudioRef.current?.pause()
    previewAudioRef.current = null
    setPreviewState("idle")
  }

  // 切换引擎/语音时停止正在播放的试听；卸载时清理
  useEffect(() => {
    stopPreview()
  }, [settings.tts.provider, settings.tts.edgeVoice])

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    }
  }, [])

  const handlePreview = async () => {
    if (previewState === "loading") return
    if (previewState === "playing") {
      stopPreview()
      return
    }

    setPreviewError(false)
    setPreviewState("loading")
    try {
      // 试听固定用所选语音；示例句随语音语言（中文语音配中文句，其余配英文句）
      const voiceLocale = settings.tts.edgeVoice.split("-").slice(0, 2).join("-").toLowerCase()
      const previewText = voiceLocale.startsWith("zh")
        ? t("options.actions.tts.previewTextZh")
        : t("options.actions.tts.previewTextEn")

      const response = (await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.TTS_SYNTHESIZE_REQUEST,
        payload: { text: previewText, voice: settings.tts.edgeVoice, rate: settings.tts.rate }
      })) as TtsSynthesizeResponse | undefined

      if (!response?.success || !response.audioBase64) {
        throw new Error(response?.error || "preview failed")
      }

      const audio = new Audio(`data:${response.contentType || "audio/mpeg"};base64,${response.audioBase64}`)
      previewAudioRef.current = audio
      audio.onended = () => {
        previewAudioRef.current = null
        setPreviewState("idle")
      }
      audio.onerror = () => {
        previewAudioRef.current = null
        setPreviewState("idle")
      }
      await audio.play()
      setPreviewState("playing")
    } catch (error) {
      console.warn("[AIction] TTS preview failed:", error)
      previewAudioRef.current = null
      setPreviewState("idle")
      setPreviewError(true)
    }
  }

  const speakTextEnabled = settings.quickActions.some((action) => action.type === "speakText" && action.enabled)

  return (
    <SectionCard
      title={t("options.actions.quickActionsTitle")}
      description={t("options.actions.quickActionsDesc")}>
      <FieldGroup>
        {settings.quickActions.map((action, index) => (
          <SettingRow
            key={action.id}
            title={quickActionLabel(action)}
            desc={quickActionDescription(action)}
            width="narrow">
            <ToggleSwitch
              checked={action.enabled}
              onChange={() => updateQuickAction(index, { enabled: !action.enabled })}
              theme={theme}
            />
          </SettingRow>
        ))}

        {/* 朗读引擎设置：仅当「朗读」快捷操作启用时显示 */}
        {speakTextEnabled ? (
          <>
            <SettingRow title={t("options.actions.tts.engine")} desc={t("options.actions.tts.edgeHint")}>
              <SelectField
                value={settings.tts.provider}
                ariaLabel={t("options.actions.tts.engine")}
                onValueChange={(value) => updateTts({ provider: value as TtsProvider })}
                options={[
                  { value: "edge", label: t("options.actions.tts.engineEdge") },
                  { value: "system", label: t("options.actions.tts.engineSystem") }
                ]}
              />
            </SettingRow>

            {settings.tts.provider === "edge" ? (
              <SettingRow title={t("options.actions.tts.voice")} desc={t("options.actions.tts.voiceDesc")}>
                  <SelectField
                    value={settings.tts.edgeVoice}
                    ariaLabel={t("options.actions.tts.voice")}
                    onValueChange={(value) => updateTts({ edgeVoice: value })}>
                    {/* 保存过的自定义语音不在精选列表内时额外展示，避免值丢失 */}
                    {!isKnownEdgeTtsVoice(settings.tts.edgeVoice) ? (
                      <option value={settings.tts.edgeVoice}>{settings.tts.edgeVoice}</option>
                    ) : null}
                    {EDGE_TTS_VOICE_GROUPS.map((group) => (
                      <optgroup key={group.locale} label={group.label}>
                        {group.voices.map((voice) => (
                          <option key={voice.name} value={voice.name}>
                            {voice.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </SelectField>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={previewState === "loading"}
                    onClick={() => void handlePreview()}>
                    {previewState === "loading"
                      ? t("options.actions.tts.previewLoading")
                      : previewState === "playing"
                        ? t("options.actions.tts.previewStop")
                        : t("options.actions.tts.preview")}
                  </Button>
                </SettingRow>
            ) : null}

            <SettingRow
              title={t("options.actions.tts.rate")}
              desc={`${settings.tts.rate.toFixed(2)}x`}
              width="wide">
              <input
                type="range"
                className="opt-range"
                min={0.5}
                max={2}
                step={0.05}
                value={settings.tts.rate}
                aria-label={t("options.actions.tts.rate")}
                onChange={(event) => updateTts({ rate: Number(event.target.value) })}
              />
            </SettingRow>

            {settings.tts.provider === "edge" ? (
              <SettingRow
                title={t("options.actions.tts.autoLocale")}
                desc={t("options.actions.tts.autoLocaleHint")}
                width="narrow">
                <ToggleSwitch
                  checked={settings.tts.autoLocale}
                  onChange={() => updateTts({ autoLocale: !settings.tts.autoLocale })}
                  theme={theme}
                />
              </SettingRow>
            ) : null}
          </>
        ) : null}
      </FieldGroup>

      {previewError ? <StatusMessage tone="error">{t("options.actions.tts.previewFailed")}</StatusMessage> : null}
    </SectionCard>
  )
}
