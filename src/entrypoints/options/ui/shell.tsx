import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { useI18n } from "@/shared/i18n/context"
import { NavIcon } from "@/shared/ui/iconify"
import { BrandIcon } from "@/shared/ui/icons"
import { uiThemes } from "@/shared/ui/tokens"
import { useUiThemeName } from "@/shared/ui/theme"
import { createOptionsCss } from "./css"
import { cx, Button } from "./primitives"

// ── SettingRow ────────────────────────────────────────────────────────────

interface SettingRowProps {
  title?: string
  desc?: ReactNode
  htmlFor?: string
  /** fixed（380，默认）/ narrow（≤240，开关类）/ wide（跨列占满剩余宽度） */
  width?: "fixed" | "narrow" | "wide"
  /** 控件纵向堆叠（如输入框 + 按钮） */
  stack?: boolean
  /** 右侧控件区 */
  children?: ReactNode
}

/**
 * 行式布局单元（docs/OPTIONS_UI.md §2.2）：
 * 左 = 标题（13/500）+ 说明（12/secondary，≤70ch），右 = 控件（默认 380px）。
 * 宽控件（textarea / chips / 滑条）用 `width="wide"` 跨列，否则会被压成多行。
 */
export function SettingRow({ title, desc, htmlFor, width = "fixed", stack, children }: SettingRowProps) {
  return (
    <div
      className={cx(
        "opt-row",
        width === "narrow" && "opt-row--narrow",
        width === "wide" && "opt-row--wide",
        stack && "opt-row--stack"
      )}>
      {title || desc ? (
        <div className="opt-row-text">
          {title ? (
            htmlFor ? (
              <label className="opt-row-title" htmlFor={htmlFor}>
                {title}
              </label>
            ) : (
              <span className="opt-row-title">{title}</span>
            )
          ) : null}
          {desc ? <p className="opt-row-desc">{desc}</p> : null}
        </div>
      ) : null}
      <div className="opt-row-ctl">{children}</div>
    </div>
  )
}

// ── SectionCard ───────────────────────────────────────────────────────────

interface SectionCardProps {
  title: string
  description?: ReactNode
  /** 头部右侧操作（新增、恢复默认等） */
  actions?: ReactNode
  /** 保存条：通栏卡（如系统提示词）在这里传；列表-详情卡请放进详情区顶部 */
  saveBar?: ReactNode
  bodyClassName?: string
  children: ReactNode
}

export function SectionCard({ title, description, actions, saveBar, bodyClassName, children }: SectionCardProps) {
  return (
    <section className="opt-card">
      <div className="opt-card-head">
        <div className="opt-card-head-text">
          <h2 className="opt-card-title">{title}</h2>
          {description ? <p className="opt-card-desc">{description}</p> : null}
        </div>
        {actions ? <div className="opt-card-actions">{actions}</div> : null}
      </div>
      {saveBar}
      <div className={cx("opt-card-body", bodyClassName)}>{children}</div>
    </section>
  )
}

// ── SaveBar ───────────────────────────────────────────────────────────────

interface SaveBarProps {
  dirty: boolean
  /** 刚保存成功（约 2s 内显示「✓ 已保存」，之后回到静默态） */
  justSaved: boolean
  onSave: () => void
  onDiscard: () => void
  /** 放在详情区顶部时用 inset 变体（不带通栏底色） */
  inset?: boolean
  /** 单列表单卡通栏保存条：吸在顶栏下方 */
  sticky?: boolean
}

/** 保存条（docs/OPTIONS_UI.md §2.4）：无改动时两个按钮静默禁用，不用 toast */
export function SaveBar({ dirty, justSaved, onSave, onDiscard, inset, sticky }: SaveBarProps) {
  const { t } = useI18n()

  return (
    <div
      className={cx("opt-savebar", inset && "opt-savebar--inset", sticky && "opt-savebar--sticky")}
      data-dirty={dirty}
      data-just-saved={!dirty && justSaved}>
      <span className="opt-savebar-status" aria-live="polite">
        {dirty ? (
          <>
            <span className="opt-savebar-dot" />
            {t("options.saveBar.dirty")}
          </>
        ) : (
          <>{`✓ ${t("options.saveBar.saved")}`}</>
        )}
      </span>
      <span className="opt-savebar-hint">{t("options.saveBar.shortcut")}</span>
      <Button variant="ghost" size="sm" disabled={!dirty} onClick={onDiscard}>
        {t("options.saveBar.discard")}
      </Button>
      <Button variant="primary" size="sm" disabled={!dirty} onClick={onSave}>
        {t("options.saveBar.save")}
      </Button>
    </div>
  )
}

// ── PageShell ─────────────────────────────────────────────────────────────

interface PageShellProps {
  sections: { key: string; label: string; icon: string }[]
  activeSection: string
  onSelectSection: (key: string) => void
  title: string
  description: string
  version: string
  footer?: ReactNode
  scrollRef?: React.RefObject<HTMLDivElement | null>
  children: ReactNode
}

/**
 * 设置页骨架（docs/OPTIONS_UI.md §4.1）：
 * 侧栏（280px，<1100px 折叠为图标栏）+ 顶栏（分区标题 + 一句描述）+ 内容列（is 1360 居中）。
 * 页面级 CSS 在这里注入一次（`opt-` 前缀）。
 */
export function PageShell({
  sections,
  activeSection,
  onSelectSection,
  title,
  description,
  version,
  footer,
  scrollRef,
  children
}: PageShellProps) {
  const { t } = useI18n()
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]

  return (
    <div className="opt-root">
      <style>{createOptionsCss(theme)}</style>

      <nav className="opt-sidebar" aria-label={t("options.a11y.sections")}>
        <div className="opt-brand">
          <BrandIcon size={22} />
          <span className="opt-brand-name">AIction</span>
          <span className="opt-brand-version">v{version}</span>
        </div>

        <div className="opt-nav">
          {sections.map((section) => {
            const isActive = activeSection === section.key
            return (
              <button
                key={section.key}
                type="button"
                className="opt-nav-item"
                aria-current={isActive ? "page" : undefined}
                title={section.label}
                onClick={() => onSelectSection(section.key)}>
                <NavIcon
                  icon={section.icon}
                  size={16}
                  color={isActive ? theme.accent.primary : theme.text.secondary}
                />
                <span className="opt-nav-label">{section.label}</span>
              </button>
            )
          })}
        </div>

        {footer ? <div className="opt-sidebar-foot">{footer}</div> : null}
      </nav>

      <div className="opt-main">
        <div className="opt-scroll" ref={scrollRef}>
          <div className="opt-topbar">
            <div className="opt-topbar-inner">
              <h1 className="opt-topbar-title">{title}</h1>
              <p className="opt-topbar-desc">{description}</p>
            </div>
          </div>
          <div className="opt-content">{children}</div>
        </div>
      </div>
    </div>
  )
}
