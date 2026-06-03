import { useState } from "react"
import { uiMotion, uiRadius, uiSpace, uiTypography, type UiTheme } from "@/shared/ui/tokens"
import { createButtonStyle, createInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import type { ModelsDevModel } from "@/shared/models-dev"
import { useI18n } from "@/shared/i18n/context"

function RefreshIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5M13.5 2.5V6.5H9.5" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface ModelPickerProps {
  theme: UiTheme
  currentModel: string
  hasModelsDevId: boolean
  devModels: ModelsDevModel[]
  fetchedModels: string[]
  fetchingModels: boolean
  fetchError: string | null
  modelSearchQuery: string
  focusedField: string | null
  onModelChange: (model: string) => void
  onFetchModels: () => void
  onClearFetchedModels: () => void
  onSearchQueryChange: (query: string) => void
  onFocusField: (field: string) => void
  onBlurField: () => void
}

export function ModelPicker({
  theme,
  currentModel,
  hasModelsDevId,
  devModels,
  fetchedModels,
  fetchingModels,
  fetchError,
  modelSearchQuery,
  focusedField,
  onModelChange,
  onFetchModels,
  onClearFetchedModels,
  onSearchQueryChange,
  onFocusField,
  onBlurField
}: ModelPickerProps) {
  const { t } = useI18n()

  const secondaryBtnStyle = createButtonStyle(theme, "secondary", { compact: true })
  const createInput = (fieldName: string): React.CSSProperties => createInputStyle(theme, focusedField === fieldName)

  const hasDevModels = devModels.length > 0
  const query = modelSearchQuery.trim().toLowerCase()
  const filtered = query
    ? devModels.filter(
        (m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)
      )
    : devModels

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: uiSpace[6]
        }}>
        <label htmlFor="provider-model" style={{ marginBottom: 0 }}>
          {t("options.connection.model")}
        </label>
        {!hasModelsDevId ? (
          <button
            type="button"
            onClick={onFetchModels}
            disabled={fetchingModels}
            style={{
              ...secondaryBtnStyle,
              display: "flex",
              alignItems: "center",
              gap: uiSpace[4],
              opacity: fetchingModels ? 0.5 : 1,
              cursor: fetchingModels ? "not-allowed" : "pointer"
            }}>
            <RefreshIcon size={14} color={theme.text.primary} />
            {fetchingModels ? t("options.connection.fetching") : t("options.connection.fetchModels")}
          </button>
        ) : null}
      </div>

      {!hasModelsDevId && fetchedModels.length > 0 ? (
        <div style={{ display: "flex", gap: uiSpace[8] }}>
          <select
            id="provider-model"
            value={currentModel}
            onChange={(e) => onModelChange(e.target.value)}
            style={{ ...createInput("model"), flex: 1, cursor: "pointer" }}>
            {fetchedModels.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <button type="button" onClick={onClearFetchedModels} style={secondaryBtnStyle}>
            {t("options.connection.manualInput")}
          </button>
        </div>
      ) : (
        <>
          <input
            id="provider-model"
            value={currentModel}
            onFocus={() => onFocusField("model")}
            onBlur={onBlurField}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="model-name"
            style={createInput("model")}
          />

          {hasDevModels ? (
            <div
              style={{
                marginTop: uiSpace[8],
                border: `1px solid ${theme.border.hairline}`,
                borderRadius: uiRadius.md,
                overflow: "hidden",
                background: theme.bg.surface
              }}>
              <input
                type="text"
                value={modelSearchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder={t("options.connection.modelSearchPlaceholder")}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                  fontSize: uiTypography.fontSize.xs,
                  border: "none",
                  borderBottom: `1px solid ${theme.border.hairline}`,
                  background: theme.bg.surfaceMuted,
                  color: theme.text.primary,
                  outline: "none",
                  fontFamily: uiTypography.fontFamily
                }}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: uiSpace[2],
                  maxHeight: 200,
                  overflowY: "auto",
                  padding: `${uiSpace[4]}px 0`
                }}>
                {filtered.map((m) => {
                  const isSelected = currentModel === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onModelChange(m.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: uiSpace[8],
                        padding: `${uiSpace[6]}px ${uiSpace[10]}px`,
                        margin: `0 ${uiSpace[4]}px`,
                        border: "none",
                        borderRadius: uiRadius.sm,
                        background: isSelected ? `${theme.accent.primary}14` : "transparent",
                        color: isSelected ? theme.accent.primary : theme.text.primary,
                        fontSize: uiTypography.fontSize.xs,
                        cursor: "pointer",
                        outline: "none",
                        fontFamily: uiTypography.fontFamily,
                        textAlign: "left",
                        transition: `all ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
                        lineHeight: 1.5
                      }}>
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>
                        {m.name}
                      </span>
                      {m.reasoning ? (
                        <span
                          style={{
                            padding: `1px ${uiSpace[4]}px`,
                            borderRadius: uiRadius.pill,
                            background: `${theme.accent.primary}18`,
                            color: theme.accent.primary,
                            fontSize: 10,
                            fontWeight: uiTypography.fontWeight.medium,
                            flexShrink: 0
                          }}>
                          reasoning
                        </span>
                      ) : null}
                      {m.tool_call ? (
                        <span
                          style={{
                            padding: `1px ${uiSpace[4]}px`,
                            borderRadius: uiRadius.pill,
                            background: `${theme.state.success ?? "#22c55e"}18`,
                            color: theme.state.success ?? "#22c55e",
                            fontSize: 10,
                            fontWeight: uiTypography.fontWeight.medium,
                            flexShrink: 0
                          }}>
                          tools
                        </span>
                      ) : null}
                      {m.attachment ? (
                        <span
                          style={{
                            padding: `1px ${uiSpace[4]}px`,
                            borderRadius: uiRadius.pill,
                            background: `${theme.state.warning ?? "#f59e0b"}18`,
                            color: theme.state.warning ?? "#f59e0b",
                            fontSize: 10,
                            fontWeight: uiTypography.fontWeight.medium,
                            flexShrink: 0
                          }}>
                          attach
                        </span>
                      ) : null}
                    </button>
                  )
                })}
                {filtered.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: `${uiSpace[16]}px ${uiSpace[12]}px`,
                      color: theme.text.secondary,
                      fontSize: uiTypography.fontSize.xs
                    }}>
                    {t("options.connection.noModelsMatching", [modelSearchQuery])}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}

      {fetchError ? (
        <div
          role="status"
          aria-live="polite"
          style={{ marginTop: uiSpace[8], ...createStatusMessageStyle(theme, "error") }}>
          {fetchError}
        </div>
      ) : null}
    </div>
  )
}
