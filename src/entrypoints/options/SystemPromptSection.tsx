import { useRef, useState, type CSSProperties } from "react"

import { trackEvent } from "@/shared/analytics"
import { DEFAULT_SYSTEM_PROMPT } from "@/shared/defaults"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { createCardStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import type { ExtensionSettings } from "@/shared/types"
import { ConfirmDialog } from "@/entrypoints/options/ConfirmDialog"

/** 软上限：超过则提示可能影响请求成本与响应速度（不强制截断） */
const PROMPT_SOFT_LIMIT = 5000

/** 系统提示词支持的占位符（与 src/shared/prompt.ts 保持一致） */
const PLACEHOLDERS = [
  { token: "{selection}", i18nKey: "options.systemPrompt.placeholder.selection" },
  { token: "{pageTitle}", i18nKey: "options.systemPrompt.placeholder.pageTitle" },
  { token: "{pageUrl}", i18nKey: "options.systemPrompt.placeholder.pageUrl" },
  { token: "{metaDescription}", i18nKey: "options.systemPrompt.placeholder.metaDescription" },
  { token: "{surround}", i18nKey: "options.systemPrompt.placeholder.surround" }
] as const

interface SystemPromptSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

export function SystemPromptSection({ settings, saveSettingsNow }: SystemPromptSectionProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  const cardStyle: CSSProperties = { ...createCardStyle(theme) }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const value = settings.systemPrompt

  // 即时保存：输入即写入；失焦时 trim 清理首尾空白
  const handleChange = (next: string) => {
    saveSettingsNow((current) => ({ ...current, systemPrompt: next }))
  }

  const handleBlur = () => {
    const trimmed = value.trim()
    if (trimmed !== value) {
      handleChange(trimmed)
    }
  }

  // 在光标处插入占位符
  const insertPlaceholder = (token: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart ?? value.length
    const end = textarea.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    handleChange(next)
    // 插入后把光标移到占位符之后
    const caret = start + token.length
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(caret, caret)
    })
  }

  const handleReset = () => {
    handleChange(DEFAULT_SYSTEM_PROMPT)
    setShowResetConfirm(false)
    void trackEvent("system_prompt_reset")
  }

  const overLimit = value.length > PROMPT_SOFT_LIMIT

  return (
    <section style={{ ...cardStyle, marginBottom: uiSpace[16] }}>
      <h2
        style={{
          margin: `0 0 ${uiSpace[4]}px`,
          fontSize: uiTypography.fontSize.lg,
          fontWeight: uiTypography.fontWeight.semibold,
          letterSpacing: uiTypography.letterSpacing.tight
        }}>
        {t("options.systemPrompt.title")}
      </h2>
      <p
        style={{
          margin: `0 0 ${uiSpace[16]}px`,
          color: theme.text.secondary,
          fontSize: uiTypography.fontSize.md
        }}>
        {t("options.systemPrompt.desc")}
      </p>

      {/* 占位符提示 */}
      <div style={{ marginBottom: uiSpace[10] }}>
        <div
          style={{
            marginBottom: uiSpace[6],
            fontSize: uiTypography.fontSize.sm,
            fontWeight: uiTypography.fontWeight.medium,
            color: theme.text.secondary
          }}>
          {t("options.systemPrompt.placeholdersTitle")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: uiSpace[6] }}>
          {PLACEHOLDERS.map((placeholder) => (
            <button
              key={placeholder.token}
              type="button"
              onClick={() => insertPlaceholder(placeholder.token)}
              title={t(placeholder.i18nKey)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: uiSpace[6],
                padding: `${uiSpace[4]}px ${uiSpace[10]}px`,
                borderRadius: uiRadius.sm,
                border: `0.5px solid ${theme.border.hairline}`,
                background: theme.bg.surfaceMuted,
                color: theme.text.primary,
                cursor: "pointer",
                fontFamily: uiTypography.fontFamilyMono,
                fontSize: uiTypography.fontSize.xs,
                outline: "none",
                transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
              }}>
              <span>{placeholder.token}</span>
              <span style={{ color: theme.text.secondary, fontFamily: uiTypography.fontFamily }}>
                {t(placeholder.i18nKey)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 编辑器 */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
        spellCheck={false}
        aria-label={t("options.systemPrompt.title")}
        style={{
          width: "100%",
          boxSizing: "border-box",
          minHeight: 360,
          padding: uiSpace[12],
          borderRadius: uiRadius.sm,
          border: `0.5px solid ${theme.border.hairline}`,
          background: theme.bg.surfaceMuted,
          color: theme.text.primary,
          fontFamily: uiTypography.fontFamilyMono,
          fontSize: uiTypography.fontSize.sm,
          lineHeight: 1.6,
          resize: "vertical",
          outline: "none",
          tabSize: 2
        }}
      />

      {/* 底部状态行：字符数 + 恢复默认 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: uiSpace[8],
          gap: uiSpace[12]
        }}>
        <div
          style={{
            fontSize: uiTypography.fontSize.xs,
            color: overLimit ? theme.state.warning : theme.text.secondary
          }}>
          {overLimit
            ? t("options.systemPrompt.tooLong", [String(value.length)])
            : t("options.systemPrompt.charCount", [String(value.length)])}
        </div>

        <button
          type="button"
          onClick={() => setShowResetConfirm(true)}
          style={{
            padding: `${uiSpace[6]}px ${uiSpace[14]}px`,
            borderRadius: uiRadius.sm,
            border: `0.5px solid ${theme.border.hairline}`,
            background: "transparent",
            color: theme.text.primary,
            cursor: "pointer",
            fontFamily: uiTypography.fontFamily,
            fontSize: uiTypography.fontSize.sm,
            outline: "none",
            transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
          }}>
          {t("options.systemPrompt.resetButton")}
        </button>
      </div>

      {showResetConfirm ? (
        <ConfirmDialog
          title={t("options.systemPrompt.resetConfirmTitle")}
          message={t("options.systemPrompt.resetConfirmMessage")}
          confirmLabel={t("options.systemPrompt.resetConfirmButton")}
          cancelLabel={t("options.connection.cancel")}
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
          themeName={themeName}
        />
      ) : null}
    </section>
  )
}
