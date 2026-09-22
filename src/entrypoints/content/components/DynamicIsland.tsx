import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useUiTheme } from "@/shared/ui/theme"
import { uiLayer, uiMotion, uiRadius, uiTypography } from "@/shared/ui/tokens"
import { ISLAND_METRICS } from "@/entrypoints/content/components/islandMetrics"

/** 岛形态：圆球（朗读折叠） / 胶囊（聊天折叠） / 展开面板（同一时刻全页面至多一个 expanded） */
export type IslandForm = "circle" | "pill" | "expanded"

/**
 * 水平锚定模式：双岛时两岛外缘锁定不动（聊天岛锚左缘、朗读岛锚右缘），
 * 主副切换只有内缘（近端）伸缩；单岛与展开态锚定中心。
 */
export type IslandAnchor = "left" | "center" | "right"

/**
 * 岛内内容可申请“抑制自动收回”（如拖动进度条时鼠标可能短暂移出岛）。
 * hold/release 需配对；全部 release 后，此前被抑制的收回意图会继续执行。
 */
export const IslandHoldContext = createContext<{ hold: () => void; release: () => void } | null>(null)

/** 岛固定在页面顶部 */
const ISLAND_TOP = 12
/** 宽高/圆角 morph 时长（spring 曲线，与 iOS 灵动岛手感一致） */
const MORPH_MS = 380
/** 锚定位置（wrapper left/transform）过渡时长：比尺寸 morph 略长，产生「滑向目标位」的生长感 */
export const MOVE_MS = 440

/**
 * 岛入场动画样式（提取为模块常量：内联模板串在 JSX 中解析异常）。
 * 平移锚定在 wrapper 上，这里只做缩放浮现（transform-origin 由锚定侧决定，
 * 岛从自己锁定不动的外缘「长出来」）。
 */
const ISLAND_CSS = `
  @keyframes island-enter {
    from { opacity: 0; transform: scale(0.7); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes island-exit {
    from { opacity: 1; transform: translateX(0) scale(1); }
    to { opacity: 0; transform: translateX(calc(-1 * var(--island-exit-shift, 92px))) scale(0); }
  }
`

/** 焦点抑制收回只针对文本输入元素（按钮残留焦点不应阻止鼠标移出收回） */
function isTextEntryElement(el: HTMLElement): boolean {
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable
}

interface Props {
  /** 当前形态（由 useIslandCoordinator 推导，受控） */
  form: IslandForm
  /** 水平锚定：left=锁定左缘 / right=锁定右缘 / center=中心 */
  anchor: IslandAnchor
  /**
   * 双岛外缘锚点（到页面中线的距离）：两岛必须传同一个值，
   * 由 dualAnchorFor(chatPillWidth) 算出使间距恒为 dualGap。
   */
  dualAnchor?: number
  /** 朗读圆球直径 */
  circleSize: number
  /** 折叠胶囊尺寸 */
  pillWidth: number
  pillHeight: number
  /** 展开面板尺寸 */
  expandedWidth: number
  expandedHeight: number
  ariaLabel: string
  /**
   * 退场（吸收）动画：整体缩向页面中心并淡出，期间禁用交互。
   * 右锚圆球的右缘在 50% + dualAnchor，transform-origin 为右缘——
   * scale(0) 塌缩到右缘后再左移 dualAnchor，恰好落在页面中心被主岛吸收。
   */
  exiting?: boolean
  /** 圆球层内容（朗读岛折叠形态） */
  circleContent: React.ReactNode
  /** 胶囊层内容（聊天岛折叠形态） */
  pillContent: React.ReactNode
  /** 展开层内容（任务面板） */
  children: React.ReactNode
  /** 鼠标进入 / 点击未展开的岛（展开决策由状态机决定） */
  onActivate?: () => void
  /** 鼠标移出岛（岛内有文本焦点或 hold 抑制时不触发） */
  onDeactivate?: () => void
  /** Esc / 点击岛外 → 请求收起展开（岛保留，对话保留） */
  onCollapseRequest?: () => void
}

/**
 * 灵动岛通用容器：一个连续的表面，三种形态（circle ⇄ pill ⇄ expanded）。
 *
 * - 两层结构：外层 wrapper 负责水平锚定（双岛时外缘锁定，morph 期间纹丝不动），
 *   内层岛负责宽高/圆角 morph——主副切换时副岛近端伸长、主岛近端同步缩短，
 *   两岛边缘在间隙里此消彼长，像物质从一端流向另一端（iOS 手法）
 * - 内容层不跟随容器重排：三层各自固定尺寸居中，靠 opacity/scale 交叉过渡
 * - 交互是「上报制」：容器只上报 hover/点击/Esc/点外事件，展开与主副互换的
 *   决策集中在 useIslandCoordinator（跨岛协调无法在单岛容器内完成）
 */
export default function DynamicIsland({
  form,
  anchor,
  dualAnchor = ISLAND_METRICS.dualAnchor,
  circleSize,
  pillWidth,
  pillHeight,
  expandedWidth,
  expandedHeight,
  ariaLabel,
  circleContent,
  pillContent,
  children,
  exiting = false,
  onActivate,
  onDeactivate,
  onCollapseRequest
}: Props) {
  const theme = useUiTheme()
  const islandRef = useRef<HTMLDivElement | null>(null)
  /** 抑制收回的持有者计数 */
  const holdCountRef = useRef(0)
  /** 抑制期间的收回意图：最后一个持有者 release 后继续执行 */
  const pendingLeaveRef = useRef(false)
  /** 岛内最后获得焦点的元素（收起时 blur，避免键盘输入落进隐形面板） */
  const focusedElementRef = useRef<HTMLElement | null>(null)

  // 小视口下展开面板按可用高度收缩（否则固定高度内容层会上下等量溢出被裁，
  // 顶部标题栏/底部输入框被切掉）
  const [viewportH, setViewportH] = useState(() => window.innerHeight)
  useEffect(() => {
    const handleResize = () => setViewportH(window.innerHeight)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  const clampedExpandedH = Math.min(expandedHeight, viewportH - ISLAND_TOP * 2)

  // 收起后保持高层级直到 morph 结束：宽度还没缩回去的面板若立即降层，
  // 会从静态副岛底下穿过（ zIndex 竞态）；morph 完成后再降回折叠层
  const [elevated, setElevated] = useState(form === "expanded")
  useEffect(() => {
    if (form === "expanded") {
      setElevated(true)
      return
    }
    const timer = window.setTimeout(() => setElevated(false), MOVE_MS)
    return () => window.clearTimeout(timer)
  }, [form])

  // 回调走 ref，让 document 级监听器不用随回调重建
  const onActivateRef = useRef(onActivate)
  onActivateRef.current = onActivate
  const onDeactivateRef = useRef(onDeactivate)
  onDeactivateRef.current = onDeactivate
  const onCollapseRequestRef = useRef(onCollapseRequest)
  onCollapseRequestRef.current = onCollapseRequest

  const hold = useCallback(() => {
    holdCountRef.current += 1
  }, [])

  const release = useCallback(() => {
    holdCountRef.current = Math.max(0, holdCountRef.current - 1)
    if (holdCountRef.current === 0 && pendingLeaveRef.current) {
      pendingLeaveRef.current = false
      onDeactivateRef.current?.()
    }
  }, [])

  const holdApi = useMemo(() => ({ hold, release }), [hold, release])

  // 收起展开时统一 blur 岛内焦点（收起后 DOM 仍在，焦点残留会让按键落入虚空）
  useEffect(() => {
    if (form === "expanded") return
    const el = focusedElementRef.current
    if (el) {
      el.blur()
      focusedElementRef.current = null
    }
  }, [form])

  const handleMouseEnter = useCallback(() => {
    pendingLeaveRef.current = false
    onActivateRef.current?.()
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (holdCountRef.current > 0) {
      pendingLeaveRef.current = true
      return
    }
    // 正在输入框打字时鼠标滑出不收回（按钮等残留焦点不阻止收回）
    const el = focusedElementRef.current
    if (el && isTextEntryElement(el)) return
    onDeactivateRef.current?.()
  }, [])

  // Esc 收回（capture 阶段：岛内输入框会 stopPropagation，容器级监听先于它触发）
  useEffect(() => {
    if (form !== "expanded") return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      onCollapseRequestRef.current?.()
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [form])

  // 点击岛外（composedPath 穿透 Shadow DOM 判断，避免 retarget 误判）
  useEffect(() => {
    if (form !== "expanded") return
    const handlePointerDown = (event: MouseEvent) => {
      if (islandRef.current && event.composedPath().includes(islandRef.current)) return
      onCollapseRequestRef.current?.()
    }
    document.addEventListener("mousedown", handlePointerDown, true)
    return () => document.removeEventListener("mousedown", handlePointerDown, true)
  }, [form])

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

  const dims =
    form === "circle"
      ? { w: circleSize, h: circleSize, r: circleSize / 2 }
      : form === "pill"
        ? { w: pillWidth, h: pillHeight, r: uiRadius.pill }
        : { w: expandedWidth, h: clampedExpandedH, r: ISLAND_METRICS.expandedRadius }

  /** 层级：展开 > 刚收起（morph 中） > 静态折叠；退场球再低一级，塌缩时钻到聊天岛底下被吸收 */
  const zIndex = exiting
    ? uiLayer.island - 1
    : form === "expanded"
      ? uiLayer.islandExpanded
      : elevated
        ? uiLayer.islandMorph
        : uiLayer.island

  /**
   * 外层 wrapper 锚定样式：left + translateX 共同锁定一条边缘。
   * translateX 百分比基于自身宽度实时解析，宽度 morph 时位移随之变化，
   * 锚定边缘恒定不动（右锚位移 -100%、左锚 0、中心 -50%）。
   */
  const anchorStyle =
    anchor === "right"
      ? {
          left: `calc(50% + ${dualAnchor}px)`,
          transform: "translateX(-100%)",
          origin: "right center"
        }
      : anchor === "left"
        ? {
            left: `calc(50% - ${dualAnchor}px)`,
            transform: "translateX(0)",
            origin: "left center"
          }
        : {
            left: "50%",
            transform: "translateX(-50%)",
            origin: "center center"
          }

  /** 三层内容：各自固定尺寸居中，活动层浮现、非活动层缩小淡出 */
  const layers: Array<{ key: string; active: boolean; w: number; h: number; content: React.ReactNode; interactive: boolean }> = [
    { key: "circle", active: form === "circle", w: circleSize, h: circleSize, content: circleContent, interactive: false },
    { key: "pill", active: form === "pill", w: pillWidth, h: pillHeight, content: pillContent, interactive: true },
    { key: "expanded", active: form === "expanded", w: expandedWidth, h: clampedExpandedH, content: children, interactive: true }
  ]

  return (
    <div
      style={{
        position: "fixed",
        top: ISLAND_TOP,
        left: anchorStyle.left,
        transform: anchorStyle.transform,
        zIndex,
        pointerEvents: "none",
        transition: `left ${MOVE_MS}ms ${uiMotion.easingSpringGentle}, transform ${MOVE_MS}ms ${uiMotion.easingSpringGentle}`
      }}>
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
          // 未展开时点击岛 = 展开（触摸屏的主要入口；展开态点击交给内部组件）
          if (form !== "expanded") onActivateRef.current?.()
        }}
        style={{
          position: "relative",
          width: dims.w,
          height: dims.h,
          // 退场吸收的位移量（island-exit keyframes 内 var 引用，跟随动态锚点而非写死）
          ...({ ["--island-exit-shift"]: `${dualAnchor}px` } as React.CSSProperties),
          maxHeight: form === "expanded" ? "calc(100vh - 24px)" : undefined,
          borderRadius: dims.r,
          background: theme.bg.surface,
          border: `1px solid ${theme.border.default}`,
          boxShadow: surfaceShadow,
          overflow: "hidden",
          fontFamily: uiTypography.fontFamily,
          transformOrigin: anchorStyle.origin,
          transition: `width ${MORPH_MS}ms ${uiMotion.easingSpringGentle}, height ${MORPH_MS}ms ${uiMotion.easingSpringGentle}, border-radius ${MORPH_MS}ms ${uiMotion.easingSpringGentle}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
          cursor: form === "expanded" ? "default" : "pointer",
          animation: exiting
            ? `island-exit ${MOVE_MS}ms ${uiMotion.easingSpringGentle} forwards`
            : `island-enter 360ms ${uiMotion.easingSpringGentle} forwards`,
          pointerEvents: exiting ? "none" : "auto"
        }}>
        <IslandHoldContext.Provider value={holdApi}>
          {layers.map((layer) => (
            <div
              key={layer.key}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: layer.w,
                height: layer.h,
                transform: `translate(-50%, -50%) scale(${layer.active ? 1 : 0.92})`,
                opacity: layer.active ? 1 : 0,
                transition: `opacity 160ms ${uiMotion.easingStandard} ${layer.active ? 90 : 0}ms, transform 240ms ${uiMotion.easingSpringGentle}`,
                pointerEvents: layer.active && layer.interactive ? "auto" : "none",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                whiteSpace: "nowrap"
              }}>
              {layer.content}
            </div>
          ))}
        </IslandHoldContext.Provider>

        <style>{ISLAND_CSS}</style>
      </div>
    </div>
  )
}
