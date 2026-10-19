import { useCallback, useRef, useState } from "react"

import { trackEvent, lengthBucket } from "@/shared/analytics"
import { DEFAULT_SYSTEM_PROMPT } from "@/shared/defaults"
import { useI18n } from "@/shared/i18n/context"
import type { ExtensionSettings } from "@/shared/types"
import { ConfirmDialog } from "@/entrypoints/options/ConfirmDialog"
import { useDraftState, useSaveShortcut } from "./hooks/draft"
import { Button, Chip, FieldGroup, SaveBar, SectionCard, SettingRow } from "./ui"

/** 软上限：超过则提示可能影响请求成本与响应速度（不强制截断） */
const PROMPT_SOFT_LIMIT = 5000

/** 系统提示词支持的占位符（与 src/shared/prompt.ts 保持一致） */
const PLACEHOLDERS = [
  { token: "{selection}", i18nKey: "options.systemPrompt.placeholder.selection" },
  { token: "{pageTitle}", i18nKey: "options.systemPrompt.placeholder.pageTitle" },
  { token: "{pageUrl}", i18nKey: "options.systemPrompt.placeholder.pageUrl" },
  { token: "{metaDescription}", i18nKey: "options.systemPrompt.placeholder.metaDescription" },
  { token: "{surround}", i18nKey: "options.systemPrompt.placeholder.surround" },
  { token: "{uiLanguage}", i18nKey: "options.systemPrompt.placeholder.uiLanguage" }
] as const

interface SystemPromptSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

/**
 * 系统提示词：单列表单卡（docs/OPTIONS_UI.md §2.4）——保存条通栏吸在卡片头部下方，
 * 占位符 chips 与编辑器都是草稿操作（按钮也属于草稿，因为它改的是编辑器文本）。
 */
export function SystemPromptSection({ settings, saveSettingsNow }: SystemPromptSectionProps) {
  const { t } = useI18n()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // 草稿：编辑只落在本地，点击保存才写入 settings；比较时忽略首尾空白（保存会 trim）
  const { draft, setDraft, dirty, justSaved, markSaved, discard } = useDraftState(
    settings.systemPrompt,
    (a, b) => a.trim() === b.trim()
  )

  const handleSave = useCallback(() => {
    if (!dirty) return
    const trimmed = draft.trim()
    saveSettingsNow((current) => ({ ...current, systemPrompt: trimmed }))
    markSaved()
    void trackEvent("system_prompt_save", {
      // 空 = 用户选择回退到内置默认模板（见 types.ts 对 systemPrompt 的说明）
      is_empty: trimmed.length === 0,
      is_default: trimmed === DEFAULT_SYSTEM_PROMPT.trim(),
      length_bucket: lengthBucket(trimmed.length),
      // 只上报占位符 token（预设枚举），不上报提示词内容
      used_placeholders: PLACEHOLDERS.filter((item) => trimmed.includes(item.token)).map((item) => item.token),
      source: "options"
    })
  }, [dirty, draft, saveSettingsNow, markSaved])

  useSaveShortcut(handleSave)

  // 在光标处插入占位符（只改草稿）
  const insertPlaceholder = (token: string) => {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? draft.length
    const end = textarea?.selectionEnd ?? draft.length
    setDraft(draft.slice(0, start) + token + draft.slice(end))
    // 插入后把光标移到占位符之后
    const caret = start + token.length
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(caret, caret)
    })
  }

  const handleReset = () => {
    setDraft(DEFAULT_SYSTEM_PROMPT)
    setShowResetConfirm(false)
    void trackEvent("system_prompt_reset")
  }

  const overLimit = draft.length > PROMPT_SOFT_LIMIT

  return (
    <>
      <SectionCard
        title={t("options.systemPrompt.title")}
        description={t("options.systemPrompt.cardDesc")}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(true)}>
            {t("options.systemPrompt.resetButton")}
          </Button>
        }
        saveBar={<SaveBar sticky dirty={dirty} justSaved={justSaved} onSave={handleSave} onDiscard={discard} />}>
        <FieldGroup>
          <SettingRow
            title={t("options.systemPrompt.placeholdersTitle")}
            desc={t("options.systemPrompt.placeholdersDesc")}
            width="wide">
            <div className="opt-chips">
              {PLACEHOLDERS.map((placeholder) => (
                <Chip
                  key={placeholder.token}
                  token={placeholder.token}
                  label={t(placeholder.i18nKey)}
                  title={t(placeholder.i18nKey)}
                  onClick={() => insertPlaceholder(placeholder.token)}
                />
              ))}
            </div>
          </SettingRow>

          <SettingRow width="wide">
            <div className="opt-stack">
              <textarea
                ref={textareaRef}
                className="opt-textarea opt-mono"
                value={draft}
                spellCheck={false}
                aria-label={t("options.systemPrompt.title")}
                style={{ minHeight: 360, fontSize: 13, tabSize: 2 }}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="opt-foot">
                <span className={overLimit ? "opt-foot--warning" : undefined}>
                  {overLimit
                    ? t("options.systemPrompt.tooLong", [String(draft.length)])
                    : t("options.systemPrompt.charCount", [String(draft.length)])}
                </span>
                <span className="opt-savebar-hint">{t("options.saveBar.shortcut")}</span>
              </div>
            </div>
          </SettingRow>
        </FieldGroup>
      </SectionCard>

      {showResetConfirm ? (
        <ConfirmDialog
          title={t("options.systemPrompt.resetConfirmTitle")}
          message={t("options.systemPrompt.resetConfirmMessage")}
          confirmLabel={t("options.systemPrompt.resetConfirmButton")}
          cancelLabel={t("options.connection.cancel")}
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      ) : null}
    </>
  )
}
