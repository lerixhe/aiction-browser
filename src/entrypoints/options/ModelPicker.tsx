import { useRef } from "react"

import { trackEvent } from "@/shared/analytics"
import { useI18n } from "@/shared/i18n/context"
import type { ModelsDevModel } from "@/shared/models-dev"
import { Button, SelectField, StatusMessage, cx } from "./ui"

function SparkleIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5L9.3 6.7L14.5 8L9.3 9.3L8 14.5L6.7 9.3L1.5 8L6.7 6.7L8 1.5Z"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 8A5.5 5.5 0 1 1 8 2.5M13.5 2.5V6.5H9.5"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface ModelPickerProps {
  currentModel: string
  hasModelsDevId: boolean
  devModels: ModelsDevModel[]
  fetchedModels: string[]
  fetchingModels: boolean
  fetchError: string | null
  modelSearchQuery: string
  smartFilling: boolean
  smartFillStatus: { count: number; notice?: string | null } | null
  onModelChange: (model: string) => void
  onFetchModels: () => void
  onSmartFillParams: () => void
  onClearFetchedModels: () => void
  onSearchQueryChange: (query: string) => void
}

/** 模型选择控件（放在「基础」组的 Model 行里，不含标题与说明） */
export function ModelPicker({
  currentModel,
  hasModelsDevId,
  devModels,
  fetchedModels,
  fetchingModels,
  fetchError,
  modelSearchQuery,
  smartFilling,
  smartFillStatus,
  onModelChange,
  onFetchModels,
  onSmartFillParams,
  onClearFetchedModels,
  onSearchQueryChange
}: ModelPickerProps) {
  const { t } = useI18n()

  const query = modelSearchQuery.trim().toLowerCase()
  const filtered = query
    ? devModels.filter((model) => model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query))
    : devModels

  /** 手输模型名时记录聚焦前的值：blur 时真的变了才算一次「选择」（避免逐字上报） */
  const manualEntryStartRef = useRef<string | null>(null)

  /**
   * 模型选择埋点。只在「明确的选择动作」上触发：
   * - `models_dev`：models.dev 模型列表点选（`from_search` 区分是否先搜过）
   * - `fetched`：从接口拉取的模型下拉选择
   * - `manual`：手输模式，仅在值真的变化时上报，且**不上报模型名**（用户自由文本）
   */
  const reportModelSelected = (sourceList: "models_dev" | "fetched" | "manual", model?: string) => {
    void trackEvent("model_selected", {
      provider_type: hasModelsDevId ? "models_dev" : "custom",
      source_list: sourceList,
      from_search: sourceList === "models_dev" && query.length > 0,
      ...(model ? { model } : {}),
      source: "options"
    })
  }

  const useFetchedSelect = !hasModelsDevId && fetchedModels.length > 0

  return (
    <div className="opt-stack">
      <div style={{ display: "flex", gap: 8, width: "100%" }}>
        {useFetchedSelect ? (
          <SelectField
            id="provider-model"
            value={currentModel}
            ariaLabel={t("options.connection.model")}
            onValueChange={(value) => {
              onModelChange(value)
              reportModelSelected("fetched", value)
            }}
            options={fetchedModels.map((id) => ({ value: id, label: id }))}
          />
        ) : (
          <input
            id="provider-model"
            className="opt-input opt-mono"
            value={currentModel}
            placeholder="model-name"
            onFocus={() => {
              manualEntryStartRef.current = currentModel
            }}
            onBlur={() => {
              const startValue = manualEntryStartRef.current
              manualEntryStartRef.current = null
              const next = currentModel.trim()
              if (startValue !== null && next && next !== startValue.trim()) {
                reportModelSelected("manual")
              }
            }}
            onChange={(event) => onModelChange(event.target.value)}
          />
        )}

        {useFetchedSelect ? (
          <Button size="sm" variant="secondary" onClick={onClearFetchedModels}>
            {t("options.connection.manualInput")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshIcon />}
            disabled={fetchingModels || hasModelsDevId}
            onClick={onFetchModels}>
            {fetchingModels ? t("options.connection.fetching") : t("options.connection.fetchModels")}
          </Button>
        )}

        {/* 智能填充参数：永远存在，点击后提示「成功补充 X 个」 */}
        <Button
          size="sm"
          variant="secondary"
          icon={<SparkleIcon />}
          disabled={smartFilling}
          onClick={onSmartFillParams}>
          {smartFilling ? t("options.connection.smartFilling") : t("options.connection.smartFillParams")}
        </Button>
      </div>

      {!useFetchedSelect && devModels.length > 0 ? (
        <div className="opt-model-list">
          <input
            type="text"
            className="opt-input opt-input--sm"
            value={modelSearchQuery}
            placeholder={t("options.connection.modelSearchPlaceholder")}
            aria-label={t("options.connection.modelSearchPlaceholder")}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
          <div className="opt-model-list-body">
            {filtered.map((model) => {
              const isSelected = currentModel === model.id
              return (
                <button
                  key={model.id}
                  type="button"
                  className={cx("opt-model-option", isSelected && "opt-model-option--selected")}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onModelChange(model.id)
                    reportModelSelected("models_dev", model.id)
                  }}>
                  <span className="opt-model-option-name">{model.name}</span>
                  {model.reasoning ? <span className="opt-badge opt-badge--accent">reasoning</span> : null}
                  {model.tool_call ? <span className="opt-badge opt-badge--success">tools</span> : null}
                  {model.attachment ? <span className="opt-badge opt-badge--warning">attach</span> : null}
                </button>
              )
            })}
            {filtered.length === 0 ? (
              <div className="opt-model-list-empty">
                {t("options.connection.noModelsMatching", [modelSearchQuery])}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {fetchError ? <StatusMessage tone="error">{fetchError}</StatusMessage> : null}

      {smartFillStatus ? (
        <>
          <StatusMessage tone="success">
            {t("options.connection.smartFillSuccess", [String(smartFillStatus.count)])}
          </StatusMessage>
          {smartFillStatus.notice ? (
            <p className="opt-hint">{t("options.connection.smartFillNotice", [smartFillStatus.notice])}</p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
