import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { TtsCircleContent, TtsControlBar, TtsCountdownRing } from "@/entrypoints/content/components/SpeechPlayer"
import type { useSpeechPlayer } from "@/entrypoints/content/hooks/useSpeechPlayer"
import { placeNearAnchor, type AnchorRect } from "@/entrypoints/content/components/floating"
import { useUiTheme } from "@/shared/ui/theme"
import { useI18n } from "@/shared/i18n/context"
import { uiLayer, uiMotion, uiRadius, uiTypography } from "@/shared/ui/tokens"

export type SpeechPlayerInstance = ReturnType<typeof useSpeechPlayer>

/**
 * 控件内部操作（拖进度条等）可申请「抑制自动收起」：hold/release 需配对，
 * 全部 release 后，此前被抑制的收起意图会继续执行。
 */
export const HoldContext = createContext<{ hold: () => void; release: () => void } | null>(null)

/** 展开控制条尺寸 */
const BAR_WIDTH = 448
const BAR_HEIGHT = 44
/** 折叠小圆球直径（收起态） */
const CIRCLE_SIZE = 32
/** 展开控制条圆角 */
const CONTROL_BAR_RADIUS = 16
/** 播放完毕后闲置多久自动退场（卸载控件），与倒计时圆环共用 */
const TTS_DISMISS_MS = 5000
/** 鼠标移出后收起为圆球的延迟 */
const HOVER_COLLAPSE_MS = 300
/** 触发后用户未交互（未悬停）时的自动收起延迟 */
const AUTO_COLLAPSE_MS = 4000

/** 焦点抑制收起只针对文本输入类元素（含下拉框；按钮残留焦点不应阻止收起） */
function isTextEntryElement(el: HTMLElement): boolean {
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable
}

/** 悬浮控件的落位状态（文档坐标） */
interface Placement {
  left: number
  top: number
}

interface Props {
  player: SpeechPlayerInstance
  /** 锚定矩形（工具栏落位，文档坐标） */
  anchor: AnchorRect | null
}

/**
 * 悬浮朗读控件：触发朗读后自动浮现在划词工具栏下方（安全区自动翻转）。
 *
 * - 默认展开为控制条；鼠标移出（或触发后一直未交互）自动收起为 32px 小圆球，
 *   悬停/点击圆球再次展开
 * - 拖动进度条（hold）或焦点在输入类控件时，鼠标滑出不收起
 * - 播放完毕（finished）且处于圆球态时，5s 倒计时圆环走完自动退场（卸载控件）；
 *   悬停/展开期间计时暂停，移开后从头重计
 */
export default function SpeechWidget({ player, anchor }: Props) {
  const theme = useUiTheme()
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(true)
  const [placement, setPlacement] = useState<Placement | null>(null)

  const holdCountRef = useRef(0)
  /** 抑制期间的收起意图：最后一个持有者 release 后继续执行 */
  const pendingCollapseRef = useRef(false)
  /** 控件内最后获得焦点的元素（文本输入类元素存在时滑出不收起） */
  const focusedElementRef = useRef<HTMLElement | null>(null)
  /** 鼠标是否在控件内 */
  const hoveringRef = useRef(false)

  const collapseTimerRef = useRef<number | null>(null)
  const widgetRef = useRef<HTMLDivElement | null>(null)

  // 回调走 ref，让 document 级监听器不随回调重建
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current != null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }, [])

  /** 排定一次延迟收起（收起 = 展开控制条 → 小圆球） */
  const scheduleCollapse = useCallback(
    (delay: number) => {
      clearCollapseTimer()
      collapseTimerRef.current = window.setTimeout(() => {
        collapseTimerRef.current = null
        if (holdCountRef.current > 0) {
          pendingCollapseRef.current = true
          return
        }
        setExpanded(false)
      }, delay)
    },
    [clearCollapseTimer]
  )

  const hold = useCallback(() => {
    holdCountRef.current += 1
  }, [])

  const release = useCallback(() => {
    holdCountRef.current = Math.max(0, holdCountRef.current - 1)
    if (holdCountRef.current === 0 && pendingCollapseRef.current) {
      pendingCollapseRef.current = false
      scheduleCollapse(HOVER_COLLAPSE_MS)
    }
  }, [scheduleCollapse])

  const holdApi = useMemo(() => ({ hold, release }), [hold, release])

  // ---------- 落位：工具栏下方，放不下翻转上方（按控制条尺寸预留） ----------

  const computePlacement = useCallback(() => {
    const rect =
      anchor ??
      ({ x: window.scrollX + window.innerWidth / 2, y: window.scrollY + 80, width: 0, height: 0 } satisfies AnchorRect)
    const placed = placeNearAnchor(rect, BAR_WIDTH, BAR_HEIGHT)
    setPlacement({ left: placed.left, top: placed.top })
  }, [anchor])

  useLayoutEffect(() => {
    computePlacement()
  }, [computePlacement])

  useEffect(() => {
    const handleResize = () => computePlacement()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [computePlacement])

  // ---------- 交互：悬停展开 / 移出收起 ----------

  const handleMouseEnter = useCallback(() => {
    hoveringRef.current = true
    pendingCollapseRef.current = false
    clearCollapseTimer()
    setExpanded(true)
  }, [clearCollapseTimer])

  const handleMouseLeave = useCallback(() => {
    hoveringRef.current = false
    if (holdCountRef.current > 0) {
      pendingCollapseRef.current = true
      return
    }
    // 正在输入类控件（语音/语速下拉框等）时鼠标滑出不收起
    const el = focusedElementRef.current
    if (el && isTextEntryElement(el)) return
    scheduleCollapse(HOVER_COLLAPSE_MS)
  }, [scheduleCollapse])

  const handleClick = useCallback(() => {
    // 收起态点击圆球 = 展开（触摸屏入口；展开态点击交给内部控件）
    if (!expandedRef.current) setExpanded(true)
  }, [])

  // 触发后用户一直未交互（未悬停/未持有）：延迟自动收起为圆球；悬停时点击圆球已展开，不受影响
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!hoveringRef.current && holdCountRef.current === 0 && !pendingCollapseRef.current) {
        setExpanded(false)
      }
    }, AUTO_COLLAPSE_MS)
    return () => window.clearTimeout(timer)
  }, [])

  // ---------- 播放完毕：圆球态闲置 5s 自动退场（倒计时圆环同步启停） ----------

  const isFinished = player.state.status === "finished"
  const dismissCounting = isFinished && !expandedRef.current && holdCountRef.current === 0 && !hoveringRef.current

  useEffect(() => {
    if (!dismissCounting) return
    const timer = window.setTimeout(() => player.stop(), TTS_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [dismissCounting, player.stop])

  // 卸载时清理计时器
  useEffect(() => {
    return () => clearCollapseTimer()
  }, [clearCollapseTimer])

  // Esc = 请求收起（不退场；退场只由取消/停止/闲置计时触发）
  useEffect(() => {
    if (!expanded) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      clearCollapseTimer()
      setExpanded(false)
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [expanded, clearCollapseTimer])

  // ---------- 渲染 ----------

  // 与 SelectionToolbar 一致的表面阴影（按页面明暗自适应）
  const surfaceShadow = (() => {
    const hex = theme.bg.page.replace("#", "")
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const isDark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
    return isDark
      ? "0 8px 40px 0 rgb(0 0 0 / 0.28), 0 0 1px 0 rgb(0 0 0 / 0.28)"
      : "0 8px 40px 0 rgb(0 0 0 / 0.08), 0 0 1px 0 rgb(0 0 0 / 0.08)"
  })()

  const w = expanded ? BAR_WIDTH : CIRCLE_SIZE
  const h = expanded ? BAR_HEIGHT : CIRCLE_SIZE
  const radius = expanded ? CONTROL_BAR_RADIUS : CIRCLE_SIZE / 2

  return (
    <div
      ref={widgetRef}
      data-aiction-speech-widget="true"
      role="group"
      aria-label={t("ui.tts.speaking")}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={(event) => {
        focusedElementRef.current = event.target as HTMLElement
      }}
      onBlurCapture={() => {
        focusedElementRef.current = null
      }}
      onClick={handleClick}
      style={{
        position: "absolute",
        left: placement?.left ?? -9999,
        top: placement?.top ?? -9999,
        width: w,
        height: h,
        zIndex: uiLayer.panel,
        pointerEvents: "auto",
        borderRadius: radius,
        background: theme.bg.surface,
        border: `1px solid ${theme.border.default}`,
        boxShadow: surfaceShadow,
        overflow: "hidden",
        fontFamily: uiTypography.fontFamily,
        cursor: expanded ? "default" : "pointer",
        // 收缩时保持中心不动：宽度变化的一半用位移补回（读起来等效 left 微移动画）
        transform: `translateX(${(BAR_WIDTH - w) / 2}px)`,
        animation: `speech-widget-enter 240ms ${uiMotion.easingDecelerate} backwards`,
        transition: `width ${HOVER_COLLAPSE_MS}ms ${uiMotion.easingSpringGentle}, height ${HOVER_COLLAPSE_MS}ms ${uiMotion.easingSpringGentle}, border-radius ${HOVER_COLLAPSE_MS}ms ${uiMotion.easingSpringGentle}, transform ${HOVER_COLLAPSE_MS}ms ${uiMotion.easingSpringGentle}`
      } as React.CSSProperties}>
      <style>{`
        @keyframes speech-widget-enter {
          from { opacity: 0; transform: translateY(4px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <HoldContext.Provider value={holdApi}>
        {/* 两层内容独立固定尺寸居中，morph 时不被重排挤压 */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: CIRCLE_SIZE,
            height: CIRCLE_SIZE,
            transform: "translate(-50%, -50%)",
            opacity: expanded ? 0 : 1,
            pointerEvents: expanded ? "none" : "auto",
            transition: `opacity 140ms ${uiMotion.easingStandard} ${expanded ? 0 : 120}ms`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
          <TtsCircleContent player={player} />
          {/* 退场倒计时：与退场计时器同帧启停（悬停/展开暂停，移开重计） */}
          {dismissCounting && <TtsCountdownRing />}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: BAR_WIDTH,
            height: BAR_HEIGHT,
            transform: "translate(-50%, -50%)",
            opacity: expanded ? 1 : 0,
            pointerEvents: expanded ? "auto" : "none",
            transition: `opacity 140ms ${uiMotion.easingStandard} ${expanded ? 120 : 0}ms`,
            overflow: "hidden"
          }}>
          <TtsControlBar player={player} />
        </div>
      </HoldContext.Provider>
    </div>
  )
}
