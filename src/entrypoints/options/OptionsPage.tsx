import { useEffect, useRef, useState, type JSX } from "react"

import { trackEvent } from "@/shared/analytics"
import { OPTIONS_ENTRY_STORAGE_KEY } from "@/shared/constants"
import { DEFAULT_SETTINGS } from "@/shared/defaults"
import { useI18n } from "@/shared/i18n/context"
import { getSettings, saveSettings } from "@/shared/storage"
import type { ExtensionSettings } from "@/shared/types"
import { ActionsSection } from "./ActionsSection"
import { AccountSection } from "./AccountSection"
import { AppearanceSection } from "./AppearanceSection"
import { AboutSection } from "./AboutSection"
import { BackupSection } from "./BackupSection"
import { ConfirmDialog } from "./ConfirmDialog"
import { ProviderEditor } from "./ProviderEditor"
import { ProviderList } from "./ProviderList"
import { ProviderSelectModal } from "./ProviderSelectModal"
import { SystemPromptSection } from "./SystemPromptSection"
import { Button, EmptyState, PageShell, SectionCard, Skeleton } from "./ui"
import { useProviderManager } from "./useProviderManager"

const SECTION_KEYS = ["appearance", "account", "connection", "actions", "systemPrompt", "backup", "about"] as const

type Section = (typeof SECTION_KEYS)[number]

const SECTION_ICONS: Record<Section, string> = {
  appearance: "tabler:palette",
  account: "tabler:user-circle",
  connection: "tabler:api",
  actions: "tabler:sparkles",
  systemPrompt: "tabler:file-text",
  backup: "tabler:database-export",
  about: "tabler:info-circle"
}

const ACTIVE_SECTION_STORAGE_KEY = "optionsActiveSection"

function isSection(value: unknown): value is Section {
  return typeof value === "string" && (SECTION_KEYS as readonly string[]).includes(value)
}

/** 合法 hash 才认（非法 hash 回落到上次分区，见 docs/OPTIONS_UI.md §2.5） */
function readHashSection(): Section | null {
  if (typeof window === "undefined") {
    return null
  }
  const raw = window.location.hash.replace(/^#/, "")
  return isSection(raw) ? raw : null
}

export default function OptionsPage() {
  const { t } = useI18n()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [activeSection, setActiveSection] = useState<Section>(() => readHashSection() ?? "appearance")
  const [settingsReady, setSettingsReady] = useState(false)
  const [sectionReady, setSectionReady] = useState(() => readHashSection() !== null)

  const providerManager = useProviderManager(settings, setSettings)

  const sections = SECTION_KEYS.map((key) => ({
    key,
    label: t(`options.nav.${key}`),
    icon: SECTION_ICONS[key],
    desc: t(`options.section.${key}.desc`)
  }))

  // options_opened：区分「从 Popup 进来」与「其它入口」（标记由 Popup 写入，读取后清除）
  useEffect(() => {
    const reportOpened = async () => {
      let entry = "direct"
      try {
        const result = await chrome.storage.local.get(OPTIONS_ENTRY_STORAGE_KEY)
        const saved = result[OPTIONS_ENTRY_STORAGE_KEY] as string | undefined
        if (saved) {
          entry = saved
          await chrome.storage.local.remove(OPTIONS_ENTRY_STORAGE_KEY)
        }
      } catch {
        // Extension context may have been invalidated
      }
      void trackEvent("options_opened", { entry, source: "options" })
    }
    void reportOpened()
  }, [])

  useEffect(() => {
    void getSettings().then((loaded) => {
      setSettings(loaded)
      setSettingsReady(true)
      if (loaded.providers.length > 0) {
        providerManager.setSelectedProviderId(loaded.providers[0].id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 分区优先级：hash > 上次分区 > 默认
  useEffect(() => {
    if (readHashSection()) {
      return
    }
    void chrome.storage.local.get(ACTIVE_SECTION_STORAGE_KEY).then((result) => {
      const saved = result[ACTIVE_SECTION_STORAGE_KEY]
      if (isSection(saved)) {
        setActiveSection(saved)
      }
      setSectionReady(true)
    })
  }, [])

  // 切分区：hash 写回 URL（replaceState，不堆历史）+ 记住分区 + 滚动归零
  useEffect(() => {
    if (!sectionReady) {
      return
    }
    if (window.location.hash !== `#${activeSection}`) {
      window.history.replaceState(null, "", `#${activeSection}`)
    }
    void chrome.storage.local.set({ [ACTIVE_SECTION_STORAGE_KEY]: activeSection })
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeSection, sectionReady])

  useEffect(() => {
    document.documentElement.style.margin = "0"
    document.documentElement.style.padding = "0"
    document.documentElement.style.height = "100%"
    document.body.style.margin = "0"
    document.body.style.padding = "0"
    document.body.style.height = "100%"
  }, [])

  // --- Save helpers for non-provider settings ---
  const saveSettingsNow = (updater: (current: ExtensionSettings) => ExtensionSettings) => {
    setSettings((current) => {
      const next = updater(current)
      void saveSettings(next)
      return next
    })
  }

  const renderConnection = () => (
    <SectionCard
      title={t("options.connection.listTitle")}
      description={t("options.connection.cardDesc")}
      actions={
        <Button variant="primary" size="sm" onClick={providerManager.openCreateProvider}>
          {t("options.connection.addProvider")}
        </Button>
      }
      bodyClassName="opt-card-body--flush">
      <div className="opt-split">
        <ProviderList
          providers={settings.providers}
          selectedProviderId={providerManager.selectedProviderId}
          activeProviderId={settings.activeProviderId}
          dirtyProviderIds={providerManager.dirtyProviderIds}
          onSelect={providerManager.selectProvider}
          onToggleActive={providerManager.toggleProviderActive}
        />

        {!providerManager.selectedProvider ? (
          <div className="opt-detail">
            <EmptyState>{t("options.connection.selectProvider")}</EmptyState>
          </div>
        ) : (
          <ProviderEditor
            providerDraft={providerManager.providerDraft}
            providerDirty={providerManager.providerDirty}
            providerJustSaved={providerManager.providerJustSaved}
            valid={providerManager.isProviderDraftValid}
            testing={providerManager.testing}
            testResult={providerManager.testResult}
            devModels={providerManager.devModels}
            fetchedModels={providerManager.models}
            fetchingModels={providerManager.fetchingModels}
            fetchError={providerManager.fetchError}
            modelSearchQuery={providerManager.modelSearchQuery}
            paramSupport={providerManager.paramSupport}
            modelOutputLimit={providerManager.modelOutputLimit}
            modelContextLimit={providerManager.modelContextLimit}
            smartFilling={providerManager.smartFilling}
            smartFillStatus={providerManager.smartFillStatus}
            onFieldChange={providerManager.updateProviderField}
            onModelChange={providerManager.updateProviderModel}
            onFetchModels={providerManager.handleFetchModels}
            onSmartFillParams={() => void providerManager.handleSmartFillParams()}
            onClearFetchedModels={() => providerManager.setModels([])}
            onSearchQueryChange={providerManager.setModelSearchQuery}
            onParamChange={providerManager.updateProviderModelParam}
            onTestConnection={providerManager.handleTestConnection}
            onSave={providerManager.saveProviderDraft}
            onDiscard={providerManager.discardProviderDraft}
            onDelete={() => providerManager.setPendingDeleteProviderId(providerManager.selectedProviderId)}
          />
        )}
      </div>
    </SectionCard>
  )

  const handleImportComplete = () => {
    providerManager.setSelectedProviderId(null)
  }

  const sectionContent: Record<Section, () => JSX.Element> = {
    appearance: () => <AppearanceSection settings={settings} saveSettingsNow={saveSettingsNow} />,
    account: () => <AccountSection settings={settings} saveSettingsNow={saveSettingsNow} />,
    connection: renderConnection,
    actions: () => <ActionsSection settings={settings} saveSettingsNow={saveSettingsNow} />,
    systemPrompt: () => <SystemPromptSection settings={settings} saveSettingsNow={saveSettingsNow} />,
    backup: () => (
      <BackupSection settings={settings} setSettings={setSettings} onImportComplete={handleImportComplete} />
    ),
    about: () => <AboutSection settings={settings} saveSettingsNow={saveSettingsNow} />
  }

  const activeMeta = sections.find((section) => section.key === activeSection) ?? sections[0]

  return (
    <>
      <PageShell
        sections={sections}
        activeSection={activeSection}
        onSelectSection={(key) => {
          if (isSection(key)) {
            setActiveSection(key)
          }
        }}
        title={activeMeta.label}
        description={activeMeta.desc}
        version={chrome.runtime.getManifest().version}
        footer={t("options.about.copyright")}
        scrollRef={scrollRef}>
        {!settingsReady ? (
          <div>
            <Skeleton className="opt-skeleton-card" />
            <Skeleton className="opt-skeleton-card" />
          </div>
        ) : (
          sectionContent[activeSection]()
        )}
      </PageShell>

      {providerManager.showProviderSelect ? (
        <ProviderSelectModal
          filteredProviders={providerManager.filteredProviders}
          providerSearchQuery={providerManager.providerSearchQuery}
          onClose={() => {
            providerManager.setShowProviderSelect(false)
            providerManager.setProviderSearchQuery("")
          }}
          onSearchQueryChange={providerManager.setProviderSearchQuery}
          onSelectCustom={providerManager.selectProviderAndCreate}
          onSelectModelsDev={providerManager.selectModelsDevProvider}
        />
      ) : null}

      {providerManager.pendingDeleteProviderId ? (
        <ConfirmDialog
          title={t("options.backup.deleteProviderTitle")}
          message={t("options.backup.deleteProviderMessage")}
          confirmLabel={t("options.backup.deleteProviderButton")}
          cancelLabel={t("options.connection.cancel")}
          onConfirm={() => providerManager.deleteProvider(providerManager.pendingDeleteProviderId!)}
          onCancel={() => providerManager.setPendingDeleteProviderId(null)}
        />
      ) : null}
    </>
  )
}
