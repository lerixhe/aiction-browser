import { uiSpace, uiTypography, type UiTheme } from "@/shared/ui/tokens"
import { createFieldLabelStyle, createInputStyle } from "@/shared/ui/styles"
import type { ModelParams } from "@/shared/types"
import type { ModelParamSupport } from "@/shared/models-dev"
import { useI18n } from "@/shared/i18n/context"

interface ModelParamsEditorProps {
  theme: UiTheme
  modelParams: ModelParams
  paramSupport: ModelParamSupport
  modelOutputLimit?: number
  modelContextLimit?: number
  focusedField: string | null
  onParamChange: (key: keyof ModelParams, value: ModelParams[keyof ModelParams]) => void
  onFocusField: (field: string) => void
  onBlurField: () => void
}

type ParamEntry =
  | { kind: "number"; key: "maxTokens" | "contextSize"; label: string; desc: string; min: number; max?: number }
  | { kind: "triState"; key: "reasoning"; label: string; desc: string }
  | { kind: "effort"; key: "reasoningEffort"; label: string; desc: string }

export function ModelParamsEditor({
  theme,
  modelParams,
  paramSupport,
  modelOutputLimit,
  modelContextLimit,
  focusedField,
  onParamChange,
  onFocusField,
  onBlurField
}: ModelParamsEditorProps) {
  const { t } = useI18n()

  const fieldLabelStyle = createFieldLabelStyle(theme)
  const createInput = (fieldName: string) => createInputStyle(theme, focusedField === fieldName)

  const unsupportedLimitHint = modelOutputLimit
    ? `(max: ${modelOutputLimit.toLocaleString()}, ${t("options.connection.paramUnlimited")})`
    : `(${t("options.connection.paramUnlimited")})`
  const unsupportedContextHint = modelContextLimit
    ? `(max: ${modelContextLimit.toLocaleString()})`
    : ""

  const allParams: ParamEntry[] = [
    {
      kind: "number",
      key: "maxTokens",
      label: "Max Tokens",
      desc: `${t("options.connection.paramMaxTokens")} ${unsupportedLimitHint}`,
      min: 1,
      max: modelOutputLimit
    },
    {
      kind: "number",
      key: "contextSize",
      label: "Context Size",
      desc: `${t("options.connection.paramContextSizeDesc")} ${unsupportedContextHint}`,
      min: 1,
      max: modelContextLimit
    },
    {
      kind: "triState",
      key: "reasoning",
      label: "Reasoning",
      desc: t("options.connection.paramReasoningDesc")
    },
    {
      kind: "effort",
      key: "reasoningEffort",
      label: "Reasoning Effort",
      desc:
        modelParams.reasoning === false
          ? t("options.connection.paramReasoningEffortOffHint")
          : t("options.connection.paramReasoningEffortDesc")
    }
  ]

  const supportedParams = allParams.filter((param) => paramSupport[param.key as keyof ModelParamSupport])

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

              {param.kind === "number" ? (
                <input
                  id={`model-param-${param.key}`}
                  type="number"
                  /* 数值参数：空 = 未填充（忽略该参数） */
                  value={modelParams[param.key] ?? ""}
                  min={param.min}
                  max={param.max}
                  onFocus={() => onFocusField(`modelParams-${param.key}`)}
                  onBlur={onBlurField}
                  onChange={(event) => {
                    const raw = event.target.value
                    if (raw === "") {
                      onParamChange(param.key, undefined)
                      return
                    }
                    const value = Number(raw)
                    onParamChange(param.key, Number.isFinite(value) ? value : undefined)
                  }}
                  style={createInput(`modelParams-${param.key}`)}
                />
              ) : param.kind === "triState" ? (
                /* 三态选择：未填充（忽略）/ 启用 / 禁用 */
                <select
                  id={`model-param-${param.key}`}
                  value={modelParams[param.key] === true ? "on" : modelParams[param.key] === false ? "off" : ""}
                  onFocus={() => onFocusField(`modelParams-${param.key}`)}
                  onBlur={onBlurField}
                  onChange={(event) => {
                    const raw = event.target.value
                    onParamChange(param.key, raw === "on" ? true : raw === "off" ? false : undefined)
                  }}
                  style={{ ...createInput(`modelParams-${param.key}`), width: "100%", cursor: "pointer" }}>
                  <option value=""></option>
                  <option value="on">{t("options.connection.paramEnabled")}</option>
                  <option value="off">{t("options.connection.paramDisabled")}</option>
                </select>
              ) : (
                /* 思考力度档位 */
                <select
                  id={`model-param-${param.key}`}
                  value={modelParams.reasoningEffort ?? ""}
                  disabled={modelParams.reasoning === false}
                  onFocus={() => onFocusField(`modelParams-${param.key}`)}
                  onBlur={onBlurField}
                  onChange={(event) => {
                    const raw = event.target.value
                    onParamChange("reasoningEffort", raw === "" ? undefined : (raw as "low" | "medium" | "high"))
                  }}
                  style={{
                    ...createInput(`modelParams-${param.key}`),
                    width: "100%",
                    cursor: modelParams.reasoning === false ? "not-allowed" : "pointer",
                    opacity: modelParams.reasoning === false ? 0.5 : 1
                  }}>
                  <option value=""></option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
