/**
 * 悬浮面板（对话窗 / 朗读控件）的公共定位逻辑。
 *
 * 所有面板统一锚定在划词工具栏触发时刻的文档坐标矩形上：
 * 触发后工具栏保持可见，但面板使用快照位置（随文档滚动，不跟随此后的工具栏拖拽）。
 */

/** 划词工具栏的文档坐标矩形（SelectionToolbar 通过 onRectChange 上报） */
export interface AnchorRect {
  x: number
  y: number
  width: number
  height: number
}

/** 面板与工具栏（或视口边缘）的间距 */
export const FLOATING_GAP = 8
/** 视口安全区内边距 */
export const EDGE_INSET = 8

export interface FloatingPlacement {
  /** 文档坐标（absolute left） */
  left: number
  /** 文档坐标（absolute top） */
  top: number
  /** 实际落位：工具栏下方 or 上方 */
  placement: "below" | "above"
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 当前视口下边缘的文档 Y 坐标 */
export function viewportBottomY(): number {
  return window.scrollY + window.innerHeight
}

/** 文档总宽度（用于水平钳制） */
export function documentWidth(): number {
  return Math.max(document.documentElement.clientWidth, document.documentElement.scrollWidth)
}

/**
 * 从选区锚点推导兜底锚定矩形（工具栏尚未上报落位时使用；
 * SelectionAnchor 的 x/y 为视口坐标，需要加滚动偏移转文档坐标）。
 */
export function fallbackAnchor(toolbarAnchor: { x: number; y: number } | null): AnchorRect | null {
  if (!toolbarAnchor) return null
  return {
    x: toolbarAnchor.x + window.scrollX,
    y: toolbarAnchor.y + window.scrollY,
    width: 0,
    height: 0
  }
}

/**
 * 在锚点矩形下方放置一块 w×h 的面板：
 * - 下方放得下 → 下方（水平以锚点中心对齐）
 * - 下方放不下但上方放得下 → 翻转到上方
 * - 两边都放不下 → 收敛回视口内（优先贴下边缘）
 * - 水平方向始终钳制在文档安全区内
 */
export function placeNearAnchor(
  anchor: AnchorRect,
  width: number,
  height: number,
  gap = FLOATING_GAP
): FloatingPlacement {
  const centerX = anchor.x + anchor.width / 2
  const left = clamp(centerX - width / 2, EDGE_INSET, Math.max(EDGE_INSET, documentWidth() - width - EDGE_INSET))

  const belowTop = anchor.y + anchor.height + gap
  const aboveTop = anchor.y - gap - height
  const viewportTop = window.scrollY + EDGE_INSET
  const bottom = viewportBottomY() - EDGE_INSET

  if (belowTop + height <= bottom) {
    return { left, top: belowTop, placement: "below" }
  }
  if (aboveTop >= viewportTop) {
    return { left, top: aboveTop, placement: "above" }
  }
  // 上下都放不下：夹回视口内（尽量靠下，保持「出现在附近」的感觉）
  return { left, top: clamp(belowTop, viewportTop, Math.max(viewportTop, bottom - height)), placement: "below" }
}
