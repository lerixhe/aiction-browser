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

/**
 * 拖拽时的「最小可抓取区」（与面板尺寸无关，始终生效）：
 * 不管面板多矮多高，都只要求这两块留在视口内，其余部分允许溢出视口。
 * - 垂直：头部整条（拖拽手柄所在的 34px）再加一点，保证任何时候都抓得回来
 * - 水平：一截足够的宽度（头部中央的拖拽手柄仍在视口内），保证头部还拖得动
 * 两者都只在无其他办法时降级：面板比视口这侧还小时，拖动范围直接覆盖整个视口。
 */
export const DRAG_HEADER_KEEP = 44
export const DRAG_KEEP_VISIBLE_X = 200

/** 面板位置（绝对定位的文档坐标，即 CSS left/top） */
export interface PanelPos {
  left: number
  top: number
}

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
 * 把一块 w×h 的浮层钳制到「当前视口」内（入参/出参均为文档坐标）。
 * 水平方向用视口宽度而非文档宽度：工具栏是一次性浮层，横向滚出去就看不见了。
 * 整体超宽/超高（浮层比视口安全区还大）时不拉伸、不右移：贴左/上缘，右侧自然溢出。
 */
export function clampToViewportSafe(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const minX = window.scrollX + EDGE_INSET
  const maxX = window.scrollX + window.innerWidth - width - EDGE_INSET
  const minY = window.scrollY + EDGE_INSET
  const maxY = window.scrollY + window.innerHeight - height - EDGE_INSET
  return {
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY))
  }
}

/**
 * 当前视口的文档坐标安全区（进入口参数为 inset）。
 * 水平基准取「视口」而非文档宽度：面板是跟着文档滚的，横向滚出视口就等于看不见、
 * 也就抓不回来，所以边界必须以视口为准。
 */
function viewportSafeBounds(inset = EDGE_INSET): { left: number; top: number; right: number; bottom: number } {
  return {
    left: window.scrollX + inset,
    top: window.scrollY + inset,
    right: window.scrollX + window.innerWidth - inset,
    bottom: window.scrollY + window.innerHeight - inset
  }
}

/**
 * 拖拽边界（软，唯一一套）：
 * 只保证「最小可抓取区」留在视口内（头部手柄 / 一截宽度），其余部分允许溢出视口。
 *
 * 为什么不用「放得下就要求整块可见」：对话窗展开后高度接近视口高度，
 * 整块可见会把垂直可拖范围压到几十像素（700 高视口只能拖 44px），观感就是拖不动。
 * 为什么不做「不限范围」：面板能被拖出视口而彻底抓不回来（= 悬浮窗丢失），
 * 只能刷新页面自救，代价远大于多出来的自由度。
 *
 * 面板尺寸只影响“溢出多少”（可见区取 min），不影响边界规则本身。
 */
export function clampPanelDragPos(pos: PanelPos, width: number, height: number): PanelPos {
  const bounds = viewportSafeBounds()
  const visibleX = Math.min(DRAG_KEEP_VISIBLE_X, width)
  const visibleY = Math.min(DRAG_HEADER_KEEP, height)

  return {
    // 左缘允许拖出视口左侧，但保证右侧 visibleX 宽仍在视口内（反之同理）
    left: clamp(pos.left, bounds.left - (width - visibleX), Math.max(bounds.left, bounds.right - visibleX)),
    // 上缘不允许拖出视口（头部贴顶即止），下缘允许溢出：只留 visibleY 高在视口内
    top: clamp(pos.top, bounds.top, Math.max(bounds.top, bounds.bottom - visibleY))
  }
}

/**
 * 收敛（硬）：把面板尽量整块收回视口安全区，放不下时贴左上缘（不拉伸自身尺寸）。
 * 只在**位置仍归锚点/自动落位管**时使用（此时用户没表达过位置意图，
 * 内容长出来顶出视口就该拉回来）；用户拖过之后不再调用它，位置完全归用户。
 */
export function fitPanelInViewport(pos: PanelPos, width: number, height: number): PanelPos {
  const bounds = viewportSafeBounds()
  return {
    left: clamp(pos.left, bounds.left, Math.max(bounds.left, bounds.right - width)),
    top: clamp(pos.top, bounds.top, Math.max(bounds.top, bounds.bottom - height))
  }
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
