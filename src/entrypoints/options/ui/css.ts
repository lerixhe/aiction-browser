import { createFocusRing } from "@/shared/ui/styles"
import { uiShadow, uiTypography, type UiTheme } from "@/shared/ui/tokens"
import { optLayout, optSize } from "./tokens"

/**
 * 页面级 CSS（见 docs/OPTIONS_UI.md §4.3）。
 *
 * 设置页所有组件只返回 className，样式集中在这里输出：
 * 这样 :hover / :focus-visible / ::placeholder / ::selection / 滚动条配色 / 媒体查询
 * 这些 inline style 做不到的能力才可用。类名前缀统一 `opt-`，`<style>` 由 PageShell 注入一次。
 */
export function createOptionsCss(theme: UiTheme): string {
  const accent = theme.accent.primary
  const accentHover = theme.accent.primaryHover
  const danger = theme.state.error
  const warning = theme.state.warning
  const success = theme.state.success
  const ring = createFocusRing(accent)
  const inverse = theme.text.inverse
  const controlBorder = theme.border.default
  const arrow = selectArrow(theme.text.secondary)

  return `
  :where(.opt-root, .opt-root *) {
    box-sizing: border-box;
  }

  .opt-root {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: ${theme.bg.page};
    color: ${theme.text.primary};
    font-family: ${uiTypography.fontFamily};
    font-size: ${optSize.rowTitleSize}px;
    -webkit-font-smoothing: antialiased;
  }

  .opt-root ::selection {
    background: ${accent}33;
  }

  /* ── 侧栏 ───────────────────────────────────────────── */
  .opt-sidebar {
    flex: 0 0 auto;
    width: ${optLayout.sidebarWidth}px;
    display: flex;
    flex-direction: column;
    background: ${theme.bg.surface};
    border-right: 1px solid ${theme.border.hairline};
    overflow: hidden;
  }

  .opt-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 20px 20px 14px;
  }

  .opt-brand-name {
    font-size: 16px;
    font-weight: ${uiTypography.fontWeight.semibold};
    letter-spacing: ${uiTypography.letterSpacing.tight};
    white-space: nowrap;
  }

  .opt-brand-version {
    font-size: 11px;
    color: ${theme.text.secondary};
    white-space: nowrap;
  }

  .opt-nav {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 12px;
  }

  .opt-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    margin-bottom: 2px;
    border: 1px solid transparent;
    border-radius: ${optSize.controlRadius}px;
    background: transparent;
    color: ${theme.text.primary};
    font-family: inherit;
    font-size: ${optSize.rowTitleSize}px;
    text-align: left;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
  }

  .opt-nav-item:hover {
    background: ${theme.bg.surfaceMuted};
  }

  .opt-nav-item[aria-current="page"] {
    background: ${accent}14;
    color: ${accent};
    font-weight: ${uiTypography.fontWeight.semibold};
  }

  .opt-nav-item:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-nav-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opt-sidebar-foot {
    padding: 12px 20px;
    border-top: 1px solid ${theme.border.hairline};
    font-size: 11px;
    color: ${theme.text.secondary};
    text-align: center;
  }

  /* ── 主区 ───────────────────────────────────────────── */
  .opt-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .opt-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: ${controlBorder} transparent;
  }

  .opt-scroll::-webkit-scrollbar,
  .opt-list::-webkit-scrollbar,
  .opt-textarea::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .opt-scroll::-webkit-scrollbar-thumb,
  .opt-list::-webkit-scrollbar-thumb,
  .opt-textarea::-webkit-scrollbar-thumb {
    background: ${controlBorder};
    background-clip: content-box;
    border: 3px solid transparent;
    border-radius: 999px;
  }

  .opt-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .opt-topbar {
    position: sticky;
    top: 0;
    z-index: 5;
    background: ${theme.bg.surface};
    border-bottom: 1px solid ${theme.border.hairline};
  }

  .opt-topbar-inner,
  .opt-content {
    max-width: ${optLayout.contentMaxWidth}px;
    margin: 0 auto;
    width: 100%;
  }

  .opt-topbar-inner {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: ${optLayout.topBarHeight}px;
    padding: ${optLayout.topBarPaddingY}px ${optLayout.contentPaddingX}px;
  }

  .opt-topbar-title {
    margin: 0;
    font-size: ${optSize.sectionTitleSize}px;
    font-weight: ${uiTypography.fontWeight.semibold};
    letter-spacing: ${uiTypography.letterSpacing.tight};
  }

  .opt-topbar-desc {
    margin: 2px 0 0;
    font-size: ${optSize.rowDescSize}px;
    color: ${theme.text.secondary};
  }

  .opt-content {
    padding: ${optLayout.contentPaddingY}px ${optLayout.contentPaddingX}px 48px;
  }

  /* ── 卡片 ───────────────────────────────────────────── */
  .opt-card {
    background: ${theme.bg.surface};
    border: 1px solid ${theme.border.hairline};
    border-radius: ${optSize.cardRadius}px;
    box-shadow: ${uiShadow.sm};
  }

  .opt-card + .opt-card {
    margin-top: 16px;
  }

  .opt-card-head {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 14px 20px;
    border-bottom: 1px solid ${theme.border.hairline};
  }

  .opt-card-head-text {
    flex: 1;
    min-width: 0;
  }

  .opt-card-title {
    margin: 0;
    font-size: ${optSize.cardTitleSize}px;
    font-weight: ${uiTypography.fontWeight.semibold};
    letter-spacing: ${uiTypography.letterSpacing.tight};
  }

  .opt-card-desc {
    margin: 3px 0 0;
    font-size: ${optSize.rowDescSize}px;
    color: ${theme.text.secondary};
    line-height: 1.5;
    max-width: ${optLayout.descMaxWidth};
  }

  .opt-card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .opt-card-body {
    padding: 2px 20px 18px;
  }

  .opt-card-body--flush {
    padding: 0;
  }

  .opt-split {
    display: flex;
    min-height: 380px;
  }

  /* ── 分组与行 ────────────────────────────────────────── */
  .opt-group + .opt-group {
    margin-top: 10px;
  }

  .opt-group-title {
    margin: 0;
    padding: 16px 0 2px;
    font-size: ${optSize.groupTitleSize}px;
    font-weight: ${uiTypography.fontWeight.semibold};
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${theme.text.secondary};
  }

  .opt-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: ${optLayout.rowColumnGap}px;
    row-gap: 8px;
    align-items: center;
    padding: ${optLayout.rowPaddingY}px 0;
  }

  .opt-row + .opt-row,
  .opt-group-title + .opt-row + .opt-row {
    border-top: 1px solid ${theme.border.hairline};
  }

  .opt-row-text {
    grid-column: 1;
    min-width: 0;
  }

  .opt-row-title {
    display: block;
    font-size: ${optSize.rowTitleSize}px;
    font-weight: ${uiTypography.fontWeight.medium};
    color: ${theme.text.primary};
  }

  .opt-row-desc {
    margin: 2px 0 0;
    font-size: ${optSize.rowDescSize}px;
    line-height: 1.55;
    color: ${theme.text.secondary};
    max-width: ${optLayout.descMaxWidth};
  }

  .opt-row-ctl {
    grid-column: 2;
    justify-self: end;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    width: ${optLayout.controlWidth}px;
    min-width: 0;
  }

  .opt-row--narrow .opt-row-ctl {
    width: ${optLayout.controlNarrowWidth}px;
  }

  .opt-row--wide .opt-row-ctl {
    grid-column: 1 / -1;
    justify-self: stretch;
    justify-content: flex-start;
    width: 100%;
  }

  .opt-row--stack .opt-row-ctl {
    flex-direction: column;
    align-items: stretch;
  }

  .opt-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  /* ── 控件 ───────────────────────────────────────────── */
  .opt-input,
  .opt-textarea,
  .opt-select {
    width: 100%;
    min-width: 0;
    height: ${optSize.controlHeight}px;
    padding: 0 10px;
    border: 1px solid ${controlBorder};
    border-radius: ${optSize.controlRadius}px;
    background: ${theme.bg.surface};
    color: ${theme.text.primary};
    font-family: inherit;
    font-size: ${optSize.rowTitleSize}px;
    transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
  }

  .opt-textarea {
    height: auto;
    padding: 10px 12px;
    line-height: 1.6;
    resize: vertical;
  }

  .opt-input:hover,
  .opt-textarea:hover,
  .opt-select:hover {
    border-color: ${theme.text.secondary};
  }

  .opt-input:focus,
  .opt-textarea:focus,
  .opt-select:focus {
    outline: none;
    border-color: ${accent};
    box-shadow: ${ring};
  }

  .opt-input::placeholder,
  .opt-textarea::placeholder {
    color: ${theme.text.secondary};
    opacity: 0.75;
  }

  .opt-input:disabled,
  .opt-select:disabled {
    background: ${theme.bg.surfaceMuted};
    color: ${theme.text.secondary};
    cursor: not-allowed;
  }

  .opt-select {
    appearance: none;
    padding-right: 28px;
    background-image: ${arrow};
    background-repeat: no-repeat;
    background-position: right 9px center;
    background-size: 11px;
    cursor: pointer;
  }

  .opt-mono {
    font-family: ${uiTypography.fontFamilyMono};
  }

  .opt-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: ${optSize.controlHeight}px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: ${optSize.controlRadius}px;
    background: transparent;
    color: ${theme.text.primary};
    font-family: inherit;
    font-size: ${optSize.rowTitleSize}px;
    font-weight: ${uiTypography.fontWeight.medium};
    white-space: nowrap;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  }

  .opt-btn:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-btn:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .opt-btn--sm {
    height: 28px;
    padding: 0 10px;
    font-size: ${optSize.rowDescSize}px;
  }

  .opt-btn--primary {
    background: ${accent};
    color: ${inverse};
  }

  .opt-btn--primary:hover:not(:disabled) {
    background: ${accentHover};
  }

  .opt-btn--secondary {
    background: ${theme.bg.surface};
    border-color: ${controlBorder};
    color: ${theme.text.primary};
  }

  .opt-btn--secondary:hover:not(:disabled) {
    background: ${theme.bg.surfaceMuted};
  }

  .opt-btn--ghost {
    color: ${theme.text.secondary};
  }

  .opt-btn--ghost:hover:not(:disabled) {
    background: ${theme.bg.surfaceMuted};
    color: ${theme.text.primary};
  }

  .opt-btn--danger {
    border-color: ${danger}66;
    color: ${danger};
    background: ${theme.bg.surface};
  }

  .opt-btn--danger:hover:not(:disabled) {
    background: ${theme.state.errorBg};
  }

  .opt-segmented {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: ${optSize.controlRadius}px;
    background: ${theme.bg.surfaceMuted};
  }

  .opt-segment {
    height: 26px;
    padding: 0 14px;
    border: none;
    border-radius: ${optSize.smallRadius}px;
    background: transparent;
    color: ${theme.text.primary};
    font-family: inherit;
    font-size: ${optSize.rowDescSize}px;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
  }

  .opt-segment:hover {
    background: ${theme.bg.surface};
  }

  .opt-segment[aria-checked="true"] {
    background: ${theme.bg.surface};
    color: ${accent};
    font-weight: ${uiTypography.fontWeight.semibold};
    box-shadow: ${uiShadow.sm};
  }

  .opt-segment:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border: 1px solid ${controlBorder};
    border-radius: ${optSize.smallRadius}px;
    background: ${theme.bg.surface};
    color: ${theme.text.primary};
    font-family: inherit;
    font-size: ${optSize.rowDescSize}px;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  }

  .opt-chip:hover {
    border-color: ${accent};
    background: ${accent}0F;
    color: ${accent};
  }

  .opt-chip:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .opt-chip-label {
    color: ${theme.text.secondary};
    font-family: ${uiTypography.fontFamily};
  }

  .opt-chip:hover .opt-chip-label {
    color: ${accent};
  }

  .opt-range {
    width: 100%;
    accent-color: ${accent};
    cursor: pointer;
  }

  /* ── 列表-详情 ──────────────────────────────────────── */
  .opt-list {
    flex: 0 0 auto;
    width: ${optLayout.listWidth}px;
    padding: 8px;
    border-right: 1px solid ${theme.border.hairline};
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .opt-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    margin-bottom: 2px;
    border: 1px solid transparent;
    border-radius: ${optSize.controlRadius}px;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .opt-list-item:hover {
    background: ${theme.bg.surfaceMuted};
  }

  .opt-list-item[aria-selected="true"] {
    background: ${accent}14;
    border-color: ${accent}29;
  }

  .opt-list-item:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-list-item--dragging {
    opacity: 0.45;
  }

  .opt-list-item--drop-target {
    border-color: ${accent};
  }

  .opt-list-item--warning {
    border-color: ${warning}66;
  }

  .opt-list-item-title {
    flex: 1;
    min-width: 0;
    font-size: ${optSize.rowTitleSize}px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opt-list-item[aria-selected="true"] .opt-list-item-title {
    font-weight: ${uiTypography.fontWeight.semibold};
  }

  .opt-list-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: ${optSize.smallRadius}px;
    background: ${theme.bg.surface};
    color: ${accent};
    box-shadow: inset 0 0 0 1px ${theme.border.hairline};
  }

  .opt-drag-handle {
    display: inline-flex;
    flex-shrink: 0;
    cursor: grab;
    opacity: 0.35;
  }

  .opt-drag-handle:hover {
    opacity: 0.7;
  }

  .opt-detail {
    flex: 1;
    min-width: 0;
    padding: 4px 20px 18px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .opt-dirty-dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: 50%;
    background: ${warning};
  }

  /* ── 保存条 ─────────────────────────────────────────── */
  .opt-savebar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 20px;
    border-bottom: 1px solid ${theme.border.hairline};
    background: ${theme.bg.surfaceAlt};
  }

  .opt-savebar[data-dirty="true"] {
    background: ${warning}12;
  }

  .opt-savebar-status {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: ${optSize.rowDescSize}px;
    color: ${theme.text.secondary};
  }

  .opt-savebar[data-dirty="true"] .opt-savebar-status {
    color: ${warning};
  }

  .opt-savebar[data-just-saved="true"] .opt-savebar-status {
    color: ${success};
  }

  .opt-savebar-dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: 50%;
    background: currentColor;
  }

  .opt-savebar-hint {
    font-size: 11px;
    color: ${theme.text.secondary};
    opacity: 0.8;
  }

  .opt-savebar--inset {
    margin: 10px 0 4px;
    border: 1px solid ${theme.border.hairline};
    border-radius: ${optSize.controlRadius}px;
    padding: 8px 12px;
  }

  /* ── 危险区 / 空态 / 骨架 ───────────────────────────── */
  .opt-danger {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 14px;
    padding: 12px 14px;
    border: 1px solid ${danger}40;
    border-radius: ${optSize.controlRadius}px;
    background: ${danger}0A;
  }

  .opt-danger-title {
    font-size: ${optSize.rowTitleSize}px;
    font-weight: ${uiTypography.fontWeight.medium};
  }

  .opt-danger-desc {
    margin-top: 2px;
    font-size: ${optSize.rowDescSize}px;
    color: ${theme.text.secondary};
  }

  .opt-empty {
    padding: 28px 16px;
    border: 1px dashed ${controlBorder};
    border-radius: ${optSize.controlRadius}px;
    background: ${theme.bg.surfaceMuted};
    color: ${theme.text.secondary};
    font-size: ${optSize.rowDescSize}px;
    text-align: center;
    line-height: 1.6;
  }

  .opt-skeleton {
    border-radius: ${optSize.smallRadius}px;
    background: linear-gradient(90deg, ${theme.bg.surfaceMuted} 25%, ${theme.bg.surfaceAlt} 37%, ${theme.bg.surfaceMuted} 63%);
    background-size: 400% 100%;
    animation: opt-shimmer 1.4s ease infinite;
  }

  .opt-skeleton-card {
    height: 132px;
    border-radius: ${optSize.cardRadius}px;
    margin-bottom: 16px;
  }

  .opt-status {
    margin-top: 10px;
    padding: 8px 12px;
    border-radius: ${optSize.controlRadius}px;
    font-size: ${optSize.rowDescSize}px;
    line-height: 1.5;
  }

  .opt-status--success {
    background: ${theme.state.successBg};
    border: 1px solid ${success}33;
    color: ${success};
  }

  .opt-status--error {
    background: ${theme.state.errorBg};
    border: 1px solid ${danger}33;
    color: ${danger};
  }

  .opt-hint {
    margin: 6px 0 0;
    font-size: 11px;
    line-height: 1.5;
    color: ${theme.text.secondary};
  }

  .opt-hint--warning {
    color: ${warning};
  }

  .opt-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: ${uiTypography.fontWeight.medium};
  }

  @keyframes opt-shimmer {
    from { background-position: 100% 50%; }
    to { background-position: 0 50%; }
  }

  /* ── 小件：行尾、模板码、模型列表、图标选择器、弹层 ─── */
  .opt-input--sm {
    height: 28px;
    font-size: ${optSize.rowDescSize}px;
  }

  .opt-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    color: ${theme.text.secondary};
  }

  .opt-foot--warning {
    color: ${warning};
  }

  .opt-code {
    font-family: ${uiTypography.fontFamilyMono};
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 4px;
    background: ${accent}1A;
    color: ${theme.text.primary};
  }

  .opt-bullets {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: ${optLayout.descMaxWidth};
    font-size: ${optSize.rowDescSize}px;
    line-height: 1.6;
    color: ${theme.text.secondary};
  }

  .opt-bullets li::marker {
    color: ${theme.text.secondary};
  }

  .opt-savebar--sticky {
    position: sticky;
    top: ${optLayout.topBarHeight}px;
    z-index: 4;
  }

  .opt-model-list {
    border: 1px solid ${theme.border.hairline};
    border-radius: ${optSize.controlRadius}px;
    overflow: hidden;
    background: ${theme.bg.surface};
  }

  .opt-model-list > .opt-input {
    border: none;
    border-bottom: 1px solid ${theme.border.hairline};
    border-radius: 0;
    background: ${theme.bg.surfaceMuted};
  }

  .opt-model-list > .opt-input:focus {
    box-shadow: none;
    border-color: ${accent};
  }

  .opt-model-list-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .opt-model-option {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 4px;
    padding: 6px 10px;
    border: none;
    border-radius: ${optSize.smallRadius}px;
    background: transparent;
    color: ${theme.text.primary};
    font-family: inherit;
    font-size: ${optSize.rowDescSize}px;
    text-align: left;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
  }

  .opt-model-option:hover {
    background: ${theme.bg.surfaceMuted};
  }

  .opt-model-option--selected {
    background: ${accent}14;
    color: ${accent};
  }

  .opt-model-option:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-model-option-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opt-model-list-empty {
    padding: 16px 12px;
    text-align: center;
    font-size: ${optSize.rowDescSize}px;
    color: ${theme.text.secondary};
  }

  .opt-badge--accent {
    background: ${accent}29;
    color: ${accent};
  }

  .opt-badge--success {
    background: ${success}29;
    color: ${success};
  }

  .opt-badge--warning {
    background: ${warning}29;
    color: ${warning};
  }

  .opt-icon-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: ${optSize.controlHeightLg}px;
    height: ${optSize.controlHeightLg}px;
    flex-shrink: 0;
    border: 1px solid ${controlBorder};
    border-radius: ${optSize.controlRadius}px;
    background: ${theme.bg.surface};
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .opt-icon-trigger:hover {
    border-color: ${accent};
  }

  .opt-icon-trigger:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-iconpicker {
    position: fixed;
    z-index: 120;
    width: 320px;
    /* 窄/矮窗口下不越出安全区（与 CustomActionsCard.tsx 的 ICON_PICKER_* 常量对应） */
    max-width: calc(100vw - 16px);
    max-height: min(272px, calc(100vh - 16px));
    overflow-y: auto;
    padding: 12px;
    border: 1px solid ${theme.border.hairline};
    border-radius: ${optSize.cardRadius}px;
    background: ${theme.bg.surface};
    box-shadow: 0 12px 32px -8px ${theme.bg.overlay};
  }

  .opt-iconpicker-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid ${theme.border.hairline};
  }

  .opt-iconpicker-title {
    font-size: ${optSize.rowDescSize}px;
    font-weight: ${uiTypography.fontWeight.semibold};
  }

  .opt-iconpicker-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }

  .opt-iconpicker-note {
    grid-column: 1 / -1;
    padding: 16px 0;
    text-align: center;
    font-size: 11px;
    color: ${theme.text.secondary};
  }

  .opt-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid transparent;
    border-radius: ${optSize.smallRadius}px;
    background: transparent;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .opt-icon-btn:hover {
    background: ${theme.bg.surfaceMuted};
  }

  .opt-icon-btn[aria-pressed='true'] {
    border-color: ${accent};
    background: ${accent}14;
  }

  .opt-icon-btn:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${theme.bg.overlay};
    backdrop-filter: blur(8px);
    animation: opt-fade-in 150ms ease;
  }

  .opt-modal {
    display: flex;
    flex-direction: column;
    width: min(720px, calc(100% - 48px));
    max-height: 80vh;
    border: 1px solid ${theme.border.hairline};
    border-radius: ${optSize.cardRadius}px;
    background: ${theme.bg.surface};
    box-shadow: 0 24px 60px -16px ${theme.bg.overlay};
    animation: opt-slide-up 200ms ease;
  }

  .opt-modal-head {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 16px 20px;
    border-bottom: 1px solid ${theme.border.hairline};
  }

  .opt-modal-search {
    padding: 14px 20px 0;
  }

  .opt-modal-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px 20px;
  }

  .opt-provider-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
    align-content: start;
  }

  .opt-provider-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px;
    border: 1px solid ${controlBorder};
    border-radius: ${optSize.controlRadius}px;
    background: ${theme.bg.surface};
    font-family: inherit;
    text-align: center;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .opt-provider-card:hover {
    border-color: ${accent};
    background: ${accent}0A;
  }

  .opt-provider-card:focus-visible {
    outline: none;
    box-shadow: ${ring};
  }

  .opt-provider-card-name {
    font-size: ${optSize.rowDescSize}px;
    font-weight: ${uiTypography.fontWeight.semibold};
    color: ${theme.text.primary};
    line-height: 1.3;
  }

  .opt-provider-card-meta {
    font-size: 11px;
    color: ${theme.text.secondary};
  }

  .opt-dialog {
    width: min(420px, calc(100% - 48px));
    padding: 24px;
    border: 1px solid ${theme.border.hairline};
    border-radius: ${optSize.cardRadius}px;
    background: ${theme.bg.surface};
    box-shadow: 0 24px 60px -16px ${theme.bg.overlay};
    animation: opt-slide-up 200ms ease;
  }

  .opt-dialog-title {
    margin: 0;
    font-size: ${optSize.sectionTitleSize}px;
    font-weight: ${uiTypography.fontWeight.semibold};
    letter-spacing: ${uiTypography.letterSpacing.tight};
  }

  .opt-dialog-message {
    margin: 8px 0 0;
    font-size: ${optSize.rowTitleSize}px;
    line-height: 1.6;
    color: ${theme.text.secondary};
  }

  .opt-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 22px;
  }

  @keyframes opt-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes opt-slide-up {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ── 响应式：窄窗折叠侧栏 + 收敛控件宽度 ─────────────── */
  @media (max-width: ${optLayout.collapsedBreakpoint}px) {
    .opt-sidebar {
      width: ${optLayout.sidebarCollapsedWidth}px;
    }

    .opt-brand {
      justify-content: center;
      padding: 20px 0 12px;
    }

    .opt-brand-name,
    .opt-brand-version,
    .opt-nav-label,
    .opt-sidebar-foot {
      display: none;
    }

    .opt-nav {
      padding: 4px 8px;
    }

    .opt-nav-item {
      justify-content: center;
      padding: 0;
    }

    .opt-topbar-inner,
    .opt-content {
      padding-left: 20px;
      padding-right: 20px;
    }

    .opt-row-ctl {
      width: 280px;
    }

    .opt-row--narrow .opt-row-ctl {
      width: 200px;
    }

    .opt-list {
      width: 200px;
    }

    .opt-detail {
      padding: 4px 16px 16px;
    }
  }
  `
}

/** select 下拉箭头（内联 SVG，颜色随主题） */
function selectArrow(color: string): string {
  const stroke = encodeURIComponent(color)
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='${stroke}' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`
}
