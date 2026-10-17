import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { MarkdownRenderer } from "@/shared/ui/markdown"
import { useUiTheme } from "@/shared/ui/theme"
import {
  EDGE_INSET,
  placeNearAnchor,
  type AnchorRect
} from "@/entrypoints/content/components/floating"
import { uiLayer, uiMotion, uiRadius, uiSpace, uiShadow, uiTypography } from "@/shared/ui/tokens"
import { createButtonStyle, createFocusRing, createInputStyle, createStatusMessageStyle } from "@/shared/ui/styles"
import { useI18n } from "@/shared/i18n/context"
import { toSingleLine } from "@/entrypoints/content/utils/reasoningText"
import type { ChatMessage, ChatRequestState } from "@/shared/types"

/** 对话窗宽度 */
const PANEL_WIDTH = 480
/** 对话窗理想高度（超高视口按可用高度收缩） */
const PANEL_MAX_HEIGHT = 640
/** 卡片态落位时的假设高度（实际高度随内容自适应，仅参与翻转/钳制计算） */
const CARD_ASSUME_HEIGHT = 170

/**
 * 头部控件统一样式族：icon-only 呈正圆、带文案呈胶囊，几何与交互完全一致。
 * 形态切换 / 钉住 / 关闭三个按钮共用，避免各自手写样式而逐渐走形。
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
    height: size,
    minWidth: size,
    padding: withLabel ? `0 ${uiSpace[8]}px` : 0,
    borderRadius: uiRadius.pill,
    border: "none",
    // active = 开关已开启（目前只有钉住）：主色 12% 淡底，与普通 hover 区分
    background: active
      ? `${theme.accent.primary}1F`
      : hovered
        ? theme.bg.surfaceMuted
        : "transparent",
    color: theme.text.secondary,
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: uiTypography.fontFamily,
    fontSize: uiTypography.fontSize.xs,
    lineHeight: 1,
    whiteSpace: "nowrap",
    boxShadow: focused ? createFocusRing(theme.accent.primary) : "none",
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  }
}

function CloseIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12M12 4L4 12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
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

/** 收起图标（聊天态 → 卡片态）：向下人字形 */
function CollapseIcon({ size, color }: { size: number; color: string }) {
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

interface ThinkingTheme {
  text: { secondary: string; primary: string }
  bg: { surfaceMuted: string; surface: string }
  border: { subtle: string; default: string }
  brand: { primary: string }
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
  theme
}: {
  reasoning: string
  isStreaming: boolean
  theme: ThinkingTheme
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
        // 展开后画一个白底卡片（描边用 border.default：subtle 比块底色更亮，浅色下会隐形）
        border: expanded ? `1px solid ${theme.border.default}` : undefined,
        borderBottom: expanded ? undefined : `1px solid ${theme.border.subtle}`,
        borderRadius: expanded ? uiRadius.md : 0,
        // 展开态：白底卡片（比消息区/气泡都亮，与下方回答边界最清楚）；
        // 收起态：透明，hover 时整块淡底
        background: expanded ? theme.bg.surface : hovered ? theme.bg.surfaceMuted : "transparent",
        boxShadow: expanded ? uiShadow.sm : "none",
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
          color: theme.text.secondary,
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
            stroke={theme.text.secondary}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {/* 常态思考图标：思考中靠动画指示状态（不占额外宽度，不会让视口宽度抖动） */}
        <ThinkingSparkIcon size={13} color={theme.text.secondary} active={isStreaming} />
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
  /** 呈现形态：chat = 常规气泡／card = 卡片态铺满（无气泡框，内容直铺） */
  variant?: "chat" | "card"
  /** card 形态下多条 assistant 内容之间的分隔（非末条时渲染底部 hairline） */
  cardSeparated?: boolean
}

const MessageBubble = memo(function MessageBubble({
  item,
  isStreaming,
  theme,
  variant = "chat",
  cardSeparated = false
}: MessageBubbleProps) {
  const isCard = variant === "card"
  return (
    <div
      style={{
        display: "block",
        marginLeft: item.role === "user" ? "auto" : undefined,
        maxWidth: isCard ? "none" : "85%",
        marginBottom: isCard ? (cardSeparated ? uiSpace[10] : 0) : uiSpace[8],
        borderRadius: isCard ? 0 : uiRadius.md,
        lineHeight: 1.4,
        fontSize: uiTypography.fontSize.sm,
        whiteSpace: item.role === "user" ? "pre-wrap" : "normal",
        wordBreak: "break-word",
        background: item.role === "user" ? theme.accent.primary : isCard ? "transparent" : theme.bg.surfaceMuted,
        color: item.role === "user" ? theme.text.inverse : theme.text.primary,
        border: item.role === "user" || isCard ? "none" : `0.5px solid ${theme.border.hairline}`,
        boxShadow: isCard ? "none" : uiShadow.sm,
        animation: `message-enter 300ms ${uiMotion.easingDecelerate} forwards`,
        overflow: "hidden",
        borderBottom: isCard && cardSeparated ? `0.5px solid ${theme.border.hairline}` : undefined,
        paddingBottom: isCard && cardSeparated ? uiSpace[10] : undefined
      }}>
      {item.role === "assistant" && item.reasoning_content ? (
        <ThinkingBlock
          reasoning={item.reasoning_content}
          isStreaming={isStreaming && !item.content}
          theme={theme}
        />
      ) : null}
      {item.content ? (
        <div
          style={{
            // 卡片态消息区容器统一提供舒适内边距，内容本身不再套气泡内边距
            padding: isCard ? undefined : `${uiSpace[8]}px ${uiSpace[10]}px`,
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
  /** 钉住状态由父级（ChatSession/App）持有：钉住后点击窗外不关闭，且父级可据此保护会话不被新触发替换 */
  pinned: boolean
  onPinChange: (pinned: boolean) => void
  onSend: (input: string) => void
  onStop: () => void
  /** 关闭对话窗（清空本轮对话） */
  onClose: () => void
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
  pinned,
  onPinChange,
  onSend,
  onStop,
  onClose
}: Props) {
  const theme = useUiTheme()
  const { t } = useI18n()
  /** 面板形态：card = 卡片态（仅 AI 生成内容）/ chat = 完整聊天态（消息 + 输入框）。新会话默认卡片态 */
  const [mode, setMode] = useState<"card" | "chat">("card")
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [sendPressed, setSendPressed] = useState(false)
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

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  /** 用户是否已拖拽过位置（拖拽后位置归用户管） */
  const draggedRef = useRef(false)

  /** 把面板位置钳制回当前视口（拖拽中与 resize 后都用它防丢） */
  const clampPanelPos = useCallback((p: { left: number; top: number }) => {
    const height = Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_INSET * 2)
    const maxLeft = Math.max(
      EDGE_INSET,
      Math.max(document.documentElement.clientWidth, document.documentElement.scrollWidth) - PANEL_WIDTH - EDGE_INSET
    )
    const viewportTop = window.scrollY + EDGE_INSET
    const viewportBottom = window.scrollY + window.innerHeight - EDGE_INSET - height
    return {
      left: Math.min(Math.max(p.left, EDGE_INSET), maxLeft),
      top: Math.min(Math.max(p.top, viewportTop), Math.max(viewportTop, viewportBottom))
    }
  }, [])

  const computePosition = useCallback(() => {
    if (!open) return
    // 用户拖拽过后位置归用户接管，resize 只需要钳制回视口，不再按锚点重算
    if (draggedRef.current) {
      setPos((prev) => (prev ? clampPanelPos(prev) : prev))
      return
    }
    const isCard = mode === "card"
    // 卡片态实际高度随内容自适应，翻转/钳制计算用较小的假设高度，避免误判为「下方放不下」而错误翻转到上方
    const height = isCard
      ? CARD_ASSUME_HEIGHT
      : Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_INSET * 2)
    const rect =
      anchor ??
      ({ x: window.scrollX + window.innerWidth / 2, y: window.scrollY + 80, width: 0, height: 0 } satisfies AnchorRect)
    const placed = placeNearAnchor(rect, PANEL_WIDTH, height)
    setPos({ left: placed.left, top: placed.top })
  }, [open, anchor, clampPanelPos, mode])

  useLayoutEffect(() => {
    computePosition()
  }, [computePosition])

  // 视口尺寸变化时重新钳制（仅贴边时需要；拖拽后钳制回当前视口）
  useEffect(() => {
    if (!open) return
    const handleResize = () => computePosition()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [open, computePosition])

  // ---------- 拖拽：按住头部空白处拖动整个对话窗（头部按钮不受影响） ----------

  const handleHeaderPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      // 头部上的功能按钮（模型图标 / 钉子 / 关闭）不触发拖拽
      if ((event.target as HTMLElement).closest("button")) return
      event.preventDefault()
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
        setPos(
          clampPanelPos({
            left: start.left + (e.clientX - start.pointerX),
            top: start.top + (e.clientY - start.pointerY)
          })
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
    [pos, clampPanelPos]
  )

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
    setMode(next)
    if (next === "chat") {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      inputRef.current?.blur()
    }
  }, [mode])
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

  const focusRing = (state: string | null, target: string) =>
    focused === target ? createFocusRing(theme.accent.primary) : "none"

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
        width: PANEL_WIDTH,
        height: mode === "card" ? "auto" : Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_INSET * 2),
        maxHeight: Math.min(PANEL_MAX_HEIGHT, window.innerHeight - EDGE_INSET * 2),
        zIndex: uiLayer.panel,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        borderRadius: uiRadius.xl,
        background: theme.bg.surface,
        border: `1px solid ${theme.border.default}`,
        boxShadow: uiShadow.lg,
        overflow: "hidden",
        fontFamily: uiTypography.fontFamily,
        animation: `floating-enter 220ms ${uiMotion.easingDecelerate} both`
      }}>
      <style>{`
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
        [data-messages-scroll]::-webkit-scrollbar {
          width: 6px;
        }
        [data-messages-scroll]::-webkit-scrollbar-track {
          background: transparent;
        }
        [data-messages-scroll]::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.12);
          border-radius: 3px;
        }
        [data-messages-scroll]::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.2);
        }
      `}</style>

      {/* 头部：拖拽手柄（模型图标左置，形态切换 + 钉子 + 关闭右置；按钮不可拖拽） */}
      <div
        onPointerDown={handleHeaderPointerDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: uiSpace[6],
          padding: `${uiSpace[6]}px ${uiSpace[10]}px ${uiSpace[4]}px`,
          flexShrink: 0,
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
          WebkitUserSelect: "none"
        }}>
        {modelName ? (
          <div
            onMouseEnter={() => setHovered("model")}
            onMouseLeave={() => setHovered(null)}
            aria-label={`${t("chat.modelLabel")}: ${modelName}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: uiSpace[4],
              padding: `${uiSpace[2]}px ${uiSpace[6]}px ${uiSpace[2]}px`,
              borderRadius: uiRadius.sm,
              flexShrink: 1,
              minWidth: 0,
              overflow: "hidden",
              background: hovered === "model" ? theme.bg.surfaceMuted : "transparent"
            }}>
            <ModelIcon size={14} color={theme.text.secondary} />
            <span
              style={{
                fontSize: uiTypography.fontSize.xs,
                color: theme.text.secondary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>
              {modelName}
            </span>
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
              <ExpandChatIcon size={12} color={theme.text.secondary} />
              {t("chat.expandChat")}
            </>
          ) : (
            <>
              <CollapseIcon size={12} color={theme.text.secondary} />
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
              ? `${uiSpace[10]}px ${uiSpace[14]}px ${uiSpace[12]}px`
              : uiSpace[6],
          display: "block",
          background: theme.bg.surfaceAlt,
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

        {visibleMessages.map((item, index) => (
          <MessageBubble
            key={item.id}
            item={item}
            isStreaming={isStreaming}
            theme={theme}
            variant={mode}
            cardSeparated={mode === "card" && index < visibleMessages.length - 1}
          />
        ))}

        {isStreaming ? (
          <div
            style={{
              color: theme.text.secondary,
              ...createStatusMessageStyle(theme, "info"),
              display: "flex",
              alignItems: "center",
              gap: uiSpace[6]
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
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: uiSpace[6],
          padding: `${uiSpace[6]}px ${uiSpace[8]}px`,
          borderTop: `0.5px solid ${theme.border.hairline}`,
          background: theme.bg.surface,
          flexShrink: 0
        }}>
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
          style={{
            ...createInputStyle(theme, focused === "input"),
            flex: 1,
            minHeight: 44,
            resize: "none",
            borderRadius: uiRadius.sm,
            padding: `${uiSpace[8]}px ${uiSpace[10]}px`,
            fontSize: uiTypography.fontSize.sm,
            fontFamily: "inherit",
            lineHeight: 1.4,
            boxShadow: focusRing(focused, "input")
          }}
        />
        <button
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
          style={{
            ...createButtonStyle(theme, isStreaming ? "secondary" : "primary", {
              disabled: sendDisabled && !isStreaming,
              pressed: sendPressed,
              focused: focused === "send"
            }),
            height: 32,
            minWidth: 60,
            alignSelf: "center",
            borderRadius: uiRadius.md,
            background: isStreaming
              ? theme.bg.surfaceMuted
              : sendDisabled
                ? theme.state.disabled
                : hovered === "send"
                  ? theme.accent.primaryHover
                  : theme.accent.primary,
            cursor: isStreaming ? "pointer" : sendDisabled ? "not-allowed" : "pointer",
            opacity: sendDisabled && !isStreaming ? 0.5 : 1,
            transform: sendPressed ? "scale(0.95)" : "scale(1)",
            padding: `0 ${uiSpace[12]}px`,
            fontSize: uiTypography.fontSize.sm
          }}>
          {isStreaming ? t("chat.stop") : t("chat.send")}
        </button>
      </div>
      ) : null}
    </div>
  )
}
