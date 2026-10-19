import { useCallback, useEffect, useRef, useState } from "react"
import { addIcon } from "@iconify/react"

import { consumeFirstTimeFlag, lengthBucket, trackEvent } from "@/shared/analytics"
import { isBuiltinActionId } from "@/shared/defaults"
import { useI18n } from "@/shared/i18n/context"
import { hasTextPlaceholder } from "@/shared/prompt"
import { saveUserIcon } from "@/shared/storage"
import { BUNDLED_TABLER_ICONS } from "@/shared/ui/bundled-icons"
import { ACTION_ICON_LIBRARY, type IconEntry } from "@/shared/ui/icon-library"
import { ActionIcon } from "@/shared/ui/iconify"
import { useUiThemeName } from "@/shared/ui/theme"
import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { uiThemes } from "@/shared/ui/tokens"
import type { ActionTemplate, ExtensionSettings } from "@/shared/types"
import { ConfirmDialog } from "./ConfirmDialog"
import { useDraftItemMap, useSaveShortcut } from "./hooks/draft"
import {
  Button,
  DangerZone,
  EmptyState,
  FieldGroup,
  Hint,
  SaveBar,
  SectionCard,
  SettingRow,
  TextArea,
  TextField,
  cx
} from "./ui"

/** 编辑聚合上报的静默窗口：用户停手这么久才上报一次（避免逐字上报） */
const ACTION_EDIT_FLUSH_MS = 2000

type ActionEditField = "label" | "template"

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

interface CustomActionsCardProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

/**
 * 自定义动作：列表-详情卡（docs/OPTIONS_UI.md §2.4）。
 * - 左列表：拖拽排序、启用开关 = 即时项；
 * - 右详情：名称 / 图标 / 模板 = 草稿字段，保存条放在详情区顶部；
 * - 草稿按条目 id 保留，未保存的条目在左列表打一个未保存点。
 */
export function CustomActionsCard({ settings, saveSettingsNow }: CustomActionsCardProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const [selectedActionId, setSelectedActionId] = useState<string | null>(settings.actions[0]?.id ?? null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [pendingDeleteActionId, setPendingDeleteActionId] = useState<string | null>(null)

  // 图标选择器
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconPickerPos, setIconPickerPos] = useState<{ top: number; left: number } | null>(null)
  const [iconSearchQuery, setIconSearchQuery] = useState("")
  const [iconSearchResults, setIconSearchResults] = useState<string[]>([])
  const [iconSearchLoading, setIconSearchLoading] = useState(false)
  const iconSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const iconPickerRef = useRef<HTMLDivElement | null>(null)

  const drafts = useDraftItemMap<ActionTemplate>(settings.actions, (a, b) =>
    a.id === b.id &&
    a.label === b.label &&
    a.template === b.template &&
    (a.enabled !== false) === (b.enabled !== false) &&
    (a.icon ?? "") === (b.icon ?? "")
  )
  const selectedAction = selectedActionId ? drafts.getEffective(selectedActionId) : undefined
  const selectedActionIndex = selectedActionId
    ? settings.actions.findIndex((item) => item.id === selectedActionId)
    : -1
  const dirty = selectedActionId ? drafts.isDirty(selectedActionId) : false

  useEffect(() => {
    if (!showIconPicker) return
    const handleClickOutside = (event: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(event.target as Node)) {
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
      const query = iconSearchQuery.trim()
      if (/^[a-z0-9]+:[a-z0-9-]+$/i.test(query)) {
        setIconSearchResults([query])
        setIconSearchLoading(false)
        return
      }
      fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=64`)
        .then((response) => response.json())
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

  // ── 埋点：动作编辑聚合（避免输入时逐字上报，见 docs/ANALYTICS.md §3.7） ──
  // 上报值取自「当前有效草稿」（草稿优先、回落已保存值）：编辑不再即时落盘，
  // 若读已保存值会报出旧的结构特征（长度分桶 / 占位符）。
  const pendingActionEditsRef = useRef<Map<string, Set<ActionEditField>>>(new Map())
  const editFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftsRef = useRef(drafts)

  // 在 effect 中同步（不能在渲染期间写 ref —— 并发渲染会留下未提交的快照）
  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  const flushActionEdits = useCallback(() => {
    if (editFlushTimerRef.current) {
      clearTimeout(editFlushTimerRef.current)
      editFlushTimerRef.current = null
    }

    const pending = pendingActionEditsRef.current
    if (pending.size === 0) {
      return
    }
    pendingActionEditsRef.current = new Map()

    for (const [actionId, fields] of pending) {
      const action = draftsRef.current.getEffective(actionId)
      if (!action) {
        continue
      }
      // 只上报结构特征（长度分桶 / 是否含占位符），不上报用户填写的文案与模板
      void trackEvent("action_updated", {
        is_custom: !isBuiltinActionId(actionId),
        changed_fields: [...fields],
        has_selection_placeholder: hasTextPlaceholder(action.template),
        template_length_bucket: lengthBucket(action.template.length),
        label_length_bucket: lengthBucket(action.label.length),
        enabled: action.enabled !== false,
        source: "options"
      })
    }
  }, [])

  // 卸载（切换设置分区）时把未上报的编辑刷出去
  useEffect(() => {
    return () => {
      flushActionEdits()
    }
  }, [flushActionEdits])

  const recordActionEdit = (actionId: string, field: ActionEditField) => {
    const fields = pendingActionEditsRef.current.get(actionId) ?? new Set<ActionEditField>()
    fields.add(field)
    pendingActionEditsRef.current.set(actionId, fields)

    if (editFlushTimerRef.current) {
      clearTimeout(editFlushTimerRef.current)
    }
    editFlushTimerRef.current = setTimeout(flushActionEdits, ACTION_EDIT_FLUSH_MS)
  }

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
          const svgMatch = svgText.match(/<svg[^>]*>/)
          const bodyMatch = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
          if (bodyMatch && svgMatch) {
            const svgTag = svgMatch[0]
            const viewBoxMatch = svgTag.match(/viewBox=["']([^"']+)["']/)
            let width = 24
            let height = 24
            if (viewBoxMatch) {
              const viewBox = viewBoxMatch[1].split(/\s+/)
              if (viewBox.length === 4) {
                width = parseInt(viewBox[2]) || 24
                height = parseInt(viewBox[3]) || 24
              }
            } else {
              const widthMatch = svgTag.match(/width=["']([^"']+)["']/)
              const heightMatch = svgTag.match(/height=["']([^"']+)["']/)
              if (widthMatch) width = parseInt(widthMatch[1]) || 24
              if (heightMatch) height = parseInt(heightMatch[1]) || 24
            }
            await saveUserIcon(iconName, { body: bodyMatch[1], width, height })
            addIcon(iconName, { body: bodyMatch[1], width, height })
          }
        }
      } catch (error) {
        console.error("Failed to fetch icon:", error)
      }
    }
  }

  /** 改草稿字段（名称 / 图标 / 模板），并按字段聚合埋点 */
  const updateActionDraft = (actionId: string, patch: Partial<ActionTemplate>) => {
    drafts.update(actionId, (current) => ({ ...current, ...patch }))

    if (patch.label !== undefined) {
      recordActionEdit(actionId, "label")
    }
    if (patch.template !== undefined) {
      recordActionEdit(actionId, "template")
    }
  }

  /** 启用开关是即时项：草稿与已保存值同步改写，避免保存草稿时把开关状态回退 */
  const toggleActionEnabled = (actionId: string, next: boolean) => {
    drafts.update(actionId, (current) => ({ ...current, enabled: next }))
    saveSettingsNow((current) => ({
      ...current,
      actions: current.actions.map((item) => (item.id === actionId ? { ...item, enabled: next } : item))
    }))
    void trackEvent("action_enabled_toggled", {
      scope: "options",
      enabled: next,
      is_custom: !isBuiltinActionId(actionId),
      source: "options"
    })
  }

  const handleSave = useCallback(() => {
    if (!selectedActionId || !selectedAction || !draftsRef.current.isDirty(selectedActionId)) return
    const normalized: ActionTemplate = {
      ...selectedAction,
      label: selectedAction.label.trim(),
      template: selectedAction.template.trim()
    }
    saveSettingsNow((current) => ({
      ...current,
      actions: current.actions.map((item) => (item.id === selectedActionId ? normalized : item))
    }))
    flushActionEdits()
    draftsRef.current.markSaved(selectedActionId)
  }, [selectedActionId, selectedAction, saveSettingsNow, flushActionEdits])

  useSaveShortcut(handleSave)

  const handleDiscard = () => {
    if (selectedActionId) {
      drafts.discard(selectedActionId)
    }
  }

  const handleActionDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleActionDragOver = (event: React.DragEvent, index: number) => {
    event.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleActionDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const fromIndex = draggedIndex
      const toIndex = dragOverIndex
      saveSettingsNow((current) => {
        const newActions = [...current.actions]
        const [draggedItem] = newActions.splice(fromIndex, 1)
        newActions.splice(toIndex, 0, draggedItem)
        return { ...current, actions: newActions }
      })
      void trackEvent("action_reordered", { from_index: fromIndex, to_index: toIndex, source: "options" })
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
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
          enabled: true
        }
      ]
    }))
    setSelectedActionId(newId)

    const totalActions = settings.actions.length + 1
    const customCount = settings.actions.filter((action) => !isBuiltinActionId(action.id)).length + 1
    void (async () => {
      const isFirstCustom = await consumeFirstTimeFlag("custom_action_created")
      void trackEvent("action_created", {
        is_first_custom: isFirstCustom,
        total_actions: totalActions,
        custom_count: customCount,
        source: "options"
      })
    })()
  }

  const handleDeleteAction = (actionId: string) => {
    const index = settings.actions.findIndex((action) => action.id === actionId)
    const remaining = settings.actions.filter((action) => action.id !== actionId)

    drafts.discard(actionId)
    saveSettingsNow((current) => ({
      ...current,
      actions: current.actions.filter((action) => action.id !== actionId)
    }))

    if (remaining.length === 0) {
      setSelectedActionId(null)
    } else if (index < remaining.length) {
      setSelectedActionId(remaining[index].id)
    } else {
      setSelectedActionId(remaining[remaining.length - 1].id)
    }

    // 删除前先把该动作未上报的编辑刷掉，否则会丢一条 action_updated
    flushActionEdits()
    void trackEvent("action_deleted", {
      is_custom: !isBuiltinActionId(actionId),
      remaining_actions: remaining.length,
      remaining_custom: remaining.filter((action) => !isBuiltinActionId(action.id)).length,
      source: "options"
    })
    setPendingDeleteActionId(null)
  }

  /** 选中图标（预置库 / 搜索结果共用）：落草稿 + 埋点 */
  const handleIconPick = async (iconName: string, actionId: string) => {
    await handleIconSelect(iconName)
    updateActionDraft(actionId, { icon: iconName })
    setShowIconPicker(false)

    // 图标名是预设枚举（tabler 名 / iconify 集合名），不是用户文本
    void trackEvent("action_icon_changed", {
      icon_source: isBundledIcon(iconName) ? "bundled" : "iconify",
      icon_name: iconName,
      is_custom: !isBuiltinActionId(actionId),
      source: "options"
    })
  }

  const openIconPicker = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    setIconPickerPos({ top: Math.min(rect.bottom + 6, window.innerHeight - 280), left: rect.left })
    setShowIconPicker((value) => !value)
  }

  const renderIconGrid = (actionId: string, currentIcon?: string) => (
    <div className="opt-iconpicker-grid">
      {iconSearchQuery.trim() ? (
        iconSearchLoading ? (
          <div className="opt-iconpicker-note">{t("options.actions.iconSearching")}</div>
        ) : iconSearchResults.length > 0 ? (
          iconSearchResults.map((iconName) => (
            <button
              key={iconName}
              type="button"
              className="opt-icon-btn"
              title={iconName}
              aria-pressed={currentIcon === iconName}
              onClick={() => void handleIconPick(iconName, actionId)}>
              <ActionIcon
                icon={iconName}
                size={18}
                color={currentIcon === iconName ? theme.accent.primary : theme.text.secondary}
              />
            </button>
          ))
        ) : (
          <div className="opt-iconpicker-note">{t("options.actions.iconNoResults")}</div>
        )
      ) : (
        ACTION_ICON_LIBRARY.map((entry: IconEntry) => (
          <button
            key={entry.icon}
            type="button"
            className="opt-icon-btn"
            title={entry.label}
            aria-pressed={currentIcon === entry.icon}
            onClick={() => void handleIconPick(entry.icon, actionId)}>
            <ActionIcon
              icon={entry.icon}
              size={18}
              color={currentIcon === entry.icon ? theme.accent.primary : theme.text.secondary}
            />
          </button>
        ))
      )}
    </div>
  )

  const missingPlaceholder = selectedAction ? !hasTextPlaceholder(selectedAction.template) : false

  return (
    <>
      <SectionCard
        title={t("options.actions.title")}
        description={t("options.actions.customActionsDesc")}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<span aria-hidden="true">＋</span>}
            onClick={handleAddAction}>
            {t("options.actions.addAction")}
          </Button>
        }
        bodyClassName="opt-card-body--flush">
        <div className="opt-split">
          {/* 左：动作列表（排序与启停即时生效） */}
          <div className="opt-list" role="listbox" aria-label={t("options.actions.title")}>
            {settings.actions.length === 0 ? (
              <EmptyState>{t("options.actions.emptyActions")}</EmptyState>
            ) : (
              settings.actions.map((item, index) => {
                const effective = drafts.getEffective(item.id) ?? item
                const isSelected = selectedActionId === item.id
                const invalid = !hasTextPlaceholder(effective.template)

                return (
                  <div
                    key={item.id}
                    role="option"
                    tabIndex={0}
                    aria-selected={isSelected}
                    draggable
                    className={cx(
                      "opt-list-item",
                      draggedIndex === index && "opt-list-item--dragging",
                      dragOverIndex === index && "opt-list-item--drop-target",
                      invalid && "opt-list-item--warning"
                    )}
                    onClick={() => setSelectedActionId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setSelectedActionId(item.id)
                      }
                    }}
                    onDragStart={() => handleActionDragStart(index)}
                    onDragOver={(event) => handleActionDragOver(event, index)}
                    onDragEnd={handleActionDragEnd}>
                    <span className="opt-drag-handle" title={t("options.actions.dragHandle")}>
                      <DragHandleIcon size={12} color={theme.text.secondary} />
                    </span>
                    <span className="opt-list-icon">
                      {effective.icon ? (
                        <ActionIcon icon={effective.icon} size={16} color={theme.accent.primary} />
                      ) : (
                        <span style={{ fontSize: 11, color: theme.text.secondary }}>?</span>
                      )}
                    </span>
                    <span className="opt-list-item-title">{effective.label}</span>
                    {drafts.isDirty(item.id) ? (
                      <span className="opt-dirty-dot" title={t("options.saveBar.dirty")} aria-hidden="true" />
                    ) : null}
                    <span onClick={(event) => event.stopPropagation()}>
                      <ToggleSwitch
                        checked={effective.enabled !== false}
                        onChange={() => toggleActionEnabled(item.id, effective.enabled === false)}
                        theme={theme}
                      />
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* 右：详情（草稿 + 保存条） */}
          <div className="opt-detail">
            {!selectedAction || !selectedActionId ? (
              <EmptyState>{t("options.actions.selectAction")}</EmptyState>
            ) : (
              <>
                <SaveBar
                  inset
                  dirty={dirty}
                  justSaved={drafts.justSavedId === selectedActionId}
                  onSave={handleSave}
                  onDiscard={handleDiscard}
                />

                <FieldGroup title={t("options.actions.groupBasic")}>
                  <SettingRow title={t("options.actions.actionName")} htmlFor="action-name">
                    <TextField
                      id="action-name"
                      value={selectedAction.label}
                      placeholder={t("options.actions.actionNamePlaceholder")}
                      onValueChange={(value) => updateActionDraft(selectedActionId, { label: value })}
                    />
                  </SettingRow>

                  <SettingRow title={t("options.actions.selectIcon")} desc={t("options.actions.iconDesc")}>
                    <button
                      type="button"
                      className="opt-icon-trigger"
                      aria-label={t("options.actions.selectIcon")}
                      title={t("options.actions.selectIcon")}
                      onClick={(event) => openIconPicker(event.currentTarget)}>
                      {selectedAction.icon ? (
                        <ActionIcon icon={selectedAction.icon} size={18} color={theme.accent.primary} />
                      ) : (
                        <span style={{ fontSize: 12, color: theme.text.secondary }}>?</span>
                      )}
                    </button>
                  </SettingRow>

                  <SettingRow
                    title={t("options.actions.actionTemplate")}
                    desc={t("options.actions.actionTemplateDesc")}
                    width="wide">
                    <div className="opt-stack">
                      <TextArea
                        value={selectedAction.template}
                        rows={4}
                        mono
                        style={{ minHeight: 88 }}
                        placeholder={t("options.actions.actionTemplatePlaceholder")}
                        aria-label={t("options.actions.actionTemplate")}
                        onValueChange={(value) => updateActionDraft(selectedActionId, { template: value })}
                      />
                      <p className="opt-hint">
                        {t("options.actions.templateHelp")}
                        <code className="opt-code">{"{selection}"}</code>
                        {t("options.actions.templateHelpSuffix")}
                      </p>
                      {missingPlaceholder ? (
                        <Hint warning>{t("options.actions.missingPlaceholder")}</Hint>
                      ) : null}
                    </div>
                  </SettingRow>
                </FieldGroup>

                <DangerZone
                  title={t("options.actions.deleteActionTitle")}
                  desc={t("options.actions.deleteActionDesc")}
                  action={
                    <Button variant="danger" onClick={() => setPendingDeleteActionId(selectedActionId)}>
                      {t("options.actions.delete")}
                    </Button>
                  }
                />
              </>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 图标选择器：fixed 定位，避免被卡片圆角裁切 */}
      {showIconPicker && selectedActionId && iconPickerPos ? (
        <div
          ref={iconPickerRef}
          className="opt-iconpicker"
          style={{ top: iconPickerPos.top, left: iconPickerPos.left }}>
          <div className="opt-iconpicker-head">
            <span className="opt-iconpicker-title">{t("options.actions.selectIcon")}</span>
            <input
              className="opt-input opt-input--sm"
              type="text"
              value={iconSearchQuery}
              autoFocus
              placeholder={t("options.actions.iconSearchPlaceholder")}
              onChange={(event) => setIconSearchQuery(event.target.value)}
              onKeyDown={async (event) => {
                if (event.key === "Enter") {
                  const query = iconSearchQuery.trim()
                  if (/^[a-z0-9]+:[a-z0-9-]+$/i.test(query)) {
                    await handleIconSelect(query)
                    updateActionDraft(selectedActionId, { icon: query })
                    setShowIconPicker(false)
                  }
                }
              }}
            />
          </div>
          {renderIconGrid(selectedActionId, drafts.getEffective(selectedActionId)?.icon)}
        </div>
      ) : null}

      {pendingDeleteActionId ? (
        <ConfirmDialog
          title={t("options.actions.deleteActionConfirmTitle")}
          message={t("options.actions.deleteActionConfirmMessage")}
          confirmLabel={t("options.actions.delete")}
          cancelLabel={t("options.connection.cancel")}
          onConfirm={() => handleDeleteAction(pendingDeleteActionId)}
          onCancel={() => setPendingDeleteActionId(null)}
        />
      ) : null}
    </>
  )
}
