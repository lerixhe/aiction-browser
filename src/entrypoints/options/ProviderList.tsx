import { useI18n } from "@/shared/i18n/context"
import { useUiThemeName } from "@/shared/ui/theme"
import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { uiThemes } from "@/shared/ui/tokens"
import type { ProviderConfig } from "@/shared/types"
import { ProviderLogoById } from "./ProviderLogo"
import { EmptyState, cx } from "./ui"

interface ProviderListProps {
  providers: ProviderConfig[]
  selectedProviderId: string | null
  activeProviderId: string
  /** 有未保存草稿的提供商 id（左列表打未保存点） */
  dirtyProviderIds: string[]
  onSelect: (provider: ProviderConfig) => void
  onToggleActive: (providerId: string) => void
}

/** 提供商左列表：启用开关即时生效，右侧字段走草稿（未保存项打点） */
export function ProviderList({
  providers,
  selectedProviderId,
  activeProviderId,
  dirtyProviderIds,
  onSelect,
  onToggleActive
}: ProviderListProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  if (providers.length === 0) {
    return (
      <div className="opt-list" role="listbox" aria-label={t("options.nav.connection")}>
        <EmptyState>{t("options.connection.emptyServiceList")}</EmptyState>
      </div>
    )
  }

  return (
    <div className="opt-list" role="listbox" aria-label={t("options.nav.connection")}>
      {providers.map((provider) => {
        const isSelected = selectedProviderId === provider.id
        const isActive = activeProviderId === provider.id
        const displayName = provider.name || t("options.connection.customProvider")

        return (
          <div
            key={provider.id}
            role="option"
            tabIndex={0}
            aria-selected={isSelected}
            className={cx("opt-list-item")}
            onClick={() => onSelect(provider)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onSelect(provider)
              }
            }}>
            {provider.modelsDevId ? (
              <ProviderLogoById providerId={provider.modelsDevId} name={displayName} size={26} theme={theme} />
            ) : (
              <span className="opt-list-icon">{displayName.charAt(0)}</span>
            )}

            <span className="opt-list-item-title">{displayName}</span>

            {dirtyProviderIds.includes(provider.id) ? (
              <span className="opt-dirty-dot" title={t("options.saveBar.dirty")} aria-hidden="true" />
            ) : null}

            <span onClick={(event) => event.stopPropagation()}>
              <ToggleSwitch checked={isActive} onChange={() => onToggleActive(provider.id)} theme={theme} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
