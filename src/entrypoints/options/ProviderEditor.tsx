import { useI18n } from "@/shared/i18n/context"
import type { ModelsDevModel, ModelParamSupport } from "@/shared/models-dev"
import type { ModelParams, ProviderConfig } from "@/shared/types"
import { ModelParamsEditor } from "./ModelParamsEditor"
import { ModelPicker } from "./ModelPicker"
import { Button, DangerZone, FieldGroup, SaveBar, SettingRow, StatusMessage, TextField } from "./ui"

interface ProviderEditorProps {
  providerDraft: ProviderConfig
  providerDirty: boolean
  providerJustSaved: boolean
  valid: boolean
  testing: boolean
  testResult: { success: boolean; message: string } | null
  devModels: ModelsDevModel[]
  fetchedModels: string[]
  fetchingModels: boolean
  fetchError: string | null
  modelSearchQuery: string
  paramSupport: ModelParamSupport
  modelOutputLimit?: number
  modelContextLimit?: number
  smartFilling: boolean
  smartFillStatus: { count: number; notice?: string | null } | null
  onFieldChange: (field: string, value: string) => void
  onModelChange: (model: string) => void
  onFetchModels: () => void
  onSmartFillParams: () => void
  onClearFetchedModels: () => void
  onSearchQueryChange: (query: string) => void
  onParamChange: (key: keyof ModelParams, value: ModelParams[keyof ModelParams]) => void
  onTestConnection: () => void
  onSave: () => void
  onDiscard: () => void
  onDelete: () => void
}

/**
 * 提供商详情区（列表-详情卡的右半边）：
 * 保存条吸在详情区顶部，内部按「基础 / 参数 / 危险区」分组，组内行式布局。
 */
export function ProviderEditor({
  providerDraft,
  providerDirty,
  providerJustSaved,
  valid,
  testing,
  testResult,
  devModels,
  fetchedModels,
  fetchingModels,
  fetchError,
  modelSearchQuery,
  paramSupport,
  modelOutputLimit,
  modelContextLimit,
  smartFilling,
  smartFillStatus,
  onFieldChange,
  onModelChange,
  onFetchModels,
  onSmartFillParams,
  onClearFetchedModels,
  onSearchQueryChange,
  onParamChange,
  onTestConnection,
  onSave,
  onDiscard,
  onDelete
}: ProviderEditorProps) {
  const { t } = useI18n()

  return (
    <div className="opt-detail">
      <SaveBar
        inset
        dirty={providerDirty}
        justSaved={providerJustSaved}
        onSave={onSave}
        onDiscard={onDiscard}
      />

      <FieldGroup title={t("options.connection.groupBasic")}>
        <SettingRow
          title={t("options.connection.providerName")}
          desc={t("options.connection.providerNameDesc")}
          htmlFor="provider-name">
          <TextField
            id="provider-name"
            value={providerDraft.name}
            placeholder={t("options.connection.serviceNamePlaceholder")}
            onValueChange={(value) => onFieldChange("name", value)}
          />
        </SettingRow>

        <SettingRow
          title={t("options.connection.apiKey")}
          desc={t("options.connection.apiKeyDesc")}
          htmlFor="provider-api-key">
          <TextField
            id="provider-api-key"
            type="password"
            value={providerDraft.apiKey}
            placeholder="sk-..."
            mono
            onValueChange={(value) => onFieldChange("apiKey", value)}
          />
        </SettingRow>

        <SettingRow
          title={t("options.connection.model")}
          desc={t("options.connection.modelDesc")}
          width="wide">
          <ModelPicker
            currentModel={providerDraft.model}
            hasModelsDevId={Boolean(providerDraft.modelsDevId)}
            devModels={devModels}
            fetchedModels={fetchedModels}
            fetchingModels={fetchingModels}
            fetchError={fetchError}
            modelSearchQuery={modelSearchQuery}
            smartFilling={smartFilling}
            smartFillStatus={smartFillStatus}
            onModelChange={onModelChange}
            onFetchModels={onFetchModels}
            onSmartFillParams={onSmartFillParams}
            onClearFetchedModels={onClearFetchedModels}
            onSearchQueryChange={onSearchQueryChange}
          />
        </SettingRow>

        <SettingRow
          title={t("options.connection.apiBaseUrl")}
          desc={
            providerDraft.modelsDevId
              ? t("options.connection.apiBaseUrlDescModelsDev")
              : t("options.connection.apiBaseUrlDesc")
          }
          htmlFor="provider-api-base-url">
          <TextField
            id="provider-api-base-url"
            value={providerDraft.apiBaseUrl ?? ""}
            placeholder="https://api.example.com/v1"
            mono
            onValueChange={(value) => onFieldChange("apiBaseUrl", value)}
          />
        </SettingRow>

        <SettingRow title={t("options.connection.testConnection")} desc={t("options.connection.testConnectionDesc")}>
          <Button variant="primary" size="sm" disabled={testing || !valid} onClick={onTestConnection}>
            {testing ? t("options.connection.testing") : t("options.connection.testConnection")}
          </Button>
        </SettingRow>
      </FieldGroup>

      {testResult ? <StatusMessage tone={testResult.success ? "success" : "error"}>{testResult.message}</StatusMessage> : null}

      <ModelParamsEditor
        modelParams={providerDraft.modelParams}
        paramSupport={paramSupport}
        modelOutputLimit={modelOutputLimit}
        modelContextLimit={modelContextLimit}
        onParamChange={onParamChange}
      />

      <DangerZone
        title={t("options.connection.deleteProviderTitle")}
        desc={t("options.connection.deleteProviderDesc")}
        action={
          <Button variant="danger" onClick={onDelete}>
            {t("options.connection.delete")}
          </Button>
        }
      />
    </div>
  )
}
