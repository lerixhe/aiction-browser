import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { MarkdownRenderer } from "@/shared/ui/markdown"
import { useUiTheme, useUiThemeName } from "@/shared/ui/theme"
import {
  clampPanelDragPos,
  EDGE_INSET,
  fitPanelInViewport,
  placeNearAnchor,
  type AnchorRect,
  type PanelPos
} from "@/entrypoints/content/components/floating"
import { uiLayer, uiMotion, uiRadius, uiShadow, uiSpace, uiTypography } from "@/shared/ui/tokens"
import { createFocusRing, createFloatingPanelStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { copyText } from "@/shared/clipboard"
import { trackEvent, type AnalyticsSource } from "@/shared/analytics"
import { useI18n } from "@/shared/i18n/context"
import { toSingleLine } from "@/entrypoints/content/utils/reasoningText"
import type { ChatMessage, ChatRequestState } from "@/shared/types"

/** 卡片态宽度（新触发时的默认形态，内容直铺、窄一些、贴选区） */
const CARD_WIDTH = 480
/** 聊天态宽度：比卡片态更宽，展开时以面板中心为轴向两侧扩张 */
const CHAT_WIDTH = 640
/** 面板最小宽度（视口过窄时的下限，避免被压成窄条） */
const PANEL_MIN_WIDTH = 320
/** 对话窗理想高度（超高视口按可用高度收缩） */
const PANEL_MAX_HEIGHT = 640
/** 卡片态落位时的假设高度（实际高度随内容自适应，仅参与翻转/钳制计算） */
const CARD_ASSUME_HEIGHT = 170
/** 卡片 ↔ 聊天形态切换的过渡时长（宽度/高度/落位同步过渡） */
const MORPH_DURATION = 260
/** 输入区（composer）内 textarea 的高度区间：单行起步，超过上限后内部滚动 */
const COMPOSER_INPUT_MIN_HEIGHT = 24
const COMPOSER_INPUT_MAX_HEIGHT = 132
/** 圆形发送按钮直径 */
const SEND_BUTTON_SIZE = 28
/** 复制成功反馈的驻留时长 */
const COPY_FEEDBACK_MS = 1600
/**
 * 防抖命中时的高亮脉冲时长。
 * 命中不再静默吞掉点击：给已有卡片描一圈主色脉冲，明确告诉用户「这张已经有了」。
 * （不改变卡片位置：位置是用户的，只有用户自己拖或形态切换才会动）
 */
const REVEAL_HIGHLIGHT_MS = 1100

/**
 * 头部控件统一样式族：icon-only 呈正圆、带文案呈胶囊，几何与交互完全一致。
 * 形态切换 / 钉住 / 关闭三个按钮共用，避免各自手写样式而逐渐走形。
 *
 * 视觉：芯片式——常态只有一圈 hairline 描边（不填底，三个按钮排开也不会把头部压沉），
 * hover 才落一档淡底，active（钉住）主色淡底 + 描边染主色。
 */
function headerControlStyle(
  theme: ReturnType<typeof useUiTheme>,
  {
    withLabel = false,
    hovered = false,
    focused = false,
    active = false
  }: { withLabel?: boolean; hovered?: boolean; focused?: boolean; active?: boolean } = {}
): React.CSSProperties {
  const size = 24
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: uiSpace[4],
    boxSizing: "border-box",
    height: size,
    minWidth: size,
    padding: withLabel ? `0 ${uiSpace[8]}px` : 0,
    borderRadius: uiRadius.pill,
    // 芯片式：常态一圈 hairline 描边 + 极淡底（不填实底，三个按钮排开也不会把头部压沉），
    // hover 才落一档实底，active（钉住）主色淡底 + 描边染主色
    border: `1px solid ${active ? `${theme.accent.primary}40` : theme.border.hairline}`,
    background: active
      ? `${theme.accent.primary}1F`
      : hovered
        ? theme.bg.surfaceMuted
        : `${theme.bg.surfaceMuted}80`,
    color: theme.text.secondary,
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: uiTypography.fontFamily,
    fontSize: uiTypography.fontSize.xs,
    lineHeight: 1,
    whiteSpace: "nowrap",
    boxShadow: focused ? createFocusRing(theme.accent.primary) : "none",
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  }
}

/**
 * 输入区（composer）容器：单一描边同时包住输入框与发送按钮，
 * 聚焦时描边转主色并叠一圈柔光，取代原先「输入框 + 并排按钮」两个独立控件的观感。
 */
function composerStyle(
  theme: ReturnType<typeof useUiTheme>,
  { focused }: { focused: boolean }
): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-end",
    gap: uiSpace[6],
    padding: `${uiSpace[6]}px ${uiSpace[6]}px ${uiSpace[6]}px ${uiSpace[12]}px`,
    borderRadius: uiRadius.xl,
    border: `1px solid ${focused ? theme.accent.primary : theme.border.default}`,
    background: theme.bg.surfaceMuted,
    boxShadow: focused ? `0 0 0 3px ${theme.accent.primary}1A` : "none",
    transition: `border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  }
}

/**
 * 圆形发送按钮：空输入时静默（无底 + 淡描边箭头），有内容时点亮主色；
 * 生成中切换为停止按钮（中性底 + 实心方块），与「发送」在语义上区分开。
 */
function composerSendButtonStyle(
  theme: ReturnType<typeof useUiTheme>,
  {
    stop = false,
    active = false,
    hovered = false,
    focused = false,
    pressed = false
  }: {
    stop?: boolean
    active?: boolean
    hovered?: boolean
    focused?: boolean
    pressed?: boolean
  } = {}
): React.CSSProperties {
  const background = stop
    ? theme.bg.surface
    : active
      ? hovered
        ? theme.accent.primaryHover
        : theme.accent.primary
      : "transparent"

  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: SEND_BUTTON_SIZE,
    height: SEND_BUTTON_SIZE,
    flexShrink: 0,
    padding: 0,
    boxSizing: "border-box",
    // 停止态：输入槽底色上的一枚反色圆（靠描边定型，hover 加深描边）
    border: stop ? `1px solid ${hovered ? theme.text.secondary : theme.border.default}` : "none",
    borderRadius: uiRadius.pill,
    background,
    cursor: stop || active ? "pointer" : "not-allowed",
    opacity: stop || active ? 1 : 0.55,
    transform: pressed && (stop || active) ? "scale(0.88)" : "scale(1)",
    boxShadow: focused ? createFocusRing(theme.accent.primary) : "none",
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, opacity ${uiMotion.durationFast} ${uiMotion.easingStandard}, transform 150ms ${uiMotion.easingSpring}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  }
}

/** 发送图标（向上箭头）：圆形按钮的常态 */
function SendArrowIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 13V3.4M8 3.4L3.9 7.5M8 3.4l4.1 4.1"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 停止图标（实心圆角方块）：生成中替代发送箭头 */
function StopIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.8" fill={color} />
    </svg>
  )
}

function CloseIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12M12 4L4 12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

/** 复制图标（双页）：助手消息操作条 */
function CopyIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.6" y="2.6" width="7.8" height="9.4" rx="2" stroke={color} strokeWidth={1.2} />
      <path
        d="M10.4 13.4H4.6a2 2 0 0 1-2-2V6.2"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 对勾图标：复制完成的瞬时反馈 */
function CheckIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.4 8.6l3 3 6.2-7"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 模型图标（芯片造型）：替代原「模型：xxx」文本胶囊，悬停时 title 提示完整模型名 */
function ModelIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="7"
        rx="1.5"
        stroke={color}
        strokeWidth={1.2}
      />
      <rect x="6.75" y="6.75" width="2.5" height="2.5" rx="0.75" fill={color} opacity={0.55} />
      <path
        d="M6 2.2v2.3M10 2.2v2.3M6 11.5v2.3M10 11.5v2.3M2.2 6h2.3M2.2 10h2.3M11.5 6h2.3M11.5 10h2.3"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 图钉图标：pinned 为实心（副色高亮），unpinned 为描边 */
function PinIcon({ size, color, pinned }: { size: number; color: string; pinned: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ transform: pinned ? "rotate(45deg)" : "rotate(0deg)", transition: `transform ${uiMotion.durationFast} ${uiMotion.easingStandard}` }}
    >
      <path
        d="M6.2 2.5h3.6v3.7l1.7 1.8H4.5l1.7-1.8z"
        fill={pinned ? color : "none"}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path d="M8 8v5.5" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  )
}

/** 收起图标（聊天态 → 卡片态）：向下人字形 */function CollapseIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6.5L8 10.5L12 6.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 展开图标（卡片态 → 聊天态的「追问」按钮）：对话气泡 */
function ExpandChatIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="10" height="8" rx="2" stroke={color} strokeWidth="1.3" />
      <path d="M6 11v2.6L8.8 11" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

/** 生成中的跳动圆点（用于消息区底部「AI 正在生成中…」提示） */
function ThinkingDot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        animation: "thinking-pulse 1s ease-in-out infinite",
        display: "inline-block"
      }}
      aria-hidden="true"
    />
  )
}

/**
 * 思考图标（四角星）：常态静止且低对比，仅思考中播呼吸动画（缩放 + 微旋 + 明暗），
 * 内核小点错相位心跳，形成「星光」质感。状态完全由动画表达，不再额外占一个状态点。
 */
function ThinkingSparkIcon({ size, color, active }: { size: number; color: string; active: boolean }) {
  const animating = active && !prefersReducedMotion()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        transformOrigin: "center",
        opacity: active ? 1 : 0.75,
        animation: animating ? "thinking-spark 2s ease-in-out infinite" : "none",
        transition: `opacity ${uiMotion.durationNormal} ${uiMotion.easingStandard}`
      }}>
      <path
        d="M8 1.8L9.7 6.3L14.2 8L9.7 9.7L8 14.2L6.3 9.7L1.8 8L6.3 6.3Z"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <circle
        cx="8"
        cy="8"
        r="1.8"
        fill={color}
        style={{
          transformOrigin: "center",
          transformBox: "fill-box",
          animation: animating ? "thinking-core 1.4s ease-in-out infinite" : "none"
        }}
      />
    </svg>
  )
}

/** 思考行高度（单行） */
const THINKING_ROW_HEIGHT = 26
/** 原始思考文本参与单行化的尾部窗口：先截断再纯化，避免长思考每次重跑全量正则 */
const THINKING_RAW_WINDOW = 800
/** 单行化后保留的尾部字符数：思考可达上万字，只留尾部避免滚动节点过宽掉帧 */
const THINKING_TEXT_WINDOW = 600
/** 跑马灯追随系数：每帧追剩余的 16%，越大越紧跟流式输出 */
const THINKING_FOLLOW = 0.16
/** 跑马灯每帧最大位移（px）：限速，避免长思考时文本糊成一片 */
const THINKING_MAX_STEP = 28
/** 滚动视口左右渐隐：新字自右侧渐入、旧字自左侧渐出，形成「穿行而过」的观感 */
const THINKING_FADE_MASK =
  "linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 22px), transparent 100%)"
/** 思考结束后定格在尾部：右侧不再渐隐，否则末几字会被淡掉 */
const THINKING_FADE_MASK_STATIC = "linear-gradient(to right, transparent 0, #000 14px, #000 100%)"

/** 是否要求减弱动效（系统设置开启时改为跳变式贴尾，不做平滑追随） */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** 聊天态高度：理想高度与视口可用高度取小（落位计算与渲染共用同一套算式） */
function chatPanelHeight(): number {
  return Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_INSET * 2)
}

/**
 * 思考行：左侧「>」展开箭头 +「思考：」标签 + 单行滚动文本。
 *
 * 流式思考时文本向左流动（每帧把视口贴到文本末尾，新内容从右侧渐入），
 * 思考结束后平滑滑回开头、停成静态单行；点击整行展开完整的多行思考内容。
 * 标签与滚动文本分列：标签固定不滚动，只有文本参与滚动。
 */
function ThinkingBlock({
  reasoning,
  isStreaming,
  theme,
  inset = 0
}: {
  reasoning: string
  isStreaming: boolean
  theme: ReturnType<typeof useUiTheme>
  /** 展开态左右内缩量：与所在容器里正文的左右内边距对齐（收起态跨满整块，分隔线贯通） */
  inset?: number
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const viewportRef = useRef<HTMLSpanElement | null>(null)
  const trackRef = useRef<HTMLSpanElement | null>(null)
  /** 展开的完整思考（条件挂载，收起时不渲染长 Markdown） */
  const fullRef = useRef<HTMLDivElement | null>(null)
  /** 当前滚动偏移：rAF 循环内累积，不进 state（每帧 setState 会拖垮流式渲染） */
  const offsetRef = useRef(0)

  /** 单行纯文本（只处理尾部窗口，思考全文仅展开态才渲染） */
  const plainText = useMemo(
    () => toSingleLine(reasoning.slice(-THINKING_RAW_WINDOW)).slice(-THINKING_TEXT_WINDOW),
    [reasoning]
  )

  // 流式中：rAF 逐帧追随文本末尾（chunk 是 32ms 节流到达的，这里把跳变抹成连续位移）
  useEffect(() => {
    // 展开态不渲染单行视口，无需跑循环（收起时由下方 layout effect 直接贴到尾端）
    if (!isStreaming || expanded) return
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return
    const reduce = prefersReducedMotion()
    track.style.transition = "none"
    let raf = 0
    const tick = () => {
      // 目标 = 文本末尾贴住视口右侧；文本不足一屏时为 0（不滚动，左对齐）
      const target = Math.max(0, track.offsetWidth - viewport.clientWidth)
      if (target > offsetRef.current) {
        // 只前进、不后退：文本窗口滑动与空白折叠会让量出的宽度小幅回缩，
        // 若跟着回退，视觉上就是文字「倒着走」
        const diff = target - offsetRef.current
        const step = Math.min(THINKING_MAX_STEP, Math.max(0.5, diff * (reduce ? 1 : THINKING_FOLLOW)))
        offsetRef.current = Math.min(target, offsetRef.current + step)
        track.style.transform = `translateX(${-offsetRef.current}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isStreaming, expanded])

  // 视口挂载 / 思考结束：无动画对齐到文本末尾并就此定格
  // （结束后不做「滑回开头」：长距离反向滑动看起来就是倒带）
  useLayoutEffect(() => {
    if (expanded) return
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return
    const target = Math.max(0, track.offsetWidth - viewport.clientWidth)
    offsetRef.current = target
    track.style.transition = "none"
    track.style.transform = `translateX(${-target}px)`
  }, [expanded, isStreaming])

  // 展开：内容条件挂载（收起时不渲染长 Markdown），故用 max-height 自 0 过渡，
  // 让单行框「向下撑开」而不是弹出一块内容
  useLayoutEffect(() => {
    if (!expanded) return
    const el = fullRef.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.style.maxHeight = "none"
      el.style.opacity = "1"
      return
    }
    const target = el.scrollHeight
    el.style.maxHeight = "0px"
    el.style.opacity = "0"
    void el.offsetHeight // 先把 0 高度落到样式，保证过渡有起点
    el.style.maxHeight = `${target}px`
    el.style.opacity = "1"
    // 过渡结束即解除钳制：流式期间内容继续增长也不会被裁
    const handleEnd = (event: TransitionEvent) => {
      if (event.propertyName !== "max-height") return
      el.style.maxHeight = "none"
      el.removeEventListener("transitionend", handleEnd)
    }
    el.addEventListener("transitionend", handleEnd)
    return () => el.removeEventListener("transitionend", handleEnd)
  }, [expanded])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // 展开后画一块思考色卡片（紫调淡底 + 同色描边：与「回答」在语义上区分开）
        border: expanded ? `1px solid ${theme.reasoning.border}` : undefined,
        borderBottom: expanded ? undefined : `1px solid ${theme.border.subtle}`,
        borderRadius: expanded ? uiRadius.md : 0,
        // 收起态透明，hover / 展开时才落思考色淡底
        background: expanded || hovered ? theme.reasoning.surface : "transparent",
        // 展开态左右内缩到与正文同一栏，避免展开后的思考框比下方正文宽出一截
        marginLeft: expanded ? inset : 0,
        marginRight: expanded ? inset : 0,
        marginBottom: expanded ? uiSpace[8] : 0,
        fontSize: uiTypography.fontSize.sm,
        transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, box-shadow ${uiMotion.durationFast} ${uiMotion.easingStandard}`
      }}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        aria-expanded={expanded}
        aria-label={t("chat.thinkingProcess")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: uiSpace[6],
          width: "100%",
          height: THINKING_ROW_HEIGHT,
          padding: `0 ${uiSpace[12]}px`,
          border: "none",
          // 底色由外层容器统一给（整块高亮），按钮自身透明
          background: "transparent",
          color: theme.reasoning.text,
          cursor: "pointer",
          fontFamily: uiTypography.fontFamily,
          fontSize: uiTypography.fontSize.sm,
          textAlign: "left",
          outline: focused ? `2px solid ${theme.brand.primary}` : "none",
          outlineOffset: -2
        }}>
        {/* 展开箭头：整行均可点击展开，箭头仅作提示（展开时旋转 90°） */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: `transform ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
            flexShrink: 0
          }}>
          <path
            d="M3.5 1.5L7 5L3.5 8.5"
            stroke={theme.reasoning.text}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {/* 常态思考图标：思考中靠动画指示状态（不占额外宽度，不会让视口宽度抖动） */}
        <ThinkingSparkIcon size={13} color={theme.reasoning.accent} active={isStreaming} />
        {/* 标签：「思考」二字常驻（展开态也在），冒号只服务于其后的单行内容 */}
        <span style={{ flexShrink: 0, fontWeight: uiTypography.fontWeight.medium }}>
          {t("chat.thinkingLabel")}
          {expanded ? null : t("chat.thinkingColon")}
        </span>
        {/* 单行跑马灯：展开后停下并隐藏（冒号与之同时让位给完整思考） */}
        {expanded ? null : (
          <span
            ref={viewportRef}
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              position: "relative",
              // 流式中右侧渐隐（新字渐入）；结束后取消右侧渐隐（定格在尾部）
              maskImage: isStreaming ? THINKING_FADE_MASK : THINKING_FADE_MASK_STATIC,
              WebkitMaskImage: isStreaming ? THINKING_FADE_MASK : THINKING_FADE_MASK_STATIC
            }}>
            {/* 滚动文本：高频变化，不播报（读屏只读展开后的完整思考） */}
            <span
              ref={trackRef}
              aria-hidden="true"
              style={{
                display: "inline-block",
                whiteSpace: "nowrap",
                willChange: "transform",
                opacity: isStreaming ? 0.85 : 0.55,
                transition: `opacity ${uiMotion.durationNormal} ${uiMotion.easingStandard}`
              }}>
              {plainText}
            </span>
          </span>
        )}
      </button>
      {expanded ? (
        <div
          ref={fullRef}
          style={{
            overflow: "hidden",
            transition: `max-height ${uiMotion.durationExpanded} ${uiMotion.easingDecelerate}, opacity ${uiMotion.durationNormal} ${uiMotion.easingStandard}`
          }}>
          {/* 内容与头部同一内边距，无竖线无额外缩进：是同一个框被撑高，而非内嵌引用块 */}
          <div
            style={{
              padding: `0 ${uiSpace[12]}px ${uiSpace[10]}px`,
              color: theme.text.secondary,
              opacity: 0.85
            }}>
            <MarkdownRenderer content={reasoning} color={theme.text.secondary} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface MessageBubbleProps {
  item: ChatMessage
  isStreaming: boolean
  theme: ReturnType<typeof useUiTheme>
  /** 呈现形态：chat = 常规气泡／card = 卡片态（助手回答包一层淡底内容块） */
  variant?: "chat" | "card"
}

const MessageBubble = memo(function MessageBubble({
  item,
  isStreaming,
  theme,
  variant = "chat"
}: MessageBubbleProps) {
  const { t } = useI18n()
  const isCard = variant === "card"
  const isUser = item.role === "user"
  /** 消息块悬停：复制按钮在此刻浮出（同时影响按钮可点击性） */
  const [hovered, setHovered] = useState(false)
  const [copyFocused, setCopyFocused] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    },
    []
  )

  const handleCopy = useCallback(async () => {
    if (!(await copyText(item.content))) return
    setCopied(true)
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null
      setCopied(false)
    }, COPY_FEEDBACK_MS)
  }, [item.content])

  // 复制按钮仅给助手回答（生成中不显示：内容还在变，复制到的是半截）
  const showCopy = !isUser && item.content.trim().length > 0 && !isStreaming
  /** 常驻但低对比（发现性优于 hover 才浮出），hover / 聚焦时抬亮，复制完成转成功色 */
  const copyColor = copied
    ? theme.state.success
    : hovered || copyFocused
      ? theme.text.primary
      : theme.text.secondary

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        position: "relative",
        marginLeft: isUser ? "auto" : undefined,
        maxWidth: isCard ? "none" : "85%",
        marginBottom: isCard ? uiSpace[12] : uiSpace[8],
        // 聊天气泡：用户侧右上收一个小圆角（对话方向感）；
        // 助手侧卡片态是一个「内容块」（与圆角、描边同族的块），聊天态是常规气泡
        borderRadius: isCard ? (isUser ? 0 : uiRadius.lg) : isUser ? "12px 4px 12px 12px" : uiRadius.xl,
        lineHeight: 1.45,
        fontSize: uiTypography.fontSize.sm,
        whiteSpace: isUser ? "pre-wrap" : "normal",
        wordBreak: "break-word",
        // 卡片态：助手回答落一层淡底内容块，把正文从面板底上浮起一层（不再是直接铺在玻璃上）
        background: isUser
          ? theme.accent.primary
          : isCard
            ? `${theme.bg.surfaceMuted}80`
            : theme.bg.surfaceMuted,
        color: isUser ? theme.text.inverse : theme.text.primary,
        border: isUser
          ? "none"
          : isCard
            ? `1px solid ${theme.border.hairline}`
            : `0.5px solid ${theme.border.hairline}`,
        boxShadow: isCard || isUser ? "none" : uiShadow.sm,
        animation: `message-enter 300ms ${uiMotion.easingDecelerate} forwards`,
        overflow: "hidden"
      }}>
      {item.role === "assistant" && item.reasoning_content ? (
        <ThinkingBlock
          reasoning={item.reasoning_content}
          isStreaming={isStreaming && !item.content}
          theme={theme}
          inset={isCard ? uiSpace[12] : uiSpace[10]}
        />
      ) : null}
      {item.content ? (
        <div
          style={{
            // 卡片态自己就是内容块，内边距由块身给（思考行贴着块顶，正文从中段往下铺）
            padding: isCard
              ? `${uiSpace[10]}px ${uiSpace[12]}px`
              : `${uiSpace[8]}px ${uiSpace[10]}px`,
            overflowWrap: "break-word",
            wordBreak: "break-word"
          }}>
          {item.role === "assistant" ? (
            <MarkdownRenderer content={item.content} />
          ) : (
            item.content
          )}
        </div>
      ) : null}
      {showCopy ? (
        /* 操作行：常驻在内容块底部右侧（不再盖在正文上浮出），低对比静默、hover 抬亮 */
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: isCard
              ? `0 ${uiSpace[12]}px ${uiSpace[8]}px`
              : `0 ${uiSpace[10]}px ${uiSpace[8]}px`
          }}>
          <button
            type="button"
            onClick={handleCopy}
            onFocus={() => setCopyFocused(true)}
            onBlur={() => setCopyFocused(false)}
            aria-label={t("chat.copyMessage")}
            title={t("chat.copyMessage")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: uiSpace[4],
              height: 20,
              padding: `0 ${uiSpace[6]}px`,
              // 往回缩半个内边距：按钮内的文字与上方正文的右边线对齐
              marginRight: -uiSpace[6],
              borderRadius: uiRadius.sm,
              border: "none",
              background: hovered ? theme.bg.surfaceMuted : "transparent",
              color: copyColor,
              fontFamily: uiTypography.fontFamily,
              fontSize: uiTypography.fontSize.xs,
              lineHeight: 1,
              cursor: "pointer",
              opacity: copied || hovered || copyFocused ? 1 : 0.7,
              boxShadow: copyFocused ? createFocusRing(theme.accent.primary) : "none",
              transition: `opacity ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}, background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
            }}>
            {copied ? (
              <CheckIcon size={11} color={copyColor} />
            ) : (
              <CopyIcon size={11} color={copyColor} />
            )}
            {copied ? t("chat.copied") : t("chat.copyShort")}
          </button>
        </div>
      ) : null}
    </div>
  )
})

interface Props {
  /** 对话窗是否可见（触发动作时自动打开） */
  open: boolean
  /** 锚定矩形（工具栏落位，文档坐标）；null 时回退到视口上方居中 */
  anchor: AnchorRect | null
  /** 触发时的选区文本快照（目前仅用于空状态文案区分） */
  capturedText: string
  messages: ChatMessage[]
  requestState: ChatRequestState["status"]
  modelName?: string
  /** 触发来源（web 网页 / pdf 阅读器）：仅作为埋点维度 */
  source: AnalyticsSource
  /** 钉住状态由父级（ChatSession/App）持有：钉住后点击窗外不关闭，且父级可据此保护会话不被新触发替换 */
  pinned: boolean
  onPinChange: (pinned: boolean) => void
  onSend: (input: string) => void
  onStop: () => void
  /** 关闭对话窗（清空本轮对话） */
  onClose: () => void
  /**
   * 递增信号：变化时闪一圈主色脉冲（父级防抖命中时置位），不改变位置。
   * 初值 0 表示「还没命中过」，挂载时不会触发。
   */
  revealNonce?: number
}

/**
 * 悬浮对话窗：触发 AI 动作后自动浮现在划词工具栏下方（下方放不下自动翻转到上方）。
 * 自带关闭交互（Esc / 点击窗外 / 头部 ×）；点击窗外不包含扩展 UI 内部的点击。
 */
export default function ChatPanel({
  open,
  anchor,
  capturedText,
  messages,
  requestState,
  modelName,
  source,
  pinned,
  onPinChange,
  onSend,
  onStop,
  onClose,
  revealNonce = 0
}: Props) {
  const theme = useUiTheme()
  const themeName = useUiThemeName()
  const { t } = useI18n()
  /** 面板形态：card = 卡片态（仅 AI 生成内容）/ chat = 完整聊天态（消息 + 输入框）。新会话默认卡片态 */
  const [mode, setMode] = useState<"card" | "chat">("card")
  /** 形态切换过渡中（仅此时开启 width/height/left/top 过渡，拖拽仍要跟手） */
  const [morphing, setMorphing] = useState(false)
  /** 视口宽度：聊天态更宽，视口过窄时宽度随之收敛 */
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? CARD_WIDTH : window.innerWidth
  )
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [sendPressed, setSendPressed] = useState(false)
  /** 命中脉冲覆盖层：常驻 DOM，靠显式重启动画，不依赖节点重建 / state 布尔切换 */
  const revealPulseRef = useRef<HTMLDivElement | null>(null)
  /** 钉住状态（受控 props）：钉住后点击窗外不再关闭对话窗（Esc / × 仍可关闭） */
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned
  /** 拖拽进行中（头部 cursor 态） */
  const [dragging, setDragging] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  /** 收起路径回调走 ref，document 级监听不随回调重建 */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // ---------- 落位：工具栏下方，放不下翻转上方，最后收敛回视口 ----------
  // 用户拖拽头部后位置改由用户接管：此后不再按锚点重算，仅在 resize 时收敛回视口

  const [pos, setPos] = useState<PanelPos | null>(null)
  /** 形态切换过渡的收尾定时器（卸载时清理） */
  const morphTimerRef = useRef<number | null>(null)
  /**
   * 当前形态下的面板宽度：卡片态窄、聊天态宽（展开时视觉上是「以中心为轴」向两侧扩张）。
   * 上限受视口约束，下限 PANEL_MIN_WIDTH，避免窄视口下面板溢到屏幕外。
   */
  const panelWidth = useMemo(() => {
    const target = mode === "chat" ? CHAT_WIDTH : CARD_WIDTH
    return Math.min(target, Math.max(viewportWidth - EDGE_INSET * 2, PANEL_MIN_WIDTH))
  }, [mode, viewportWidth])
  /** 用户是否已拖拽过位置（拖拽后位置归用户管） */
  const draggedRef = useRef(false)
  /**
   * 面板**实际渲染尺寸**（ResizeObserver 持续更新）。
   * 卡片态高度随内容自适应、聊天态才接近 PANEL_MAX_HEIGHT，
   * 钳制一律用实测值，否则矮卡片会被按展开态高度硬顶在视口上部、拖不到下方。
   */
  const panelSizeRef = useRef({ width: CARD_WIDTH, height: CARD_ASSUME_HEIGHT })

  const computePosition = useCallback(() => {
    if (!open) return
    // 用户拖拽过后位置归用户接管，resize 只需要防止被拖丢，不再按锚点重算。
    // 注意这里仍用软边界：若改成「整块收回视口」，开合 DevTools 之类的
    // 视口变化会把用户拖到视口边缘的位置硬拽回来，观感就是“拖不出去”。
    if (draggedRef.current) {
      const { width, height } = panelSizeRef.current
      setPos((prev) => (prev ? clampPanelDragPos(prev, width, height) : prev))
      return
    }
    const isCard = mode === "card"
    // 卡片态实际高度随内容自适应，翻转/钳制计算用较小的假设高度，避免误判为「下方放不下」而错误翻转到上方
    // 注：翻转/落位只按当前形态的目标尺寸算，形态切换时 left/top 的位移一并由过渡动画补上
    const height = isCard ? CARD_ASSUME_HEIGHT : chatPanelHeight()
    const rect =
      anchor ??
      ({ x: window.scrollX + window.innerWidth / 2, y: window.scrollY + 80, width: 0, height: 0 } satisfies AnchorRect)
    const placed = placeNearAnchor(rect, panelWidth, height)
    setPos({ left: placed.left, top: placed.top })
  }, [open, anchor, mode, panelWidth])

  useLayoutEffect(() => {
    computePosition()
  }, [computePosition])

  // 视口尺寸变化时重新定位（未拖拽时贴边、已拖拽时只防拖丢），并更新宽度上限
  useEffect(() => {
    if (!open) return
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
      computePosition()
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [open, computePosition])

  // 卸载时清掉形态过渡的收尾定时器
  useEffect(
    () => () => {
      if (morphTimerRef.current !== null) window.clearTimeout(morphTimerRef.current)
    },
    []
  )

  // ---------- 拖拽：按住头部空白处拖动整个对话窗（头部按钮不受影响） ----------

  const handleHeaderPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      // 头部上的功能按钮（模型图标 / 钉子 / 关闭）不触发拖拽
      if ((event.target as HTMLElement).closest("button")) return
      event.preventDefault()
      // 拖拽优先于形态过渡：过拖时立刻结束过渡，否则位移会带一段滞后的 easing
      setMorphing(false)
      if (morphTimerRef.current !== null) {
        window.clearTimeout(morphTimerRef.current)
        morphTimerRef.current = null
      }
      if (!pos) return
      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: pos.left,
        top: pos.top
      }
      draggedRef.current = true
      setDragging(true)

      const handleMove = (e: PointerEvent) => {
        const { width, height } = panelSizeRef.current
        setPos(
          clampPanelDragPos(
            {
              left: start.left + (e.clientX - start.pointerX),
              top: start.top + (e.clientY - start.pointerY)
            },
            width,
            height
          )
        )
      }
      const handleUp = () => {
        setDragging(false)
        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", handleUp)
        window.removeEventListener("pointercancel", handleUp)
      }
      window.addEventListener("pointermove", handleMove)
      window.addEventListener("pointerup", handleUp)
      window.addEventListener("pointercancel", handleUp)
    },
    [pos]
  )

  // ---------- 面板自身尺寸变化：卡片态内容增长 / 形态切换后收敛回视口 ----------

  useEffect(() => {
    if (!open) return
    const el = panelRef.current
    if (!el) return

    const measure = () => {
      const next = { width: el.offsetWidth, height: el.offsetHeight }
      const prev = panelSizeRef.current
      if (next.width === prev.width && next.height === prev.height) return
      panelSizeRef.current = next
      // 尺寸变了（流式内容增长 / 卡片↔聊天态切换）。
      // 位置已归用户接管时不动它（尊重用户意图，用户自己能拖回来）；
      // 但形态切换会改宽度，这里以中心为轴补一半差值，避免聊天态只朝右侧单向变宽。
      if (draggedRef.current) {
        const widthDelta = prev.width - next.width
        if (widthDelta !== 0) {
          setPos((current) =>
            current
              ? clampPanelDragPos(
                  { left: current.left + widthDelta / 2, top: current.top },
                  next.width,
                  next.height
                )
              : current
          )
        }
        return
      }
      // 自动落位的面板长高后会顶出视口，收敛回来避免内容看不见。
      setPos((current) => (current ? fitPanelInViewport(current, next.width, next.height) : current))
    }

    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open])

  // ---------- 防抖命中的反馈：父级 revealNonce 递增即闪一圈主色（不动位置） ----------

  useEffect(() => {
    if (revealNonce === 0) return
    const el = revealPulseRef.current
    if (!el) return
    // 显式重启动画：先摘掉 animation + 强制回流，再重新赋上。
    // 不能依赖「改 key 让 React 重建节点」或「state 布尔翻转」：
    // 重复赋同一个 animation 值浏览器不会重播，而 state 已是 true 时再次置 true 不触发渲染，
    // 连锁点时会变成「有时闪一下、有时完全不闪」。
    el.style.animation = "none"
    void el.offsetWidth
    el.style.animation = `panel-reveal ${REVEAL_HIGHLIGHT_MS}ms ${uiMotion.easingStandard}`
  }, [revealNonce])

  // ---------- 关闭交互：点击窗外（未钉住时）----------
  // 注意：Esc 关闭已上移到 useChatSessions 统一监听（多实例并存时避免一次按键连环关关闭所有面板）

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      // 钉住后点击窗外不关闭（Esc / × 仍可关闭）
      if (pinnedRef.current) return
      const path = event.composedPath()
      if (panelRef.current && path.includes(panelRef.current)) return
      // 点击扩展 UI 内部（划词工具栏 / 朗读控件等）不关闭对话窗：
      // 面板开着时工具栏也保持可见，需要支持从工具栏连续触发其他动作
      const insideExtension = path.some(
        (el) => el instanceof Element && (el as Element).closest('[data-aiction-root="true"]') != null
      )
      if (insideExtension) return
      onCloseRef.current()
    }

    document.addEventListener("mousedown", handlePointerDown, true)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true)
    }
  }, [open])

  const isStreaming = requestState === "streaming"
  const sendDisabled = isStreaming || !input.trim()
  const hasCapturedText = capturedText.length > 0
  /** 卡片态只呈现 AI 生成的内容（隐藏用户气泡与输入框）；聊天态保持全部消息 */
  const visibleMessages = mode === "card" ? messages.filter((item) => item.role === "assistant") : messages

  /**
   * 头部形态切换按钮（单按钮两态）：卡片态 = 追问（展开为聊天态），聊天态 = 收起。
   * 展开后聚焦输入框方便直接追问；收起时释放输入框残留焦点，
   * 避免后续按键落入已隐藏的 textarea。
   */
  const handleToggleMode = useCallback(() => {
    const next = mode === "card" ? "chat" : "card"
    // 形态过渡：宽度/高度/落位一起变，交给 CSS 过渡；减弱动效时直接跳变
    if (!prefersReducedMotion()) {
      setMorphing(true)
      if (morphTimerRef.current !== null) window.clearTimeout(morphTimerRef.current)
      morphTimerRef.current = window.setTimeout(() => {
        morphTimerRef.current = null
        setMorphing(false)
      }, MORPH_DURATION + 60)
    }
    setMode(next)
    void trackEvent("chat_panel_mode_toggled", {
      to_mode: next,
      source,
      // 卡片态下追问是否发生在生成中，能区分「追加提问」与「看看展开的全貌」
      streaming: requestState === "streaming"
    })
    if (next === "chat") {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      inputRef.current?.blur()
    }
  }, [mode, source, requestState])
  /** 用户是否停在消息区底部附近（流式期间仅贴底时才自动跟随滚动） */
  const isNearBottomRef = useRef(true)

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || !isNearBottomRef.current) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages, requestState])

  /**
   * 输入框自增高：单行起步，内容变多时向上撑开（上限内），超过上限内部滚动。
   * 依赖 mode：textarea 仅在聊天态挂载，切回聊天态时需要重新量一次高度。
   */
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_INPUT_MAX_HEIGHT)}px`
  }, [input, mode])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      data-aiction-chat-panel="true"
      role="dialog"
      aria-label={t("chat.inputLabel")}
      style={{
        position: "absolute",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: panelWidth,
        height: mode === "card" ? "auto" : chatPanelHeight(),
        maxHeight: chatPanelHeight(),
        // 只在形态切换期间开过渡（拖拽、流式增高必须跟手/即时，否则会有滞后感）
        transition: morphing
          ? `width ${MORPH_DURATION}ms ${uiMotion.easingStandard}, height ${MORPH_DURATION}ms ${uiMotion.easingStandard}, left ${MORPH_DURATION}ms ${uiMotion.easingStandard}, top ${MORPH_DURATION}ms ${uiMotion.easingStandard}`
          : "none",
        zIndex: uiLayer.panel,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        // 毛玻璃面板：半透明表面 + 1px 渐变描边 + 分层投影（吸设计稿的面板质感）
        ...createFloatingPanelStyle(theme, themeName === "dark"),
        overflow: "hidden",
        fontFamily: uiTypography.fontFamily,
        animation: `floating-enter 220ms ${uiMotion.easingDecelerate} both`
      }}>
      <style>{`
        /* 卡片态高度是 auto、聊天态是固定像素：允许关键字参与高度插值，
           两种形态之间才有「长高/缩回」的过渡（不支持该属性的浏览器降级为高度跳变，其余过渡照旧） */
        [data-aiction-chat-panel="true"] {
          interpolate-size: allow-keywords;
        }
        @keyframes message-enter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes floating-enter {
          from {
            opacity: 0;
            transform: translateY(6px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes thinking-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        /* 思考图标：常态静止，仅思考中呼吸 */
        @keyframes thinking-spark {
          0%, 100% { opacity: 0.5; transform: scale(0.9) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.05) rotate(18deg); }
        }
        /* 思考图标内核：与外层错相位的心跳 */
        @keyframes thinking-core {
          0%, 100% { opacity: 0.35; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1); }
        }
        /* 模型状态点：生成中的扩散环（空闲时不跑） */
        @keyframes model-pulse {
          0% { opacity: 0.5; transform: scale(1); }
          100% { opacity: 0; transform: scale(2.8); }
        }
        /* 防抖命中反馈：命中已有卡片时整体闪一下（覆盖层自带描边 + 内柔光，面板 overflow 裁不到） */
        @keyframes panel-reveal {
          0% { opacity: 0; }
          15% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        /* 选中文字：用主色淡底（与面板强调色同族），比浏览器默认的蓝更协调 */
        [data-aiction-chat-panel="true"] ::selection {
          background-color: ${theme.accent.primary}33;
        }
        [data-messages-scroll]::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        [data-messages-scroll]::-webkit-scrollbar-track {
          background: transparent;
        }
        /* 滚动条随主题取色（半透明，hover 才抬亮），不写死灰度 */
        [data-messages-scroll]::-webkit-scrollbar-thumb {
          background-color: ${theme.text.secondary}33;
          border-radius: 3px;
        }
        [data-messages-scroll]::-webkit-scrollbar-thumb:hover {
          background-color: ${theme.text.secondary}59;
        }
        [data-composer-input]::placeholder {
          color: ${theme.text.secondary};
          opacity: 0.75;
        }
        /* 多行输入超限后内部滚动的滚动条（随主题取色，不写死灰度） */
        [data-composer-input]::-webkit-scrollbar {
          width: 6px;
        }
        [data-composer-input]::-webkit-scrollbar-track {
          background: transparent;
        }
        [data-composer-input]::-webkit-scrollbar-thumb {
          background-color: ${theme.text.secondary}33;
          border-radius: 3px;
        }
        [data-composer-input]::-webkit-scrollbar-thumb:hover {
          background-color: ${theme.text.secondary}59;
        }
      `}</style>

      {/* 头部：拖拽手柄（模型芯片左置，形态切换 + 钉子 + 关闭右置；按钮不可拖拽） */}
      <div
        onPointerDown={handleHeaderPointerDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: uiSpace[6],
          padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
          borderBottom: `1px solid ${theme.border.hairline}`,
          flexShrink: 0,
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
          WebkitUserSelect: "none"
        }}>
        {modelName ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: uiSpace[6],
              flexShrink: 1,
              minWidth: 0
            }}>
            {/* 状态点：独立在模型芯片之外——芯片本体要裁掉溢出的长模型名，
                扩散环放进去会被切掉；独立一颗也让「会话是否在跑」跳出模型信息，
                成为模块级信号（生成中转主色并向外扩散，空闲为静默绿点） */}
            <span
              aria-hidden="true"
              style={{ position: "relative", width: 6, height: 6, flexShrink: 0 }}>
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: isStreaming ? theme.accent.primary : theme.state.success
                }}
              />
              {isStreaming && !prefersReducedMotion() ? (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: theme.accent.primary,
                    animation: "model-pulse 1.6s ease-out infinite"
                  }}
                />
              ) : null}
            </span>
            <div
              onMouseEnter={() => setHovered("model")}
              onMouseLeave={() => setHovered(null)}
              aria-label={`${t("chat.modelLabel")}: ${modelName}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: uiSpace[6],
                padding: `2px ${uiSpace[8]}px 2px ${uiSpace[4]}px`,
                borderRadius: uiRadius.pill,
                border: `1px solid ${theme.border.hairline}`,
                background: hovered === "model" ? theme.bg.surfaceMuted : `${theme.bg.surfaceMuted}80`,
                flexShrink: 1,
                minWidth: 0,
                transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
              }}>
              <ModelIcon size={12} color={theme.text.secondary} />
              <span
                style={{
                  fontFamily: uiTypography.fontFamilyMono,
                  fontSize: 11,
                  color: theme.text.secondary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}>
                {modelName}
              </span>
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, alignSelf: "stretch" }} />

        {/* 形态切换：两态同族（图标 + 文案的胶囊），仅图标与文案随态切换 */}
        <button
          onClick={handleToggleMode}
          onMouseEnter={() => setHovered("mode")}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setFocused("mode")}
          onBlur={() => setFocused(null)}
          aria-expanded={mode === "chat"}
          aria-label={mode === "card" ? t("chat.expandChat") : t("chat.collapsePanel")}
          title={mode === "card" ? t("chat.expandChat") : t("chat.collapsePanel")}
          style={headerControlStyle(theme, {
            withLabel: true,
            hovered: hovered === "mode",
            focused: focused === "mode"
          })}>
          {mode === "card" ? (
            <>
              <ExpandChatIcon size={12} color={theme.accent.primary} />
              {t("chat.expandChat")}
            </>
          ) : (
            <>
              <CollapseIcon size={12} color={theme.accent.primary} />
              {t("chat.collapseShort")}
            </>
          )}
        </button>

        <button
          onClick={() => onPinChange(!pinned)}
          onMouseEnter={() => setHovered("pin")}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setFocused("pin")}
          onBlur={() => setFocused(null)}
          aria-pressed={pinned}
          aria-label={pinned ? t("chat.unpinPanel") : t("chat.pinPanel")}
          title={pinned ? t("chat.unpinPanel") : t("chat.pinPanel")}
          style={headerControlStyle(theme, {
            withLabel: true,
            hovered: hovered === "pin",
            focused: focused === "pin",
            active: pinned
          })}>
          <PinIcon
            size={12}
            color={pinned ? theme.accent.primary : theme.text.secondary}
            pinned={pinned}
          />
          {t("chat.pinShort")}
        </button>

        {/* 分隔线：把破坏性的「关闭」与常态操作分开，避免误点 */}
        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: 12,
            margin: `0 ${uiSpace[2]}px`,
            flexShrink: 0,
            background: theme.border.default
          }}
        />

        <button
          onClick={onClose}
          onMouseEnter={() => setHovered("close")}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setFocused("close")}
          onBlur={() => setFocused(null)}
          aria-label={t("chat.closePanel")}
          title={t("chat.closePanel")}
          style={headerControlStyle(theme, {
            hovered: hovered === "close",
            focused: focused === "close"
          })}>
          <CloseIcon size={12} color={theme.text.secondary} />
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        data-messages-scroll
        onScroll={handleMessagesScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding:
            mode === "card"
              ? `${uiSpace[12]}px ${uiSpace[16]}px ${uiSpace[14]}px`
              : `${uiSpace[12]}px ${uiSpace[14]}px`,
          display: "block",
          // 消息区不另铺底：面板本体就是毛玻璃，靠 hairline 分区（头部 / 消息 / 输入区）
          background: "transparent",
          minHeight: 0
        }}>
        {visibleMessages.length === 0 && !isStreaming ? (
          <div
            style={{
              ...createStatusMessageStyle(theme, "info"),
              color: theme.text.secondary,
              fontSize: uiTypography.fontSize.sm,
              borderRadius: uiRadius.md,
              padding: `${uiSpace[10]}px ${uiSpace[14]}px`,
              textAlign: "center",
              lineHeight: 1.4
            }}>
            {hasCapturedText
              ? t("chat.emptyWithCapture")
              : t("chat.emptyWithoutCapture")}
          </div>
        ) : null}

        {visibleMessages.map((item) => (
          <MessageBubble
            key={item.id}
            item={item}
            isStreaming={isStreaming}
            theme={theme}
            variant={mode}
          />
        ))}

        {isStreaming ? (
          <div
            style={{
              // 生成中提示做成「一个内容块」：与助手回答同族的描边 / 淡底 / 圆角，
              // 宽度自适应（不再是横贯整条的 banner），看起来像回答正在这个位置长出来
              display: "inline-flex",
              alignItems: "center",
              gap: uiSpace[6],
              marginTop: visibleMessages.length > 0 ? uiSpace[10] : 0,
              padding: `${uiSpace[8]}px ${uiSpace[12]}px`,
              borderRadius: uiRadius.lg,
              border: `1px solid ${theme.border.hairline}`,
              background: `${theme.bg.surfaceMuted}80`,
              color: theme.text.secondary,
              fontSize: uiTypography.fontSize.sm,
              lineHeight: 1.4
            }}>
            <ThinkingDot color={theme.accent.primary} />
            {t("chat.generating")}
          </div>
        ) : null}
      </div>

      {/* 聊天态：消息区下方保留完整输入区 */}
      {mode === "chat" ? (
      <div
        style={{
          padding: `${uiSpace[8]}px ${uiSpace[8]}px ${uiSpace[10]}px`,
          borderTop: `1px solid ${theme.border.hairline}`,
          background: "transparent",
          flexShrink: 0
        }}>
        {/* composer：一层描边同时包住输入框与发送按钮，聚焦时整体点亮 */}
        <div style={composerStyle(theme, { focused: focused === "input" })}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={() => setFocused("input")}
            onBlur={() => setFocused(null)}
            onKeyDown={(event) => {
              event.stopPropagation()

              // 输入法组合中的 Enter 是确认候选词，不能当成发送
              if (event.nativeEvent.isComposing) {
                return
              }

              if (event.key !== "Enter" || event.shiftKey) {
                return
              }

              event.preventDefault()

              const value = input.trim()
              if (!value || isStreaming) {
                return
              }

              onSend(value)
              setInput("")
            }}
            aria-label={t("chat.inputLabel")}
            placeholder={t("chat.inputPlaceholder")}
            data-composer-input="true"
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: COMPOSER_INPUT_MIN_HEIGHT,
              maxHeight: COMPOSER_INPUT_MAX_HEIGHT,
              margin: 0,
              padding: `${uiSpace[6]}px 0`,
              border: "none",
              outline: "none",
              background: "transparent",
              color: theme.text.primary,
              boxSizing: "border-box",
              resize: "none",
              overflowY: "auto",
              fontFamily: "inherit",
              fontSize: uiTypography.fontSize.sm,
              lineHeight: 1.45
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (isStreaming) {
                onStop()
                return
              }

              const value = input.trim()
              if (!value) {
                return
              }

              onSend(value)
              setInput("")
            }}
            onMouseEnter={() => setHovered("send")}
            onMouseLeave={() => {
              setHovered(null)
              setSendPressed(false)
            }}
            onMouseDown={() => setSendPressed(true)}
            onMouseUp={() => setSendPressed(false)}
            onFocus={() => setFocused("send")}
            onBlur={() => setFocused(null)}
            disabled={sendDisabled && !isStreaming}
            aria-label={isStreaming ? t("chat.stop") : t("chat.send")}
            title={isStreaming ? t("chat.stop") : t("chat.send")}
            style={composerSendButtonStyle(theme, {
              stop: isStreaming,
              active: !sendDisabled,
              hovered: hovered === "send",
              focused: focused === "send",
              pressed: sendPressed
            })}>
            {isStreaming ? (
              <StopIcon size={12} color={theme.text.primary} />
            ) : (
              <SendArrowIcon
                size={15}
                color={sendDisabled ? theme.text.secondary : theme.text.inverse}
              />
            )}
          </button>
        </div>
      </div>
      ) : null}

      {/* 防抖命中反馈：常驻覆盖层，命中时由 effect 显式重启动画
          （不碰面板自身的入场动画与投影，也不动位置；动画无 fill-mode，播完自然回到 opacity 0） */}
      <div
        ref={revealPulseRef}
        aria-hidden="true"
        data-panel-reveal="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          border: `2px solid ${theme.accent.primary}`,
          // 内柔光而非外发光：面板自身 overflow: hidden，画在外侧的光晕会被裁掉
          boxShadow: `inset 0 0 0 4px ${theme.accent.primary}33`,
          pointerEvents: "none",
          zIndex: 2,
          opacity: 0
        }}
      />
    </div>
  )
}
