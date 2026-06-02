import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react"

import { getSettings, saveSettings } from "@/shared/storage"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createFieldLabelStyle, createInputStyle } from "@/shared/ui/styles"
import { getAvatarPalette, getAvatarDisplayText } from "@/shared/ui/avatar"
import { ActionIcon } from "@/shared/ui/iconify"
import { useI18n } from "@/shared/i18n/context"
import type { ActionTemplate, ExtensionSettings } from "@/shared/types"

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
        width: 28,
        height: 16,
        borderRadius: 8,
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
          left: checked ? 14 : 2,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: `left ${uiMotion.durationFast} ${uiMotion.easingStandard}`
        }}
      />
    </button>
  )
}

const AVATAR_SIZE = 26
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
    settings?.providers.find((provider) => provider.id === settings.activeProviderId) ?? null
  const avatarPalette = getAvatarPalette(activeService?.name, activeService?.name, themeName === "dark")
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
    if (!settings || serviceId === settings.activeProviderId) {
      return
    }
    const nextSettings = { ...settings, activeProviderId: serviceId }
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
    padding: uiSpace[16],
    background: theme.bg.surface,
    fontFamily: uiTypography.fontFamily,
    display: "flex",
    flexDirection: "column",
    borderRadius: uiRadius.lg
  }

  const fieldLabelStyle: CSSProperties = {
    ...createFieldLabelStyle(theme)
  }

  // Trigger 按钮左侧 icon 占位宽度: icon-left(10) + icon-size(30) + gap-to-text(8) = 48
  const TRIGGER_LEFT_PAD = uiSpace[10] + AVATAR_SIZE + 8

  const triggerStyle = (isOpen: boolean): CSSProperties => ({
    ...createInputStyle(theme, isOpen),
    height: 40,
    padding: `0 ${uiSpace[12]}px 0 ${TRIGGER_LEFT_PAD}px`,
    fontSize: uiTypography.fontSize.sm,
    cursor: settings?.providers.length ? "pointer" : "default",
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
    maxHeight: 36 * 2 + 16 + 8,
    overflowY: "auto",
    borderRadius: uiRadius.lg,
    background: theme.bg.surface,
    border: `1px solid ${theme.border.default}`,
    boxShadow: uiShadow.xl,
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
      minHeight: 36,
      padding: `${uiSpace[6]}px ${uiSpace[10]}px`,
      border: "none",
      borderRadius: uiRadius.sm,
      background: selected ? theme.bg.surfaceMuted : isHovered ? theme.bg.surfaceAlt : "transparent",
      color: theme.text.primary,
      cursor: "pointer",
      textAlign: "left" as const,
      fontFamily: uiTypography.fontFamily,
      fontSize: uiTypography.fontSize.sm,
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
      {/* Service Selector */}
      <div style={{ marginBottom: uiSpace[16] }}>
        <div style={fieldLabelStyle}>{t("popup.selectService")}</div>

        <div ref={serviceMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              if (!settings || settings.providers.length === 0 || changing) {
                return
              }
              setServiceMenuOpen((open) => !open)
              setActionsMenuOpen(false)
            }}
            disabled={!settings || settings.providers.length === 0 || changing}
            aria-haspopup="listbox"
            aria-expanded={serviceMenuOpen}
            style={{
              ...triggerStyle(serviceMenuOpen),
              opacity: !settings || changing ? 0.6 : 1
            }}>
            <div aria-hidden="true" style={triggerLeftIcon}>
              <span
                style={{
                  ...avatarStyle(avatarPalette, AVATAR_SIZE, getAvatarDisplayText(activeService?.name, activeService?.name).length)
                }}>
                {getAvatarDisplayText(activeService?.name, activeService?.name)}
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
          {serviceMenuOpen && settings?.providers.length ? (
            <div role="listbox" style={menuStyle}>
              {settings.providers.map((service) => {
                const palette = getAvatarPalette(service.name, service.name, themeName === "dark")
                const selected = service.id === settings.activeProviderId
                const displayText = getAvatarDisplayText(service.name, service.name)

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
      <div style={{ marginBottom: uiSpace[16] }}>
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
