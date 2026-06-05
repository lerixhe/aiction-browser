import { useEffect, useRef } from "react"
import { uiSpace, uiTypography, type UiTheme } from "@/shared/ui/tokens"
import { createFieldLabelStyle, createInputStyle } from "@/shared/ui/styles"
import { DEFAULT_CUSTOM_MODEL_PROVIDER } from "@/shared/defaults"
import type { ModelParams } from "@/shared/types"
import type { ModelParamSupport } from "@/shared/models-dev"
import { useI18n } from "@/shared/i18n/context"

interface ModelParamsEditorProps {
  theme: UiTheme
  modelParams: ModelParams
  paramSupport: ModelParamSupport
  modelOutputLimit?: number
  focusedField: string | null
  onParamChange: (key: keyof ModelParams, value: number) => void
  onFocusField: (field: string) => void
  onBlurField: () => void
}

export function ModelParamsEditor({
  theme,
  modelParams,
  paramSupport,
  modelOutputLimit,
  focusedField,
  onParamChange,
  onFocusField,
  onBlurField
}: ModelParamsEditorProps) {
  const { t } = useI18n()
  const prevLimitRef = useRef(modelOutputLimit)

  const fieldLabelStyle = createFieldLabelStyle(theme)
  const createInput = (fieldName: string) => createInputStyle(theme, focusedField === fieldName)

  // Auto-cap maxTokens when model output limit changes
  useEffect(() => {
    if (modelOutputLimit !== undefined && prevLimitRef.current !== modelOutputLimit) {
      prevLimitRef.current = modelOutputLimit
      if (modelParams.maxTokens > modelOutputLimit) {
        onParamChange("maxTokens", modelOutputLimit)
      }
    }
  }, [modelOutputLimit, modelParams.maxTokens, onParamChange])

  const maxTokensMax = modelOutputLimit ?? 128000
  const unlimitedHint = t("options.connection.paramMaxTokensUnlimited")
  const maxTokensDesc = modelOutputLimit
    ? `${t("options.connection.paramMaxTokens")} (max: ${modelOutputLimit.toLocaleString()}, ${unlimitedHint})`
    : `${t("options.connection.paramMaxTokens")} (${unlimitedHint})`

  const allParams = [
    { key: "maxTokens" as const, label: "Max Tokens", placeholder: "0", min: 0, max: maxTokensMax, step: 1, desc: maxTokensDesc },
    { key: "temperature" as const, label: "Temperature", placeholder: "0.3", min: 0, max: 2, step: 0.1, desc: t("options.connection.paramTemperature") },
    { key: "topP" as const, label: "Top P", placeholder: "0.9", min: 0, max: 1, step: 0.05, desc: t("options.connection.paramTopP") },
    { key: "presencePenalty" as const, label: "Presence Penalty", placeholder: "0", min: -2, max: 2, step: 0.1, desc: t("options.connection.paramPresencePenalty") },
    { key: "frequencyPenalty" as const, label: "Frequency Penalty", placeholder: "0", min: -2, max: 2, step: 0.1, desc: t("options.connection.paramFrequencyPenalty") }
  ]

  const supportedParams = allParams.filter((p) => paramSupport[p.key])

  return (
    <div style={{ borderTop: `0.5px solid ${theme.border.hairline}`, paddingTop: uiSpace[20], marginTop: uiSpace[4] }}>
      <h3
        style={{
          margin: `0 0 ${uiSpace[4]}px`,
          fontSize: uiTypography.fontSize.md,
          fontWeight: uiTypography.fontWeight.semibold,
          letterSpacing: uiTypography.letterSpacing.tight
        }}>
        {t("options.connection.modelParams")}
      </h3>
      <p
        style={{
          margin: `0 0 ${uiSpace[16]}px`,
          color: theme.text.secondary,
          fontSize: uiTypography.fontSize.sm
        }}>
        {t("options.connection.modelParamsDesc")}
      </p>

      {supportedParams.length === 0 ? (
        <div style={{ fontSize: uiTypography.fontSize.xs, color: theme.text.secondary, fontStyle: "italic" }}>
          {t("options.connection.noSupportedParams")}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: `${uiSpace[12]}px ${uiSpace[16]}px`
          }}>
          {supportedParams.map((param) => (
            <div key={param.key}>
              <label htmlFor={`model-param-${param.key}`} style={{ ...fieldLabelStyle, marginBottom: uiSpace[4] }}>
                {param.label}
              </label>
              <div style={{ fontSize: uiTypography.fontSize.xs, color: theme.text.secondary, marginBottom: uiSpace[6] }}>
                {param.desc}
              </div>
              <input
                id={`model-param-${param.key}`}
                type="number"
                value={modelParams[param.key]}
                min={param.min}
                max={param.max}
                step={param.step}
                onFocus={() => onFocusField(`modelParams-${param.key}`)}
                onBlur={onBlurField}
                onChange={(event) => {
                  const raw = event.target.value
                  const value = raw === "" ? DEFAULT_CUSTOM_MODEL_PROVIDER.modelParams[param.key] : Number(raw)
                  onParamChange(param.key, value)
                }}
                placeholder={param.placeholder}
                style={createInput(`modelParams-${param.key}`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
