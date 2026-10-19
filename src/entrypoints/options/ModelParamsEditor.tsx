import { useI18n } from "@/shared/i18n/context"
import type { ModelParamSupport } from "@/shared/models-dev"
import type { ModelParams } from "@/shared/types"
import { FieldGroup, NumberField, SelectField, SettingRow } from "./ui"

interface ModelParamsEditorProps {
  modelParams: ModelParams
  paramSupport: ModelParamSupport
  /** 数据源给出的模型上限（仅作提示与 max 约束） */
  modelOutputLimit?: number
  modelContextLimit?: number
  onParamChange: (key: keyof ModelParams, value: ModelParams[keyof ModelParams]) => void
}

/**
 * 模型参数：行式布局，全部属于草稿字段（含下拉 —— 见 docs/OPTIONS_UI.md §2.3 细则 1）。
 * 未填充 = 该参数不随请求发送。
 */
export function ModelParamsEditor({
  modelParams,
  paramSupport,
  modelOutputLimit,
  modelContextLimit,
  onParamChange
}: ModelParamsEditorProps) {
  const { t } = useI18n()

  const maxTokensDesc = [t("options.connection.paramUnlimited")]
  if (modelOutputLimit) {
    maxTokensDesc.unshift(t("options.connection.paramSourceLimit", [modelOutputLimit.toLocaleString()]))
  }

  const contextSizeDesc = [t("options.connection.paramContextSizeDesc")]
  if (modelContextLimit) {
    contextSizeDesc.push(t("options.connection.paramSourceLimit", [modelContextLimit.toLocaleString()]))
  }

  return (
    <FieldGroup title={t("options.connection.groupParams")}>
      {paramSupport.maxTokens ? (
        <SettingRow title={t("options.connection.paramMaxTokens")} desc={maxTokensDesc.join(" ")} htmlFor="model-param-maxTokens">
          <NumberField
            id="model-param-maxTokens"
            value={modelParams.maxTokens}
            min={1}
            max={modelOutputLimit}
            placeholder={t("options.connection.paramUnlimited")}
            onValueChange={(value) => onParamChange("maxTokens", value)}
          />
        </SettingRow>
      ) : null}

      {paramSupport.contextSize ? (
        <SettingRow
          title={t("options.connection.paramContextSize")}
          desc={contextSizeDesc.join(" ")}
          htmlFor="model-param-contextSize">
          <NumberField
            id="model-param-contextSize"
            value={modelParams.contextSize}
            min={1}
            max={modelContextLimit}
            placeholder={t("options.connection.paramNoTruncate")}
            onValueChange={(value) => onParamChange("contextSize", value)}
          />
        </SettingRow>
      ) : null}

      {paramSupport.reasoning ? (
        <SettingRow
          title={t("options.connection.paramReasoning")}
          desc={t("options.connection.paramReasoningDesc")}
          htmlFor="model-param-reasoning">
          <SelectField
            id="model-param-reasoning"
            value={modelParams.reasoning === true ? "on" : modelParams.reasoning === false ? "off" : ""}
            ariaLabel={t("options.connection.paramReasoning")}
            onValueChange={(value) =>
              onParamChange("reasoning", value === "on" ? true : value === "off" ? false : undefined)
            }
            options={[
              { value: "", label: t("options.connection.paramNotSet") },
              { value: "on", label: t("options.connection.paramEnabled") },
              { value: "off", label: t("options.connection.paramDisabled") }
            ]}
          />
        </SettingRow>
      ) : null}

      {/* 思考力度：与思考模式解耦，恒可编辑。发送层不变式：
          reasoning=false 时档位不随请求发送（传档位会隐式开启思考） */}
      {paramSupport.reasoningEffort ? (
        <SettingRow
          title={t("options.connection.paramReasoningEffort")}
          desc={t("options.connection.paramReasoningEffortDesc")}
          htmlFor="model-param-reasoningEffort">
          <SelectField
            id="model-param-reasoningEffort"
            value={modelParams.reasoningEffort ?? ""}
            ariaLabel={t("options.connection.paramReasoningEffort")}
            onValueChange={(value) =>
              onParamChange("reasoningEffort", value === "" ? undefined : (value as "low" | "medium" | "high"))
            }
            options={[
              { value: "", label: t("options.connection.paramNotSet") },
              { value: "low", label: "low" },
              { value: "medium", label: "medium" },
              { value: "high", label: "high" }
            ]}
          />
        </SettingRow>
      ) : null}

      {!paramSupport.maxTokens &&
      !paramSupport.contextSize &&
      !paramSupport.reasoning &&
      !paramSupport.reasoningEffort ? (
        <p className="opt-hint">{t("options.connection.noSupportedParams")}</p>
      ) : null}
    </FieldGroup>
  )
}
