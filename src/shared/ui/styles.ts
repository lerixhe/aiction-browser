import type { CSSProperties } from "react"

import type { UiTheme } from "@/shared/ui/tokens"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiTypography } from "@/shared/ui/tokens"

const TRANSPARENT_RING = "33"

export function createFocusRing(color: string) {
  return `0 0 0 3px ${color}${TRANSPARENT_RING}`
}

export function createCardStyle(theme: UiTheme): CSSProperties {
  return {
    borderRadius: uiRadius.lg,
    padding: `${uiSpace[20]}px ${uiSpace[24]}px`,
    background: theme.bg.surface,
    boxShadow: uiShadow.md,
    border: `1px solid ${theme.border.hairline}`,
    transition: `box-shadow ${uiMotion.durationNormal} ${uiMotion.easingStandard}, border-color ${uiMotion.durationNormal} ${uiMotion.easingStandard}`
  }
}

export function createInputStyle(theme: UiTheme, focused: boolean): CSSProperties {
  return {
    border: `1px solid ${focused ? theme.accent.primary : theme.border.subtle}`,
    borderRadius: uiRadius.md,
    padding: `${uiSpace[10]}px ${uiSpace[12]}px`,
    fontSize: uiTypography.fontSize.md,
    fontFamily: uiTypography.fontFamily,
    outline: "none",
    color: theme.text.primary,
    background: theme.bg.surfaceMuted,
    boxShadow: focused ? createFocusRing(theme.accent.primary) : "none",
    transition: `border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}, background ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
    width: "100%",
    boxSizing: "border-box"
  }
}

export function createButtonStyle(
  theme: UiTheme,
  variant: "primary" | "secondary" | "danger",
  options?: {
    disabled?: boolean
    pressed?: boolean
    focused?: boolean
    compact?: boolean
  }
): CSSProperties {
  const disabled = options?.disabled ?? false
  const pressed = options?.pressed ?? false
  const focused = options?.focused ?? false
  const compact = options?.compact ?? false

  const palette = {
    primary: {
      background: disabled ? theme.state.disabled : theme.accent.primary,
      color: theme.text.inverse,
      border: "none"
    },
    secondary: {
      background: theme.bg.surface,
      color: theme.text.primary,
      border: `1px solid ${theme.border.default}`
    },
    danger: {
      background: disabled ? theme.state.disabled : theme.state.error,
      color: theme.text.inverse,
      border: "none"
    }
  }[variant]

  return {
    border: palette.border,
    borderRadius: uiRadius.md,
    padding: compact ? `${uiSpace[6]}px ${uiSpace[12]}px` : `${uiSpace[8]}px ${uiSpace[16]}px`,
    background: palette.background,
    color: palette.color,
    fontWeight: variant === "secondary" ? uiTypography.fontWeight.medium : uiTypography.fontWeight.semibold,
    fontSize: compact ? uiTypography.fontSize.sm : uiTypography.fontSize.md,
    fontFamily: uiTypography.fontFamily,
    cursor: disabled ? "not-allowed" : "pointer",
    outline: "none",
    opacity: disabled ? 0.5 : 1,
    transform: pressed ? "scale(0.96)" : "scale(1)",
    boxShadow: focused ? createFocusRing(theme.accent.primary) : "none",
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}, transform 150ms ${uiMotion.easingSpring}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}, opacity ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  }
}

export function createStatusMessageStyle(
  theme: UiTheme,
  tone: "success" | "error" | "info"
): CSSProperties {
  const palette =
    tone === "success"
      ? { color: theme.state.success, background: theme.state.successBg, border: theme.state.success }
      : tone === "error"
        ? { color: theme.state.error, background: theme.state.errorBg, border: theme.state.error }
        : { color: theme.text.secondary, background: theme.bg.surfaceAlt, border: theme.border.default }

  return {
    fontSize: uiTypography.fontSize.sm,
    color: palette.color,
    background: palette.background,
    padding: `${uiSpace[8]}px ${uiSpace[12]}px`,
    borderRadius: uiRadius.md,
    lineHeight: uiTypography.lineHeight.relaxed,
    border: `1px solid ${palette.border}22`
  }
}

export function createFieldLabelStyle(theme: UiTheme): CSSProperties {
  return {
    display: "block",
    fontSize: uiTypography.fontSize.sm,
    fontWeight: uiTypography.fontWeight.medium,
    color: theme.text.secondary,
    marginBottom: uiSpace[6],
    letterSpacing: uiTypography.letterSpacing.normal
  }
}

/**
 * 悬浮面板外框：毛玻璃表面 + 1px 渐变描边 + 分层投影。
 *
 * - 表面：半透明面板色（theme.bg.panel），配合 backdrop-filter 把底下的页面/内容
 *   模糊后透出来，比一整块不透明卡片轻得多；
 * - 描边：用「padding-box 铺表面 + border-box 铺渐变」的两层背景技巧画 1px 渐变边
 *   （避免 ::before + mask-composite 的复杂度与兼容性变数）；
 * - 投影：远距大柔影 + 近距紧影两层，直接拿 uiShadow.lg 单层会显得“浮”不起来。
 */
export function createFloatingPanelStyle(theme: UiTheme, isDark: boolean): CSSProperties {
  const edge = isDark
    ? "linear-gradient(160deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.02) 45%, rgba(96, 165, 250, 0.20))"
    : "linear-gradient(160deg, rgba(255, 255, 255, 0.95), rgba(15, 23, 42, 0.06) 55%, rgba(59, 130, 246, 0.18))"

  return {
    borderRadius: uiRadius.xl,
    border: "1px solid transparent",
    backgroundImage: `linear-gradient(${theme.bg.panel}, ${theme.bg.panel}), ${edge}`,
    backgroundOrigin: "border-box",
    backgroundClip: "padding-box, border-box",
    backdropFilter: "blur(18px) saturate(150%)",
    WebkitBackdropFilter: "blur(18px) saturate(150%)",
    boxShadow: isDark
      ? "0 24px 60px -16px rgba(0, 0, 0, 0.66), 0 4px 14px -6px rgba(0, 0, 0, 0.45)"
      : "0 24px 60px -16px rgba(15, 23, 42, 0.22), 0 4px 14px -6px rgba(15, 23, 42, 0.10)"
  }
}

export function createOverlayStyle(theme: UiTheme): CSSProperties {  return {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: theme.bg.overlay,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)"
  }
}

export function createMarkdownStyles(theme: UiTheme): string {
  return `
    .markdown-content h1 {
      font-size: ${uiTypography.fontSize.xxl}px;
      font-weight: ${uiTypography.fontWeight.bold};
      color: ${theme.text.primary};
      margin-top: ${uiSpace[16]}px;
      margin-bottom: ${uiSpace[8]}px;
      line-height: ${uiTypography.lineHeight.tight};
    }

    .markdown-content h2 {
      font-size: ${uiTypography.fontSize.xl}px;
      font-weight: ${uiTypography.fontWeight.semibold};
      color: ${theme.text.primary};
      margin-top: ${uiSpace[14]}px;
      margin-bottom: ${uiSpace[6]}px;
      line-height: ${uiTypography.lineHeight.tight};
    }

    .markdown-content h3 {
      font-size: ${uiTypography.fontSize.lg}px;
      font-weight: ${uiTypography.fontWeight.semibold};
      color: ${theme.text.primary};
      margin-top: ${uiSpace[12]}px;
      margin-bottom: ${uiSpace[4]}px;
      line-height: ${uiTypography.lineHeight.tight};
    }

    .markdown-content p {
      font-size: ${uiTypography.fontSize.sm}px;
      color: ${theme.text.primary};
      line-height: 1.5;
      margin-bottom: ${uiSpace[8]}px;
    }

    .markdown-content ul,
    .markdown-content ol {
      padding-left: ${uiSpace[20]}px;
      margin-bottom: ${uiSpace[8]}px;
    }

    .markdown-content ul {
      list-style-type: disc;
    }

    .markdown-content ol {
      list-style-type: decimal;
    }

    .markdown-content li {
      font-size: ${uiTypography.fontSize.sm}px;
      color: ${theme.text.primary};
      line-height: 1.5;
      margin-bottom: ${uiSpace[2]}px;
    }

    /* 首尾元素不撑外边界：正文落在内容块 / 气泡里时，上下留白由容器统一给，
       否则首段顶部与末段底部会多出一层 margin，块内垂直居中感会偏 */
    .markdown-content > :first-child {
      margin-top: 0;
    }

    .markdown-content > :last-child {
      margin-bottom: 0;
    }

    /* 行内代码：用主色淡底（把「术语 / 代码」从正文里托出来，与强调色同一族） */
    .markdown-content code {
      font-family: ${uiTypography.fontFamilyMono};
      font-size: ${uiTypography.fontSize.sm}px;
      background: ${theme.accent.primary}1A;
      padding: ${uiSpace[2]}px ${uiSpace[4]}px;
      border-radius: ${uiRadius.sm}px;
      color: ${theme.text.primary};
    }

    /* 代码块：底色用 surface（比所在容器低/高一档，行内代码的主色淡底只服务于行内），
       配上描边——聊天态气泡底就是 surfaceMuted，两套 token 不同才能在气泡里也看得清块；
       行高放宽一档，多行代码才有块感 */
    .markdown-content pre {
      margin-bottom: ${uiSpace[8]}px;
      border-radius: ${uiRadius.md}px;
      background: ${theme.bg.surface};
      border: 1px solid ${theme.border.subtle};
      overflow-x: auto;
    }

    .markdown-content pre code {
      display: block;
      padding: ${uiSpace[12]}px;
      background: transparent;
      line-height: 1.5;
    }

    .markdown-content blockquote {
      border-left: 3px solid ${theme.accent.primary};
      padding-left: ${uiSpace[12]}px;
      margin-left: 0;
      margin-bottom: ${uiSpace[8]}px;
      color: ${theme.text.secondary};
    }

    .markdown-content a {
      color: ${theme.accent.primary};
      text-decoration: underline;
      text-decoration-color: ${theme.accent.primary}40;
    }

    .markdown-content strong {
      font-weight: ${uiTypography.fontWeight.semibold};
    }

    .markdown-content hr {
      border: none;
      border-top: 1px solid ${theme.border.default};
      margin: ${uiSpace[12]}px 0;
    }

    .markdown-content table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${uiTypography.fontSize.sm}px;
      margin-bottom: ${uiSpace[8]}px;
    }

    .markdown-content th {
      padding: ${uiSpace[6]}px ${uiSpace[8]}px;
      border-bottom: 2px solid ${theme.border.default};
      text-align: left;
      font-weight: ${uiTypography.fontWeight.semibold};
      color: ${theme.text.primary};
    }

    .markdown-content td {
      padding: ${uiSpace[6]}px ${uiSpace[8]}px;
      border-bottom: 1px solid ${theme.border.subtle};
      color: ${theme.text.primary};
    }
  `
}
