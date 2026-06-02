import { useState } from "react"
import { uiMotion, uiRadius, uiSpace, uiTypography, type UiTheme } from "@/shared/ui/tokens"
import { createButtonStyle, createFieldLabelStyle, createInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { ProviderLogoById } from "./ProviderLogo"
import { ModelPicker } from "./ModelPicker"
import { ModelParamsEditor } from "./ModelParamsEditor"
import type { ProviderConfig, ModelParams } from "@/shared/types"
import type { ModelsDevModel, ModelParamSupport } from "@/shared/models-dev"
import { useI18n } from "@/shared/i18n/context"

interface ProviderEditorProps {
  theme: UiTheme
  providerDraft: ProviderConfig
  focusedField: string | null
  testing: boolean
  testResult: { success: boolean; message: string } | null
  devModels: ModelsDevModel[]
  fetchedModels: string[]
  fetchingModels: boolean
  fetchError: string | null
  modelSearchQuery: string
  paramSupport: ModelParamSupport
  onFieldChange: (field: string, value: string) => void
  onModelChange: (model: string) => void
  onFetchModels: () => void
  onClearFetchedModels: () => void
  onSearchQueryChange: (query: string) => void
  onParamChange: (key: keyof ModelParams, value: number) => void
  onTestConnection: () => void
  onDelete: () => void
  onFocusField: (field: string) => void
  onBlurField: () => void
}

export function ProviderEditor({
  theme,
  providerDraft,
  focusedField,
  testing,
  testResult,
  devModels,
  fetchedModels,
  fetchingModels,
  fetchError,
  modelSearchQuery,
  paramSupport,
  onFieldChange,
  onModelChange,
  onFetchModels,
  onClearFetchedModels,
  onSearchQueryChange,
  onParamChange,
  onTestConnection,
  onDelete,
  onFocusField,
  onBlurField
}: ProviderEditorProps) {
  const { t } = useI18n()

  const fieldLabelStyle = createFieldLabelStyle(theme)
  const createInput = (fieldName: string) => createInputStyle(theme, focusedField === fieldName)
  const primaryBtnStyle = createButtonStyle(theme, "primary")
  const secondaryBtnStyle = createButtonStyle(theme, "secondary", { compact: true })

  const [pressedBtn, setPressedBtn] = useState<string | null>(null)

  return (
    <div style={{ flex: 1, padding: uiSpace[24], overflowY: "auto" }}>
      {/* Provider badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: uiSpace[10],
          marginBottom: uiSpace[16],
          padding: `${uiSpace[10]}px ${uiSpace[14]}px`,
          background: theme.bg.surfaceMuted,
          borderRadius: uiRadius.md,
          border: `1px solid ${theme.border.hairline}`
        }}>
        {providerDraft.modelsDevId ? (
          <ProviderLogoById providerId={providerDraft.modelsDevId} name={providerDraft.name || "Custom"} size={28} theme={theme} />
        ) : (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: uiRadius.sm,
              background: theme.bg.surfaceMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: uiTypography.fontWeight.semibold,
              color: theme.accent.primary,
              flexShrink: 0
            }}>
            {(providerDraft.name || "C").charAt(0)}
          </div>
        )}
        <span
          style={{
            fontSize: uiTypography.fontSize.md,
            fontWeight: uiTypography.fontWeight.semibold,
            color: theme.text.primary
          }}>
          {providerDraft.name || "Custom"}
        </span>
        {providerDraft.modelsDevId && providerDraft.apiBaseUrl ? (
          <span style={{ fontSize: uiTypography.fontSize.xs, color: theme.text.secondary, marginLeft: "auto" }}>
            {providerDraft.apiBaseUrl}
          </span>
        ) : null}
      </div>

      {/* Name */}
      <div style={{ marginBottom: uiSpace[16] }}>
        <label htmlFor="provider-name" style={fieldLabelStyle}>
          {t("options.connection.serviceName")}
        </label>
        <input
          id="provider-name"
          value={providerDraft.name}
          onFocus={() => onFocusField("provider-name")}
          onBlur={onBlurField}
          onChange={(e) => onFieldChange("name", e.target.value)}
          placeholder={t("options.connection.serviceNamePlaceholder")}
          style={createInput("provider-name")}
        />
      </div>

      {/* API Base URL (for custom provider) */}
      {!providerDraft.modelsDevId ? (
        <div style={{ marginBottom: uiSpace[16] }}>
          <label htmlFor="provider-api-base-url" style={fieldLabelStyle}>
            {t("options.connection.apiBaseUrl")}
          </label>
          <input
            id="provider-api-base-url"
            value={providerDraft.apiBaseUrl ?? ""}
            onFocus={() => onFocusField("apiBaseUrl")}
            onBlur={onBlurField}
            onChange={(e) => onFieldChange("apiBaseUrl", e.target.value)}
            placeholder="https://api.example.com/v1"
            style={createInput("apiBaseUrl")}
          />
        </div>
      ) : null}

      {/* API Key */}
      <div style={{ marginBottom: uiSpace[16] }}>
        <label htmlFor="provider-api-key" style={fieldLabelStyle}>
          {t("options.connection.apiKey")}
        </label>
        <input
          id="provider-api-key"
          type="password"
          value={providerDraft.apiKey}
          onFocus={() => onFocusField("apiKey")}
          onBlur={onBlurField}
          onChange={(e) => onFieldChange("apiKey", e.target.value)}
          placeholder="sk-..."
          style={createInput("apiKey")}
        />
      </div>

      {/* Model */}
      <div style={{ marginBottom: uiSpace[16] }}>
        <ModelPicker
          theme={theme}
          currentModel={providerDraft.model}
          hasModelsDevId={Boolean(providerDraft.modelsDevId)}
          devModels={devModels}
          fetchedModels={fetchedModels}
          fetchingModels={fetchingModels}
          fetchError={fetchError}
          modelSearchQuery={modelSearchQuery}
          focusedField={focusedField}
          onModelChange={onModelChange}
          onFetchModels={onFetchModels}
          onClearFetchedModels={onClearFetchedModels}
          onSearchQueryChange={onSearchQueryChange}
          onFocusField={onFocusField}
          onBlurField={onBlurField}
        />
      </div>

      {/* Test connection */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: uiSpace[10],
          marginBottom: uiSpace[16],
          flexWrap: "wrap"
        }}>
        <button
          disabled={testing}
          onClick={onTestConnection}
          onMouseDown={() => setPressedBtn("test")}
          onMouseUp={() => setPressedBtn(null)}
          onMouseLeave={() => setPressedBtn(null)}
          style={{
            ...primaryBtnStyle,
            display: "flex",
            alignItems: "center",
            gap: uiSpace[6],
            opacity: testing ? 0.6 : 1,
            cursor: testing ? "not-allowed" : "pointer",
            background: testing ? theme.state.disabled : theme.accent.primary,
            transform: pressedBtn === "test" ? "scale(0.96)" : "scale(1)"
          }}>
          {testing ? t("options.connection.testing") : t("options.connection.testConnection")}
        </button>
        {testResult ? (
          <span
            role="status"
            aria-live="polite"
            style={{
              ...createStatusMessageStyle(theme, testResult.success ? "success" : "error"),
              borderRadius: uiRadius.pill,
              fontWeight: uiTypography.fontWeight.medium,
              lineHeight: 1.5
            }}>
            {testResult.message}
          </span>
        ) : null}
      </div>

      {/* Model params */}
      <ModelParamsEditor
        theme={theme}
        modelParams={providerDraft.modelParams}
        paramSupport={paramSupport}
        focusedField={focusedField}
        onParamChange={onParamChange}
        onFocusField={onFocusField}
        onBlurField={onBlurField}
      />

      {/* Delete button */}
      <div style={{ marginTop: uiSpace[20], borderTop: `0.5px solid ${theme.border.hairline}`, paddingTop: uiSpace[20] }}>
        <button
          type="button"
          onClick={onDelete}
          style={{
            ...secondaryBtnStyle,
            color: theme.state.error,
            borderColor: theme.state.error
          }}>
          {t("options.connection.delete")}
        </button>
      </div>
    </div>
  )
}
