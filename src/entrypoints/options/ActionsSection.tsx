import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { addIcon } from "@iconify/react"

import { ActionIcon } from "@/shared/ui/iconify"
import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { hasTextPlaceholder } from "@/shared/prompt"
import { saveUserIcon } from "@/shared/storage"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createButtonStyle, createCardStyle, createFieldLabelStyle, createInputStyle as createSharedInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { ACTION_ICON_LIBRARY, type IconEntry } from "@/shared/ui/icon-library"
import { BUNDLED_TABLER_ICONS } from "@/shared/ui/bundled-icons"
import { useI18n } from "@/shared/i18n/context"
import type { ActionTemplate, ExtensionSettings, QuickAction } from "@/shared/types"

function PlusIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3V13M3 8H13" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

function DragHandleIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5" cy="4" r="1.5" fill={color} />
      <circle cx="11" cy="4" r="1.5" fill={color} />
      <circle cx="5" cy="8" r="1.5" fill={color} />
      <circle cx="11" cy="8" r="1.5" fill={color} />
      <circle cx="5" cy="12" r="1.5" fill={color} />
      <circle cx="11" cy="12" r="1.5" fill={color} />
    </svg>
  )
}

interface ActionsSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

export function ActionsSection({ settings, saveSettingsNow }: ActionsSectionProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const [selectedActionId, setSelectedActionId] = useState<string | null>(() => {
    return settings.actions.length > 0 ? settings.actions[0].id : null
  })
  const [draggedActionIndex, setDraggedActionIndex] = useState<number | null>(null)
  const [dragOverActionIndex, setDragOverActionIndex] = useState<number | null>(null)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconSearchQuery, setIconSearchQuery] = useState("")
  const [iconSearchResults, setIconSearchResults] = useState<string[]>([])
  const [iconSearchLoading, setIconSearchLoading] = useState(false)
  const iconSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const iconPickerRef = useRef<HTMLDivElement | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [pressedBtn, setPressedBtn] = useState<string | null>(null)

  useEffect(() => {
    if (!showIconPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setShowIconPicker(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showIconPicker])

  useEffect(() => {
    if (!iconSearchQuery.trim()) {
      setIconSearchResults([])
      setIconSearchLoading(false)
      return
    }
    setIconSearchLoading(true)
    if (iconSearchTimerRef.current) clearTimeout(iconSearchTimerRef.current)
    iconSearchTimerRef.current = setTimeout(() => {
      const q = iconSearchQuery.trim()
      if (/^[a-z0-9]+:[a-z0-9-]+$/i.test(q)) {
        setIconSearchResults([q])
        setIconSearchLoading(false)
        return
      }
      fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=64`)
        .then((res) => res.json())
        .then((data: { icons?: string[] }) => {
          setIconSearchResults(data.icons ?? [])
        })
        .catch(() => {
          setIconSearchResults([])
        })
        .finally(() => {
          setIconSearchLoading(false)
        })
    }, 300)
    return () => {
      if (iconSearchTimerRef.current) clearTimeout(iconSearchTimerRef.current)
    }
  }, [iconSearchQuery])

  const isBundledIcon = (iconName: string): boolean => {
    if (!iconName.startsWith("tabler:")) return false
    const name = iconName.replace("tabler:", "")
    return name in (BUNDLED_TABLER_ICONS.icons as Record<string, { body: string }>)
  }

  const handleIconSelect = async (iconName: string) => {
    if (isBundledIcon(iconName)) {
      const name = iconName.replace("tabler:", "")
      const iconData = (BUNDLED_TABLER_ICONS.icons as Record<string, { body: string }>)[name]
      if (iconData) {
        await saveUserIcon(iconName, {
          body: iconData.body,
          width: BUNDLED_TABLER_ICONS.width,
          height: BUNDLED_TABLER_ICONS.height
        })
      }
    } else {
      try {
        const response = await fetch(`https://api.iconify.design/${iconName}.svg?height=24`)
        if (response.ok) {
          const svgText = await response.text()
          const bodyMatch = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
          if (bodyMatch) {
            await saveUserIcon(iconName, { body: bodyMatch[1], width: 24, height: 24 })
            addIcon(iconName, { body: bodyMatch[1], width: 24, height: 24 })
          }
        }
      } catch (error) {
        console.error("Failed to fetch icon:", error)
      }
    }
  }

  const updateCustomAction = (index: number, patch: Partial<ActionTemplate>) => {
    saveSettingsNow((current) => ({
      ...current,
      actions: current.actions.map((item, itemIndex) =>
        itemIndex === index
          ? {
            ...item,
            ...patch
          }
          : item
      )
    }))
  }

  const handleActionDragStart = (index: number) => {
    setDraggedActionIndex(index)
  }

  const handleActionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedActionIndex !== null && draggedActionIndex !== index) {
      setDragOverActionIndex(index)
    }
  }

  const handleActionDragEnd = () => {
    if (draggedActionIndex !== null && dragOverActionIndex !== null && draggedActionIndex !== dragOverActionIndex) {
      saveSettingsNow((current) => {
        const newActions = [...current.actions]
        const [draggedItem] = newActions.splice(draggedActionIndex, 1)
        newActions.splice(dragOverActionIndex, 0, draggedItem)
        return { ...current, actions: newActions }
      })
    }
    setDraggedActionIndex(null)
    setDragOverActionIndex(null)
  }

  const handleAddAction = () => {
    const newId = `custom-${Date.now()}`
    saveSettingsNow((current) => ({
      ...current,
      actions: [
        ...current.actions,
        {
          id: newId,
          label: t("options.actions.newActionLabel"),
          template: t("options.actions.newActionTemplate"),
          enabled: true,
          iconText: ""
        }
      ]
    }))
    setSelectedActionId(newId)
  }

  const handleDeleteAction = (actionId: string) => {
    const index = settings.actions.findIndex((a) => a.id === actionId)
    saveSettingsNow((current) => ({
      ...current,
      actions: current.actions.filter((action) => action.id !== actionId)
    }))
    const remaining = settings.actions.filter((a) => a.id !== actionId)
    if (remaining.length === 0) {
      setSelectedActionId(null)
    } else if (index < remaining.length) {
      setSelectedActionId(remaining[index].id)
    } else {
      setSelectedActionId(remaining[remaining.length - 1].id)
    }
  }

  const selectedAction = selectedActionId ? settings.actions.find((a) => a.id === selectedActionId) : null
  const selectedActionIndex = selectedActionId ? settings.actions.findIndex((a) => a.id === selectedActionId) : -1

  // --- Shared styles ---
  const cardStyle: CSSProperties = {
    ...createCardStyle(theme)
  }

  const fieldLabelStyle: CSSProperties = {
    ...createFieldLabelStyle(theme)
  }

  const createInputStyle = (fieldName: string): CSSProperties => ({
    ...createSharedInputStyle(theme, focusedField === fieldName)
  })

  const secondaryBtnStyle: CSSProperties = {
    ...createButtonStyle(theme, "secondary", { compact: true })
  }

  const emptyStateStyle: CSSProperties = {
    ...createStatusMessageStyle(theme, "info"),
    textAlign: "center",
    padding: `${uiSpace[24]}px ${uiSpace[16]}px`,
    border: `1px dashed ${theme.border.default}`,
    background: theme.bg.surfaceMuted,
    color: theme.text.secondary,
    fontSize: uiTypography.fontSize.md
  }

  const quickActionLabel = (action: QuickAction): string => {
    const key = `options.actions.quickAction.${action.type}` as const
    return t(key)
  }

  const quickActionDescription = (action: QuickAction): string | undefined => {
    const key = `options.actions.quickAction.${action.type}.description` as const
    const val = t(key)
    return val === key ? undefined : val
  }

  const updateQuickAction = (index: number, patch: Partial<QuickAction>) => {
    saveSettingsNow((current) => ({
      ...current,
      quickActions: current.quickActions.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }))
  }

  return (
    <>
      {/* Quick Actions Card */}
      <section style={{ ...cardStyle, padding: 0, overflow: "hidden", marginBottom: uiSpace[16] }}>
        <div style={{ padding: `${uiSpace[20]}px ${uiSpace[24]}px ${uiSpace[16]}px`, borderBottom: `0.5px solid ${theme.border.hairline}` }}>
          <h2
            style={{
              margin: 0,
              fontSize: uiTypography.fontSize.lg,
              fontWeight: uiTypography.fontWeight.semibold,
              letterSpacing: uiTypography.letterSpacing.tight
            }}>
            {t("options.actions.quickActionsTitle")}
          </h2>
        </div>

        <div style={{ padding: `${uiSpace[8]}px ${uiSpace[12]}px` }}>
          {settings.quickActions.map((action, index) => (
            <div
              key={action.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: uiSpace[12],
                padding: `${uiSpace[10]}px ${uiSpace[12]}px`,
                borderRadius: uiRadius.sm
              }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: uiRadius.sm,
                  background: theme.bg.surface,
                  color: theme.accent.primary,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                <ActionIcon icon={action.icon} size={16} color={theme.accent.primary} />
              </div>

              <span
                style={{
                  flex: 1,
                  fontSize: uiTypography.fontSize.sm,
                  fontWeight: uiTypography.fontWeight.regular,
                  color: theme.text.primary
                }}>
                {quickActionLabel(action)}
              </span>

              {quickActionDescription(action) && (
                <span
                  style={{
                    fontSize: uiTypography.fontSize.xs,
                    color: theme.text.secondary,
                    flexShrink: 0
                  }}>
                  {quickActionDescription(action)}
                </span>
              )}

              <ToggleSwitch
                checked={action.enabled}
                onChange={() => updateQuickAction(index, { enabled: !action.enabled })}
                theme={theme}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Custom AI Actions Card */}
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
          {t("options.actions.title")}
        </h2>
        <button
          type="button"
          onClick={handleAddAction}
          onMouseDown={() => setPressedBtn("add-action")}
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
            transform: pressedBtn === "add-action" ? "scale(0.96)" : "scale(1)"
          }}>
          <PlusIcon size={14} color="#fff" />
          <span>{t("options.actions.addAction")}</span>
        </button>
      </div>

      {/* Main content: left list + right detail */}
      <div style={{ display: "flex", minHeight: 420 }}>
        {/* Left: Action list */}
        <div
          style={{
            width: 280,
            minWidth: 280,
            borderRight: `0.5px solid ${theme.border.hairline}`,
            display: "flex",
            flexDirection: "column"
          }}>
          {/* List items */}
          <div style={{ flex: 1, overflowY: "auto", padding: uiSpace[8] }}>
            {settings.actions.length === 0 ? (
              <div style={{ ...emptyStateStyle, margin: uiSpace[8], fontSize: uiTypography.fontSize.sm }}>
                {t("options.actions.emptyActions")}
              </div>
            ) : (
              settings.actions.map((item, index) => {
                const isSelected = selectedActionId === item.id
                const isDragging = draggedActionIndex === index
                const isDragOver = dragOverActionIndex === index
                const invalid = !hasTextPlaceholder(item.template)

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleActionDragStart(index)}
                    onDragOver={(e) => handleActionDragOver(e, index)}
                    onDragEnd={handleActionDragEnd}
                    onClick={() => setSelectedActionId(item.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: uiSpace[8],
                      padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
                      marginBottom: 2,
                      borderRadius: uiRadius.sm,
                      cursor: "pointer",
                      background: isSelected ? `${theme.accent.primary}14` : isDragOver ? theme.bg.surfaceAlt : "transparent",
                      border: `1px solid ${invalid ? theme.state.warning : "transparent"}`,
                      opacity: isDragging ? 0.5 : 1,
                      transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                    }}>
                    {/* Drag handle */}
                    <div
                      style={{ cursor: "grab", display: "flex", flexShrink: 0, opacity: 0.4 }}
                      title={t("options.actions.dragHandle")}>
                      <DragHandleIcon size={12} color={theme.text.secondary} />
                    </div>

                    {/* Icon */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: uiRadius.sm,
                        background: theme.bg.surface,
                        color: theme.accent.primary,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}>
                      {item.icon ? (
                        <ActionIcon icon={item.icon} size={16} color={theme.accent.primary} />
                      ) : (
                        <span style={{ fontSize: 10, color: theme.text.secondary }}>?</span>
                      )}
                    </div>

                    {/* Label */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: uiTypography.fontSize.sm,
                        fontWeight: isSelected ? uiTypography.fontWeight.semibold : uiTypography.fontWeight.regular,
                        color: theme.text.primary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                      {item.label}
                    </span>

                    {/* Enable toggle */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <ToggleSwitch
                        checked={item.enabled !== false}
                        onChange={() => updateCustomAction(index, { enabled: item.enabled === false ? true : false })}
                        theme={theme}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div style={{ flex: 1, padding: uiSpace[24], overflowY: "auto" }}>
          {!selectedAction ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: theme.text.secondary,
                fontSize: uiTypography.fontSize.md
              }}>
              {t("options.actions.selectAction")}
            </div>
          ) : (
            <div>
              {/* Action name */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <label style={fieldLabelStyle}>{t("options.actions.actionName")}</label>
                <input
                  value={selectedAction.label}
                  onFocus={() => setFocusedField(`${selectedAction.id}-label`)}
                  onBlur={() => setFocusedField(null)}
                  onChange={(event) => {
                    updateCustomAction(selectedActionIndex, { label: event.target.value })
                  }}
                  placeholder={t("options.actions.actionNamePlaceholder")}
                  style={{ ...createInputStyle(`${selectedAction.id}-label`), fontSize: uiTypography.fontSize.sm }}
                />
              </div>

              {/* Icon */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <label style={fieldLabelStyle}>{t("options.connection.icon")}</label>
                <div style={{ display: "flex", alignItems: "center", gap: uiSpace[12] }}>
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      title={t("options.connection.iconTooltip")}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: uiRadius.sm,
                        border: `1px solid ${theme.border.default}`,
                        background: theme.bg.surface,
                        color: theme.accent.primary,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        padding: 0,
                        outline: "none"
                      }}>
                      {selectedAction.icon ? (
                        <ActionIcon icon={selectedAction.icon} size={20} color={theme.accent.primary} />
                      ) : (
                        <span style={{ fontSize: 14, color: theme.text.secondary }}>?</span>
                      )}
                    </button>

                    {showIconPicker ? (
                      <div
                        ref={iconPickerRef}
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          marginTop: uiSpace[8],
                          width: 320,
                          height: 200,
                          overflowY: "auto",
                          background: theme.bg.surface,
                          border: `1px solid ${theme.border.default}`,
                          borderRadius: uiRadius.md,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          zIndex: 100,
                          padding: uiSpace[12]
                        }}>
                        <div style={{
                          marginBottom: uiSpace[8],
                          paddingBottom: uiSpace[8],
                          borderBottom: `0.5px solid ${theme.border.hairline}`
                        }}>
                          <span style={{ fontSize: uiTypography.fontSize.sm, fontWeight: uiTypography.fontWeight.semibold, color: theme.text.primary }}>
                            {t("options.actions.selectIcon")}
                          </span>
                        </div>

                        <input
                          type="text"
                          value={iconSearchQuery}
                          onChange={(e) => setIconSearchQuery(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              const q = iconSearchQuery.trim()
                              if (/^[a-z0-9]+:[a-z0-9-]+$/i.test(q)) {
                                await handleIconSelect(q)
                                saveSettingsNow((current) => ({
                                  ...current,
                                  actions: current.actions.map((a) =>
                                    a.id === selectedAction.id ? { ...a, icon: q } : a
                                  )
                                }))
                                setShowIconPicker(false)
                              }
                            }
                          }}
                          placeholder={t("options.actions.iconSearchPlaceholder")}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: `${uiSpace[6]}px ${uiSpace[8]}px`,
                            fontSize: uiTypography.fontSize.sm,
                            border: `1px solid ${theme.border.default}`,
                            borderRadius: uiRadius.sm,
                            background: theme.bg.surface,
                            color: theme.text.primary,
                            outline: "none",
                            marginBottom: uiSpace[8]
                          }}
                        />

                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(8, 1fr)",
                          gap: uiSpace[4]
                        }}>
                          {iconSearchQuery.trim() ? (
                            iconSearchLoading ? (
                              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: uiSpace[16], color: theme.text.secondary, fontSize: uiTypography.fontSize.xs }}>
                                {t("options.actions.iconSearching")}
                              </div>
                            ) : iconSearchResults.length > 0 ? (
                              iconSearchResults.map((iconName) => {
                                const isSelected = selectedAction.icon === iconName
                                return (
                                  <button
                                    key={iconName}
                                    type="button"
                                    title={iconName}
                                    onClick={async () => {
                                      await handleIconSelect(iconName)
                                      saveSettingsNow((current) => ({
                                        ...current,
                                        actions: current.actions.map((a) =>
                                          a.id === selectedAction.id ? { ...a, icon: iconName } : a
                                        )
                                      }))
                                      setShowIconPicker(false)
                                    }}
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: uiRadius.sm,
                                      border: isSelected ? `2px solid ${theme.accent.primary}` : `1px solid ${theme.border.hairline}`,
                                      background: isSelected ? `${theme.accent.primary}14` : "transparent",
                                      color: isSelected ? theme.accent.primary : theme.text.primary,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      cursor: "pointer",
                                      padding: 0,
                                      outline: "none",
                                      transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                                    }}>
                                    <ActionIcon icon={iconName} size={18} color={isSelected ? theme.accent.primary : theme.text.secondary} />
                                  </button>
                                )
                              })
                            ) : (
                              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: uiSpace[16], color: theme.text.secondary, fontSize: uiTypography.fontSize.xs }}>
                                {t("options.actions.iconNoResults")}
                              </div>
                            )
                          ) : (
                            ACTION_ICON_LIBRARY.map((entry: IconEntry) => {
                              const isSelected = selectedAction.icon === entry.icon
                              return (
                                <button
                                  key={entry.icon}
                                  type="button"
                                  title={entry.label}
                                  onClick={async () => {
                                    await handleIconSelect(entry.icon)
                                    saveSettingsNow((current) => ({
                                      ...current,
                                      actions: current.actions.map((a) =>
                                        a.id === selectedAction.id ? { ...a, icon: entry.icon } : a
                                      )
                                    }))
                                    setShowIconPicker(false)
                                  }}
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: uiRadius.sm,
                                    border: isSelected ? `2px solid ${theme.accent.primary}` : `1px solid ${theme.border.hairline}`,
                                    background: isSelected ? `${theme.accent.primary}14` : "transparent",
                                    color: isSelected ? theme.accent.primary : theme.text.primary,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    padding: 0,
                                    outline: "none",
                                    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
                                  }}>
                                  <ActionIcon icon={entry.icon} size={18} color={isSelected ? theme.accent.primary : theme.text.secondary} />
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <span style={{ fontSize: uiTypography.fontSize.sm, color: theme.text.secondary }}>
                    {selectedAction.icon ? t("options.actions.iconSelected") : t("options.connection.iconTooltip")}
                  </span>
                </div>
              </div>

              {/* Template */}
              <div style={{ marginBottom: uiSpace[16] }}>
                <label style={fieldLabelStyle}>{t("options.actions.actionTemplate")}</label>
                <textarea
                  value={selectedAction.template}
                  onFocus={() => setFocusedField(`${selectedAction.id}-template`)}
                  onBlur={() => setFocusedField(null)}
                  onChange={(event) => {
                    updateCustomAction(selectedActionIndex, { template: event.target.value })
                  }}
                  placeholder={t("options.actions.actionTemplatePlaceholder")}
                  rows={4}
                  style={{
                    ...createInputStyle(`${selectedAction.id}-template`),
                    resize: "vertical",
                    minHeight: 80,
                    fontSize: uiTypography.fontSize.sm
                  } as CSSProperties}
                />
                <p style={{ margin: `${uiSpace[6]}px 0 0`, color: theme.text.secondary, fontSize: uiTypography.fontSize.xs }}>
                  {t("options.actions.templateHelp")}<code style={{ background: theme.bg.surfaceMuted, padding: "1px 4px", borderRadius: 3 }}>{"{text}"}</code>{t("options.actions.templateHelpSuffix")}
                </p>
                {!hasTextPlaceholder(selectedAction.template) ? (
                  <div style={{ marginTop: uiSpace[6], color: theme.state.warning, fontSize: uiTypography.fontSize.xs, fontWeight: uiTypography.fontWeight.medium }}>
                    {t("options.actions.missingPlaceholder")}
                  </div>
                ) : null}
              </div>

              {/* Enable toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${uiSpace[12]}px ${uiSpace[14]}px`,
                  border: `1px solid ${theme.border.hairline}`,
                  borderRadius: uiRadius.md,
                  background: theme.bg.surfaceMuted,
                  marginBottom: uiSpace[20]
                }}>
                <span style={{ fontSize: uiTypography.fontSize.sm, color: theme.text.primary }}>
                  {selectedAction.enabled === false ? t("options.actions.disabled") : t("options.actions.enabled")}
                </span>
                <ToggleSwitch
                  checked={selectedAction.enabled !== false}
                  onChange={() => updateCustomAction(selectedActionIndex, { enabled: selectedAction.enabled === false ? true : false })}
                  theme={theme}
                />
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleDeleteAction(selectedAction.id)}
                style={{
                  ...secondaryBtnStyle,
                  color: theme.state.error,
                  borderColor: theme.state.error
                }}>
                {t("options.actions.delete")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
    </>
  )
}
