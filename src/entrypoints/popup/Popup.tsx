import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react"

import { getSettings, saveSettings } from "@/shared/storage"
import { BrandIcon } from "@/shared/ui/icons"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createCardStyle, createFocusRing } from "@/shared/ui/styles"
import { getAvatarPalette, getAvatarDisplayText } from "@/shared/ui/avatar"
import { ActionIcon } from "@/shared/ui/iconify"
import { useI18n } from "@/shared/i18n/context"
import type { ActionTemplate, ExtensionSettings } from "@/shared/types"

function SettingsIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronIcon({ color, expanded }: { color: string; expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{
        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: `transform ${uiMotion.durationFast} ${uiMotion.easingStandard}`
      }}>
      <path d="M3 4.5L6 7.5L9 4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7L6 10L11 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}


function ToggleSwitch({ checked, onChange, theme }: { checked: boolean; onChange: () => void; theme: any }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        background: checked ? theme.accent.primary : theme.border.default,
        cursor: "pointer",
        transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
        padding: 0,
        flexShrink: 0
      }}>
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: `left ${uiMotion.durationFast} ${uiMotion.easingStandard}`
        }}
      />
    </button>
  )
}

const AVATAR_SIZE = 30
const AVATAR_GAP = 2
const MAX_VISIBLE_AVATARS = 4

function AvatarStack({
  actions,
  themeName,
  theme
}: {
  actions: ActionTemplate[]
  themeName: string
  theme: any
}) {
  const enabledActions = actions.filter((a) => a.enabled !== false)
  if (enabledActions.length === 0) return null

  const visibleActions = enabledActions.slice(0, MAX_VISIBLE_AVATARS)
  const hasOverflow = enabledActions.length > MAX_VISIBLE_AVATARS

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginLeft: 4,
        flexShrink: 1,
        overflow: "hidden",
        minWidth: 0
      }}>
      {visibleActions.map((action) => {
        return (
          <span
            key={action.id}
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: uiRadius.sm,
              background: theme.bg.surface,
              color: theme.accent.primary,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: AVATAR_GAP,
              flexShrink: 0
            }}>
            {action.icon ? (
              <ActionIcon icon={action.icon} size={16} color={theme.accent.primary} />
            ) : (
              <span style={{ fontSize: 10, color: theme.text.secondary }}>?</span>
            )}
          </span>
        )
      })}
      {hasOverflow && (
        <span
          style={{
            marginLeft: AVATAR_GAP,
            flexShrink: 0,
            fontSize: uiTypography.fontSize.sm,
            color: theme.text.secondary,
            fontWeight: uiTypography.fontWeight.semibold
          }}>
          …
        </span>
      )}
    </span>
  )
}

export default function Popup() {
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]
  const { t } = useI18n()
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  const [changing, setChanging] = useState(false)
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [pressedBtn, setPressedBtn] = useState<string | null>(null)
  const serviceMenuRef = useRef<HTMLDivElement | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  const activeService =
    settings?.modelServices.find((service) => service.id === settings.activeModelServiceId) ?? null
  const avatarPalette = getAvatarPalette(activeService?.iconText, activeService?.name, themeName === "dark")
  const enabledActionsCount = settings?.actions.filter((a) => a.enabled !== false).length ?? 0

  useEffect(() => {
    document.documentElement.style.margin = "0"
    document.documentElement.style.padding = "0"
    document.documentElement.style.height = "auto"
    document.documentElement.style.overflow = "visible"
    document.documentElement.style.background = theme.bg.page
    document.body.style.margin = "0"
    document.body.style.padding = "0"
    document.body.style.minWidth = "320px"
    document.body.style.height = "auto"
    document.body.style.overflow = "visible"
    document.body.style.background = theme.bg.page
  }, [theme.bg.page])

  useEffect(() => {
    void getSettings().then(setSettings)

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      _changes,
      areaName
    ) => {
      if (areaName !== "sync") {
        return
      }
      void getSettings().then(setSettings)
    }

    try {
      chrome.storage.onChanged.addListener(onStorageChanged)
    } catch {
      // Extension context may have been invalidated
    }

    return () => {
      try {
        chrome.storage.onChanged.removeListener(onStorageChanged)
      } catch {
        // Extension context may have been invalidated
      }
    }
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!serviceMenuRef.current?.contains(event.target as Node)) {
        setServiceMenuOpen(false)
      }
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setActionsMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [])

  const handleServiceChange = async (serviceId: string) => {
    if (!settings || serviceId === settings.activeModelServiceId) {
      return
    }
    const nextSettings = { ...settings, activeModelServiceId: serviceId }
    setSettings(nextSettings)
    setChanging(true)
    setServiceMenuOpen(false)
    await saveSettings(nextSettings)
    setChanging(false)
  }

  const handleActionToggle = useCallback(
    async (actionId: string) => {
      if (!settings) return
      const nextActions = settings.actions.map((a) =>
        a.id === actionId ? { ...a, enabled: a.enabled === false ? true : false } : a
      )
      const nextSettings = { ...settings, actions: nextActions }
      setSettings(nextSettings)
      await saveSettings(nextSettings)
    },
    [settings]
  )

  const openOptionsPage = () => {
    void chrome.runtime.openOptionsPage()
    window.close()
  }

  // --- Styles following DESIGN.MD ---

  const shellStyle: CSSProperties = {
    width: 336,
    boxSizing: "border-box",
    padding: uiSpace[12],
    background: theme.bg.page,
    fontFamily: uiTypography.fontFamily,
    display: "flex",
    flexDirection: "column"
  }

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: uiSpace[12],
    borderBottom: `1px solid ${theme.border.hairline}`,
    marginBottom: uiSpace[12]
  }

  const titleContainerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: uiSpace[8],
    margin: 0
  }

  const titleStyle: CSSProperties = {
    fontSize: uiTypography.fontSize.lg,
    fontWeight: uiTypography.fontWeight.semibold,
    color: theme.text.primary,
    letterSpacing: uiTypography.letterSpacing.tight,
    margin: 0
  }

  const settingsBtnStyle: CSSProperties = {
    width: 36,
    height: 36,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: uiRadius.md,
    background: theme.bg.surfaceMuted,
    color: theme.text.secondary,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    outline: "none",
    boxShadow: "none",
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
    flexShrink: 0
  }

  const fieldLabelStyle: CSSProperties = {
    fontSize: uiTypography.fontSize.sm,
    fontWeight: uiTypography.fontWeight.medium,
    color: theme.text.secondary,
    marginBottom: uiSpace[6],
    letterSpacing: uiTypography.letterSpacing.normal
  }

  // Trigger 按钮左侧 icon 占位宽度: icon-left(10) + icon-size(30) + gap-to-text(8) = 48
  const TRIGGER_LEFT_PAD = uiSpace[10] + AVATAR_SIZE + 8

  const triggerStyle = (isOpen: boolean): CSSProperties => ({
    width: "100%",
    border: `1px solid ${isOpen ? theme.accent.primary : theme.border.subtle}`,
    borderRadius: uiRadius.md,
    height: 44,
    padding: `0 ${uiSpace[12]}px 0 ${TRIGGER_LEFT_PAD}px`,
    background: theme.bg.surfaceMuted,
    color: theme.text.primary,
    fontSize: uiTypography.fontSize.md,
    fontWeight: uiTypography.fontWeight.medium,
    fontFamily: uiTypography.fontFamily,
    outline: "none",
    boxShadow: isOpen ? createFocusRing(theme.accent.primary) : "none",
    cursor: settings?.modelServices.length ? "pointer" : "default",
    transition: `border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}, background ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
    display: "flex",
    alignItems: "center",
    textAlign: "left",
    position: "relative" as const
  })

  const triggerLeftIcon: CSSProperties = {
    position: "absolute" as const,
    top: "50%",
    left: uiSpace[10],
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none"
  }

  const triggerChevron: CSSProperties = {
    position: "absolute" as const,
    top: "50%",
    right: uiSpace[10],
    transform: "translateY(-50%)",
    pointerEvents: "none"
  }

  const menuStyle: CSSProperties = {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    padding: uiSpace[4],
    maxHeight: 42 * 2 + 20 + 8,
    overflowY: "auto",
    borderRadius: uiRadius.md,
    background: theme.bg.surface,
    border: `1px solid ${theme.border.default}`,
    boxShadow: uiShadow.lg,
    display: "grid",
    gap: 2,
    zIndex: 100,
    marginTop: uiSpace[4]
  }

  const menuItemStyle = (itemId: string, selected: boolean): CSSProperties => {
    const isHovered = hoveredItem === itemId
    return {
      display: "grid",
      gridTemplateColumns: `${AVATAR_SIZE}px 1fr auto`,
      alignItems: "center",
      gap: uiSpace[8],
      width: "100%",
      minHeight: 40,
      padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
      border: "none",
      borderRadius: uiRadius.sm,
      background: selected ? theme.bg.surfaceMuted : isHovered ? theme.bg.surfaceAlt : "transparent",
      color: theme.text.primary,
      cursor: "pointer",
      textAlign: "left" as const,
      fontFamily: uiTypography.fontFamily,
      fontSize: uiTypography.fontSize.md,
      fontWeight: selected ? uiTypography.fontWeight.semibold : uiTypography.fontWeight.regular,
      transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
    }
  }

  const avatarStyle = (palette: { background: string; color: string }, size: number = AVATAR_SIZE, textLength: number = 1): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: uiRadius.sm,
    background: palette.background,
    color: palette.color,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: textLength >= 4 ? 8 : textLength > 1 ? 9 : size >= 24 ? 11 : 10,
    fontWeight: uiTypography.fontWeight.semibold,
    letterSpacing: uiTypography.letterSpacing.tight,
    flexShrink: 0
  })

  const menuItemAvatarStyle = (palette: { background: string; color: string }, displayText: string): CSSProperties => ({
    ...avatarStyle(palette, AVATAR_SIZE, displayText.length),
    marginRight: uiSpace[12]
  })

  const menuItemTextStyle: CSSProperties = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }

  return (
    <div style={shellStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={titleContainerStyle}>
          <BrandIcon size={24} />
          <h1 style={titleStyle}>AIction</h1>
        </div>
        <button
          type="button"
          onClick={openOptionsPage}
          aria-label={t("popup.settingsLabel")}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.bg.surface
            e.currentTarget.style.borderColor = theme.border.default
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = theme.bg.surfaceMuted
            e.currentTarget.style.borderColor = theme.border.subtle
          }}
          style={settingsBtnStyle}>
          <SettingsIcon color={theme.text.primary} />
        </button>
      </div>

      {/* Service Selector */}
      <div style={{ marginBottom: uiSpace[12] }}>
        <div style={fieldLabelStyle}>{t("popup.selectService")}</div>

        <div ref={serviceMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              if (!settings || settings.modelServices.length === 0 || changing) {
                return
              }
              setServiceMenuOpen((open) => !open)
              setActionsMenuOpen(false)
            }}
            disabled={!settings || settings.modelServices.length === 0 || changing}
            aria-haspopup="listbox"
            aria-expanded={serviceMenuOpen}
            style={{
              ...triggerStyle(serviceMenuOpen),
              opacity: !settings || changing ? 0.6 : 1
            }}>
            <div aria-hidden="true" style={triggerLeftIcon}>
              <span
                style={{
                  ...avatarStyle(avatarPalette, AVATAR_SIZE, getAvatarDisplayText(activeService?.iconText, activeService?.name).length)
                }}>
                {getAvatarDisplayText(activeService?.iconText, activeService?.name)}
              </span>
            </div>
            <span style={{ ...menuItemTextStyle, flex: 1 }}>
              {activeService?.name || t("popup.noService")}
            </span>
            <div style={triggerChevron}>
              <ChevronIcon color={theme.text.secondary} expanded={serviceMenuOpen} />
            </div>
          </button>

          {/* Dropdown Menu */}
          {serviceMenuOpen && settings?.modelServices.length ? (
            <div role="listbox" style={menuStyle}>
              {settings.modelServices.map((service) => {
                const palette = getAvatarPalette(service.iconText, service.name, themeName === "dark")
                const selected = service.id === settings.activeModelServiceId
                const displayText = getAvatarDisplayText(service.iconText, service.name)

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => {
                      void handleServiceChange(service.id)
                    }}
                    onMouseEnter={() => setHoveredItem(service.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    style={menuItemStyle(service.id, selected)}>
                    <span aria-hidden="true" style={menuItemAvatarStyle(palette, displayText)}>
                      {displayText}
                    </span>
                    <span style={menuItemTextStyle}>
                      {service.name || t("popup.unnamedService")}
                    </span>
                    {selected ? (
                      <span
                        aria-hidden="true"
                        style={{
                          display: "flex",
                          alignItems: "center"
                        }}>
                        <CheckIcon color={theme.accent.primary} />
                      </span>
                    ) : (
                      <span style={{ width: 14, height: 14 }} />
                    )}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Actions Selector */}
      <div style={{ marginBottom: uiSpace[12] }}>
        <div style={fieldLabelStyle}>{t("popup.selectAction")}</div>

        <div ref={actionsMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              if (!settings || settings.actions.length === 0) {
                return
              }
              setActionsMenuOpen((open) => !open)
              setServiceMenuOpen(false)
            }}
            disabled={!settings || settings.actions.length === 0}
            aria-haspopup="listbox"
            aria-expanded={actionsMenuOpen}
            style={{
              ...triggerStyle(actionsMenuOpen),
              paddingLeft: uiSpace[12],
              opacity: !settings ? 0.6 : 1
            }}>
            {/* Text + Avatar Stack */}
            <span
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                minWidth: 0,
                overflow: "hidden"
              }}>
              <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                {enabledActionsCount > 0
                  ? t("popup.enabledActions", [String(enabledActionsCount)])
                  : t("popup.noActions")}
              </span>
              {settings && (
                <AvatarStack actions={settings.actions} themeName={themeName} theme={theme} />
              )}
            </span>

            <div style={triggerChevron}>
              <ChevronIcon color={theme.text.secondary} expanded={actionsMenuOpen} />
            </div>
          </button>

          {/* Actions Dropdown Menu */}
          {actionsMenuOpen && settings?.actions.length ? (
            <div
              role="listbox"
              aria-multiselectable="true"
              style={menuStyle}>
              {settings.actions.map((action) => {
                const isEnabled = action.enabled !== false

                return (
                  <button
                    key={action.id}
                    type="button"
                    role="option"
                    aria-selected={isEnabled}
                    onClick={() => {
                      void handleActionToggle(action.id)
                    }}
                    onMouseEnter={() => setHoveredItem(action.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    style={{
                      ...menuItemStyle(action.id, false),
                      color: isEnabled ? theme.text.primary : theme.text.secondary,
                      transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                    }}>
                    <span aria-hidden="true" style={{
                      ...menuItemAvatarStyle({ background: theme.bg.surface, color: theme.accent.primary }, "")
                    }}>
                      {action.icon ? (
                        <ActionIcon icon={action.icon} size={16} color={theme.accent.primary} />
                      ) : (
                        <span style={{ fontSize: 10, color: theme.text.secondary }}>?</span>
                      )}
                    </span>
                    <span style={menuItemTextStyle}>
                      {action.label}
                    </span>
                    <ToggleSwitch
                      checked={isEnabled}
                      onChange={() => void handleActionToggle(action.id)}
                      theme={theme}
                    />
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: uiSpace[10],
          borderTop: `1px solid ${theme.border.hairline}`
        }}>
        <span
          style={{
            fontSize: uiTypography.fontSize.xs,
            color: theme.text.secondary
          }}>
          v{chrome.runtime.getManifest().version}
        </span>
        <button
          type="button"
          onClick={openOptionsPage}
          onMouseDown={() => setPressedBtn("open-settings")}
          onMouseUp={() => setPressedBtn(null)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.bg.surfaceAlt
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
            setPressedBtn(null)
          }}
          style={{
            border: "none",
            borderRadius: uiRadius.pill,
            padding: `${uiSpace[4]}px ${uiSpace[10]}px`,
            background: "transparent",
            color: theme.accent.primary,
            fontSize: uiTypography.fontSize.sm,
            fontWeight: uiTypography.fontWeight.semibold,
            fontFamily: uiTypography.fontFamily,
            cursor: "pointer",
            outline: "none",
            transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, transform 150ms ${uiMotion.easingSpring}`,
            transform: pressedBtn === "open-settings" ? "scale(0.96)" : "scale(1)"
          }}>
          {t("popup.settings")}
        </button>
      </div>
    </div>
  )
}
