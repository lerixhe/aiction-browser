import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react"

import { useUiTheme } from "@/shared/ui/theme"
import { uiLayer, uiMotion, uiRadius, uiTypography } from "@/shared/ui/tokens"

export type IslandExpandTrigger = "hover" | "click"

/**
 * 岛内内容可申请“抑制自动收回”（如拖动进度条时鼠标可能短暂移出岛）。
 * hold/release 需配对；全部 release 后，此前被抑制的收回意图会继续执行。
 */
export const IslandHoldContext = createContext<{ hold: () => void; release: () => void } | null>(null)

/** 岛固定在页面顶部中央 */
const ISLAND_TOP = 12
/** 展开态圆角（胶囊 999 → 20 的连续插值） */
const ISLAND_EXPANDED_RADIUS = 20
/** hover 模式下鼠标移出后自动收回的延迟 */
const HOVER_COLLAPSE_DELAY_MS = 300
/** 宽高 morph 时长（spring 曲线，与语音岛一致的手感） */
const MORPH_MS = 380

/** 岛入场动画样式（提取为模块常量：内联模板串在 JSX 中解析异常） */
const ISLAND_CSS = `
  @keyframes island-enter {
    from { opacity: 0; transform: translateX(-50%) scale(0.7); }
    to { opacity: 1; transform: translateX(-50%) scale(1); }
  }
`

interface Props {
  /** 岛是否挂载（false 时整体卸载，重新挂载会重播入场动画） */
  visible: boolean
  expanded: boolean
  onExpandedChange: (next: boolean) => void
  /**
   * expanded 态点击岛外区域时触发（如"收起并关闭对话"）。
   * hover 模式（移出即收回）不需要传。
   */
  onOutsideActivate?: () => void
  /** 折叠胶囊尺寸 */
  pillWidth: number
  pillHeight: number
  /** 展开面板尺寸 */
  expandedWidth: number
  expandedHeight: number
  /** pill 态的展开方式：hover 预览（TTS）或点击（聊天） */
  expandTrigger: IslandExpandTrigger
  ariaLabel: string
  /** 折叠层内容（状态胶囊） */
  pill: React.ReactNode
  /** 展开层内容（任务面板） */
  children: React.ReactNode
}

/**
 * 灵动岛通用容器：一个连续的表面，多种任务形态。
 *
 * - 固定在页面顶部中央，pill ⇄ expanded 之间宽高 + 圆角 spring morph
 * - 内容层不跟随容器重排：两层各自固定尺寸居中，靠 opacity/scale 交叉过渡
 *   （iOS 灵动岛的做法：岛形变，内容独立缩放浮现）
 * - hover 触发模式用于瞬态工具（TTS 控制条）；click 触发模式用于持续工作区（聊天）
 * - Esc / 点击岛外的收起语义由容器统一处理（capture 阶段，覆盖岛内输入框 stopPropagation）
 */
export default function DynamicIsland({
  visible,
  expanded,
  onExpandedChange,
  onOutsideActivate,
  pillWidth,
  pillHeight,
  expandedWidth,
  expandedHeight,
  expandTrigger,
  ariaLabel,
  pill,
  children
}: Props) {
  const theme = useUiTheme()
  const islandRef = useRef<HTMLDivElement | null>(null)
  const collapseTimerRef = useRef<number | null>(null)
  /** 抑制收回的持有者计数 */
  const holdCountRef = useRef(0)
  /** 抑制期间的收回意图：最后一个持有者 release 后继续执行 */
  const pendingCollapseRef = useRef(false)

  // 回调走 ref，让 keydown/pointerdown 监听器不用随回调重建
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const onExpandedChangeRef = useRef(onExpandedChange)
  onExpandedChangeRef.current = onExpandedChange
  const onOutsideActivateRef = useRef(onOutsideActivate)
  onOutsideActivateRef.current = onOutsideActivate

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current != null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }, [])

  /** 岛内最后获得焦点的元素（收起时 blur，避免键盘输入落进隐形面板） */
  const focusedElementRef = useRef<HTMLElement | null>(null)

  /** 收起为胶囊：移走岛内焦点 + 通知宿主 */
  const collapse = useCallback(() => {
    const el = focusedElementRef.current
    if (el) {
      el.blur()
      focusedElementRef.current = null
    }
    onExpandedChangeRef.current(false)
  }, [])

  const expand = useCallback(() => {
    clearCollapseTimer()
    pendingCollapseRef.current = false
    if (!expandedRef.current) {
      onExpandedChangeRef.current(true)
    }
  }, [clearCollapseTimer])

  const scheduleCollapse = useCallback(() => {
    // 有持有者（如正在拖进度条）时记下意图，待 release 后继续
    if (holdCountRef.current > 0) {
      pendingCollapseRef.current = true
      return
    }
    if (collapseTimerRef.current != null) return
    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null
      collapse()
    }, HOVER_COLLAPSE_DELAY_MS)
  }, [collapse])

  const hold = useCallback(() => {
    holdCountRef.current += 1
  }, [])

  const release = useCallback(() => {
    holdCountRef.current = Math.max(0, holdCountRef.current - 1)
    if (holdCountRef.current === 0 && pendingCollapseRef.current) {
      pendingCollapseRef.current = false
      scheduleCollapse()
    }
  }, [scheduleCollapse])

  const holdApi = useMemo(() => ({ hold, release }), [hold, release])

  // 卸载时清理 hover 收回计时器
  useEffect(() => clearCollapseTimer, [clearCollapseTimer])

  // hover 模式：鼠标进出控制展开/自动收回；click 模式靠点击
  const handleMouseEnter = expandTrigger === "hover" ? expand : undefined
  const handleMouseLeave = expandTrigger === "hover" ? scheduleCollapse : undefined

  // Esc 收回（capture 阶段：岛内输入框会 stopPropagation，容器级监听先于它触发）
  useEffect(() => {
    if (!visible || !expanded) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      collapse()
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [visible, expanded, collapse])

  // 点击岛外（composedPath 穿透 Shadow DOM 判断，避免 retarget 误判）
  useEffect(() => {
    if (!visible || !expanded || !onOutsideActivate) return
    const handlePointerDown = (event: MouseEvent) => {
      if (islandRef.current && event.composedPath().includes(islandRef.current)) return
      onOutsideActivateRef.current?.()
    }
    document.addEventListener("mousedown", handlePointerDown, true)
    return () => document.removeEventListener("mousedown", handlePointerDown, true)
  }, [visible, expanded, onOutsideActivate])

  if (!visible) return null

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

  return (
    <div
      ref={islandRef}
      aria-label={ariaLabel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={(event) => {
        focusedElementRef.current = event.target as HTMLElement
      }}
      onBlurCapture={() => {
        focusedElementRef.current = null
      }}
      onClick={() => {
        if (!expanded) expand()
      }}
      style={{
        position: "fixed",
        top: ISLAND_TOP,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: uiLayer.overlay,
        width: expanded ? expandedWidth : pillWidth,
        height: expanded ? expandedHeight : pillHeight,
        maxHeight: expanded ? "calc(100vh - 24px)" : undefined,
        borderRadius: expanded ? ISLAND_EXPANDED_RADIUS : uiRadius.pill,
        background: theme.bg.surface,
        border: `1px solid ${theme.border.default}`,
        boxShadow: surfaceShadow,
        overflow: "hidden",
        pointerEvents: "auto",
        fontFamily: uiTypography.fontFamily,
        transition: `width ${MORPH_MS}ms ${uiMotion.easingSpringGentle}, height ${MORPH_MS}ms ${uiMotion.easingSpringGentle}, border-radius ${MORPH_MS}ms ${uiMotion.easingSpringGentle}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
        cursor: expanded ? "default" : "pointer",
        animation: `island-enter 360ms ${uiMotion.easingSpringGentle} forwards`
      }}>
      <IslandHoldContext.Provider value={holdApi}>
      {/* 折叠层：状态胶囊（内容独立于容器尺寸，morph 中不被重排挤压） */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: pillWidth,
          height: pillHeight,
          transform: `translate(-50%, -50%) scale(${expanded ? 0.92 : 1})`,
          opacity: expanded ? 0 : 1,
          transition: `opacity 130ms ${uiMotion.easingStandard}, transform 220ms ${uiMotion.easingSpringGentle}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: expanded ? "none" : "auto",
          whiteSpace: "nowrap"
        }}>
        {pill}
      </div>

      {/* 展开层：任务面板（延迟淡入，避免 morph 中间态穿帮） */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: expandedWidth,
          height: expandedHeight,
          transform: `translate(-50%, -50%) scale(${expanded ? 1 : 0.96})`,
          opacity: expanded ? 1 : 0,
          transition: `opacity 200ms ${uiMotion.easingDecelerate} ${expanded ? 90 : 0}ms, transform 260ms ${uiMotion.easingSpringGentle}`,
          pointerEvents: expanded ? "auto" : "none",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        }}>
        {children}
      </div>
      </IslandHoldContext.Provider>

      <style>{ISLAND_CSS}</style>
    </div>
  )
}
