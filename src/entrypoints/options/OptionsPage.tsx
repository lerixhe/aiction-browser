import { useEffect, useState, type CSSProperties, type JSX } from "react"

import { NavIcon } from "@/shared/ui/iconify"
import { BrandIcon } from "@/shared/ui/icons"
import { DEFAULT_SETTINGS } from "@/shared/defaults"
import { getSettings, saveSettings } from "@/shared/storage"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createCardStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ExtensionSettings } from "@/shared/types"
import { ConfirmDialog } from "@/entrypoints/options/ConfirmDialog"
import { useProviderManager, createProviderDraft } from "./useProviderManager"
import { ProviderList } from "./ProviderList"
import { ProviderEditor } from "./ProviderEditor"
import { ProviderSelectModal } from "./ProviderSelectModal"
import { AppearanceSection } from "./AppearanceSection"
import { ActionsSection } from "./ActionsSection"
import { BackupSection } from "./BackupSection"
import { AboutSection } from "./AboutSection"

type Section = "appearance" | "connection" | "actions" | "backup" | "about"

function PlusIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3V13M3 8H13" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

export default function OptionsPage() {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const sections: { key: Section; label: string; icon: string }[] = [
    { key: "appearance", label: t("options.nav.appearance"), icon: "tabler:palette" },
    { key: "connection", label: t("options.nav.connection"), icon: "tabler:api" },
    { key: "actions", label: t("options.nav.actions"), icon: "tabler:sparkles" },
    { key: "backup", label: t("options.nav.backup"), icon: "tabler:database-export" },
    { key: "about", label: t("options.nav.about"), icon: "tabler:info-circle" }
  ]
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [pressedBtn, setPressedBtn] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<Section>("appearance")
  const [loaded, setLoaded] = useState(false)
  const [themeReady, setThemeReady] = useState(false)
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)

  // Provider manager hook
  const providerManager = useProviderManager(settings, setSettings)

  useEffect(() => {
    void getSettings().then((loaded) => {
      setSettings(loaded)
      setThemeReady(true)
      if (loaded.providers.length > 0) {
        const first = loaded.providers[0]
        providerManager.setSelectedProviderId(first.id)
        providerManager.setProviderDraft({ ...first, modelParams: { ...first.modelParams } })
      }
    })
    void chrome.storage.local.get("optionsActiveSection").then((result) => {
      const saved = result.optionsActiveSection as Section | undefined
      if (saved && ["appearance", "connection", "actions", "backup", "about"].includes(saved)) {
        setActiveSection(saved)
      }
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (loaded) {
      void chrome.storage.local.set({ optionsActiveSection: activeSection })
    }
  }, [activeSection, loaded])

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
      void saveSettings({
        ...next,
        providers: next.providers.map((provider) => ({
          ...provider,
          name: provider.name.trim(),
          apiBaseUrl: provider.apiBaseUrl?.trim() || undefined,
          apiKey: provider.apiKey.trim(),
          model: provider.model.trim()
        }))
      })
      return next
    })
  }

  // --- Shared styles ---
  const cardStyle: CSSProperties = {
    ...createCardStyle(theme)
  }

  // --- Section content ---
  const renderConnection = () => (
    <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: `${uiSpace[20]}px ${uiSpace[24]}px ${uiSpace[16]}px`, borderBottom: `0.5px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2
          style={{
            margin: 0,
            fontSize: uiTypography.fontSize.lg,
            fontWeight: uiTypography.fontWeight.semibold,
            letterSpacing: uiTypography.letterSpacing.tight
          }}>
          {t("options.connection.listTitle")}
        </h2>
        <button
          type="button"
          onClick={providerManager.openCreateProvider}
          onMouseDown={() => setPressedBtn("add-provider")}
          onMouseUp={() => setPressedBtn(null)}
          onMouseLeave={() => setPressedBtn(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: uiSpace[6],
            padding: `${uiSpace[6]}px ${uiSpace[14]}px`,
            borderRadius: uiRadius.sm,
            cursor: "pointer",
            background: theme.accent.primary,
            border: "none",
            transition: `all ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
            fontFamily: uiTypography.fontFamily,
            fontSize: uiTypography.fontSize.sm,
            fontWeight: uiTypography.fontWeight.medium,
            color: "#fff",
            transform: pressedBtn === "add-provider" ? "scale(0.96)" : "scale(1)"
          }}>
          <PlusIcon size={14} color="#fff" />
          <span>{t("options.connection.addProvider")}</span>
        </button>
      </div>

      {/* Main content: left list + right detail */}
      <div style={{ display: "flex", minHeight: 420 }}>
        {/* Left: Provider list */}
        <ProviderList
          providers={settings.providers}
          selectedProviderId={providerManager.selectedProviderId}
          activeProviderId={settings.activeProviderId}
          theme={theme}
          onSelect={providerManager.selectProvider}
          onToggleActive={providerManager.toggleProviderActive}
        />

        {/* Right: Detail panel */}
        {!providerManager.selectedProvider ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.text.secondary,
              fontSize: uiTypography.fontSize.md
            }}>
            {t("options.connection.selectProvider")}
          </div>
        ) : (
          <ProviderEditor
            theme={theme}
            providerDraft={providerManager.providerDraft}
            focusedField={focusedField}
            testing={providerManager.testing}
            testResult={providerManager.testResult}
            devModels={providerManager.devModels}
            fetchedModels={providerManager.models}
            fetchingModels={providerManager.fetchingModels}
            fetchError={providerManager.fetchError}
            modelSearchQuery={providerManager.modelSearchQuery}
            paramSupport={providerManager.paramSupport}
            onFieldChange={providerManager.updateProviderField}
            onModelChange={(model) => providerManager.updateProviderField("model", model)}
            onFetchModels={providerManager.handleFetchModels}
            onClearFetchedModels={() => providerManager.setModels([])}
            onSearchQueryChange={providerManager.setModelSearchQuery}
            onParamChange={providerManager.updateProviderModelParam}
            onTestConnection={providerManager.handleTestConnection}
            onDelete={() => providerManager.setPendingDeleteProviderId(providerManager.selectedProviderId)}
            onFocusField={setFocusedField}
            onBlurField={() => setFocusedField(null)}
          />
        )}
      </div>

      {/* Provider selection modal */}
      {providerManager.showProviderSelect ? (
        <ProviderSelectModal
          theme={theme}
          filteredProviders={providerManager.filteredProviders}
          providerSearchQuery={providerManager.providerSearchQuery}
          focusedField={focusedField}
          onClose={() => {
            providerManager.setShowProviderSelect(false)
            providerManager.setProviderSearchQuery("")
          }}
          onSearchQueryChange={providerManager.setProviderSearchQuery}
          onSelectCustom={providerManager.selectProviderAndCreate}
          onSelectModelsDev={providerManager.selectModelsDevProvider}
          onFocusField={setFocusedField}
          onBlurField={() => setFocusedField(null)}
        />
      ) : null}
    </section>
  )

  const handleImportComplete = () => {
    providerManager.setSelectedProviderId(null)
    providerManager.setProviderDraft(createProviderDraft())
  }

  const sectionContent: Record<Section, () => JSX.Element> = {
    appearance: () => <AppearanceSection settings={settings} saveSettingsNow={saveSettingsNow} />,
    connection: renderConnection,
    actions: () => <ActionsSection settings={settings} saveSettingsNow={saveSettingsNow} />,
    backup: () => <BackupSection settings={settings} setSettings={setSettings} onImportComplete={handleImportComplete} />,
    about: () => <AboutSection settings={settings} saveSettingsNow={saveSettingsNow} />
  }

  const sidebarWidth = 300

  if (!themeReady) return null

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: uiTypography.fontFamily,
        color: theme.text.primary,
        background: theme.bg.page,
        overflow: "hidden"
      }}>
      {/* Sidebar */}
      <nav
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          height: "100%",
          background: theme.bg.surface,
          borderRight: `0.5px solid ${theme.border.hairline}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
        {/* Sidebar header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: uiSpace[10],
            padding: `${uiSpace[24]}px ${uiSpace[32]}px ${uiSpace[16]}px`
          }}>
          <BrandIcon size={24} />
          <span
            style={{
              fontSize: uiTypography.fontSize.xxl,
              fontWeight: uiTypography.fontWeight.bold,
              letterSpacing: uiTypography.letterSpacing.tight
            }}>
            AIction
          </span>
          <span
            style={{
              fontSize: uiTypography.fontSize.sm,
              color: theme.text.secondary
            }}>
            v{chrome.runtime.getManifest().version}
          </span>
        </div>

        {/* Nav items */}
        <div style={{ padding: `${uiSpace[4]}px ${uiSpace[16]}px`, flex: 1 }}>
          {sections.map((section) => {
            const isActive = activeSection === section.key
            const isHovered = hoveredNav === section.key

            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                onMouseEnter={() => setHoveredNav(section.key)}
                onMouseLeave={() => setHoveredNav(null)}
                aria-current={isActive ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: uiSpace[10],
                  width: "100%",
                  padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                  marginBottom: 2,
                  border: "none",
                  borderRadius: uiRadius.sm,
                  background: isActive ? `${theme.accent.primary}14` : isHovered ? theme.bg.surfaceAlt : "transparent",
                  color: isActive ? theme.accent.primary : theme.text.primary,
                  cursor: "pointer",
                  fontFamily: uiTypography.fontFamily,
                  fontSize: uiTypography.fontSize.md,
                  fontWeight: uiTypography.fontWeight.regular,
                  outline: "none",
                  textAlign: "left",
                  transition: `background 200ms ease-linear, color 200ms ease-linear`,
                  position: "relative"
                }}>
                <NavIcon icon={section.icon} size={16} color={isActive ? theme.accent.primary : theme.text.secondary} />
                <span style={{ flex: 1 }}>{section.label}</span>
              </button>
            )
          })}
        </div>

        {/* Copyright */}
        <div
          style={{
            padding: `${uiSpace[16]}px ${uiSpace[32]}px`,
            borderTop: `0.5px solid ${theme.border.hairline}`,
            fontSize: uiTypography.fontSize.xs,
            color: theme.text.secondary,
            textAlign: "center"
          }}>
          {t("options.about.copyright")}
        </div>
      </nav>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(180deg, ${theme.accent.primary}15 0%, ${theme.bg.page} 300px)`
        }}>
        {/* Top bar */}
        <div
          style={{
            borderBottom: `0.5px solid ${theme.border.hairline}`,
            background: theme.bg.surface,
            position: "sticky",
            top: 0,
            zIndex: 10
          }}>
          <div
            style={{
              maxWidth: 1400,
              minWidth: 400,
              width: "100%",
              margin: "0 auto",
              padding: `0 ${uiSpace[32]}px`,
              boxSizing: "border-box"
            }}>
            <header
              style={{
                display: "flex",
                alignItems: "center",
                height: 56
              }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: uiTypography.fontSize.lg,
                  fontWeight: uiTypography.fontWeight.semibold,
                  letterSpacing: uiTypography.letterSpacing.tight
                }}>
                {sections.find((s) => s.key === activeSection)?.label}
              </h1>
            </header>
          </div>
        </div>

        <div
          style={{
            maxWidth: 1400,
            minWidth: 400,
            width: "100%",
            margin: "0 auto",
            padding: `${uiSpace[24]}px ${uiSpace[32]}px ${uiSpace[20]}px`,
            boxSizing: "border-box",
            flex: 1
          }}>
          {/* Section content */}
          {sectionContent[activeSection]()}

          {providerManager.pendingDeleteProviderId ? (
            <ConfirmDialog
              title={t("options.backup.deleteProviderTitle")}
              message={t("options.backup.deleteProviderMessage")}
              confirmLabel={t("options.backup.deleteProviderButton")}
              cancelLabel={t("options.connection.cancel")}
              onConfirm={() => providerManager.deleteProvider(providerManager.pendingDeleteProviderId!)}
              onCancel={() => providerManager.setPendingDeleteProviderId(null)}
              themeName={themeName}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
