import { useI18n } from "@/shared/i18n/context"
import type { ModelsDevProviderInfo } from "@/shared/models-dev"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiThemes } from "@/shared/ui/tokens"
import { ProviderLogoById } from "./ProviderLogo"
import { Button } from "./ui"

interface ProviderSelectModalProps {
  filteredProviders: ModelsDevProviderInfo[]
  providerSearchQuery: string
  onClose: () => void
  onSearchQueryChange: (query: string) => void
  onSelectCustom: () => void
  onSelectModelsDev: (provider: ModelsDevProviderInfo) => void
}

/** 提供商选择弹层（新增提供商的第一步） */
export function ProviderSelectModal({
  filteredProviders,
  providerSearchQuery,
  onClose,
  onSearchQueryChange,
  onSelectCustom,
  onSelectModelsDev
}: ProviderSelectModalProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  return (
    <div
      className="opt-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}>
      <div className="opt-modal" role="dialog" aria-modal="true" aria-label={t("options.connection.selectProvider")}>
        <div className="opt-modal-head">
          <div className="opt-card-head-text">
            <h2 className="opt-card-title">{t("options.connection.selectProvider")}</h2>
            <p className="opt-card-desc">{t("options.connection.selectProviderDesc")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("options.connection.cancel")}
          </Button>
        </div>

        <div className="opt-modal-search">
          <input
            className="opt-input"
            type="text"
            value={providerSearchQuery}
            placeholder={t("options.connection.searchProviders")}
            aria-label={t("options.connection.searchProviders")}
            autoFocus
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>

        <div className="opt-modal-body">
          <div className="opt-provider-grid">
            <button type="button" className="opt-provider-card" onClick={onSelectCustom}>
              <span className="opt-list-icon">＋</span>
              <span className="opt-provider-card-name">{t("options.connection.customProvider")}</span>
              <span className="opt-provider-card-meta">OpenAI Compatible</span>
            </button>

            {filteredProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className="opt-provider-card"
                onClick={() => onSelectModelsDev(provider)}>
                <ProviderLogoById providerId={provider.id} name={provider.name} size={32} theme={theme} />
                <span className="opt-provider-card-name">{provider.name}</span>
                <span className="opt-provider-card-meta">
                  {provider.modelCount} {t("options.connection.models")}
                </span>
              </button>
            ))}
          </div>

          {filteredProviders.length === 0 && providerSearchQuery.trim() ? (
            <p className="opt-hint">{t("options.connection.noProvidersFound")}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
