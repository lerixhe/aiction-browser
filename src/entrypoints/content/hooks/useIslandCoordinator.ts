import { useCallback, useEffect, useRef, useState } from "react"

import { ISLAND_METRICS } from "@/entrypoints/content/components/islandMetrics"
import type { IslandAnchor, IslandForm } from "@/entrypoints/content/components/DynamicIsland"

export type IslandId = "chat" | "tts"
export type { IslandAnchor, IslandForm } from "@/entrypoints/content/components/DynamicIsland"

/** 副岛 hover 后先长成胶囊、停顿再自动展开的间隔（等 circle→pill morph 基本完成） */
const PILL_PAUSE_MS = 320
/** 鼠标移出展开面板后自动收回的延迟 */
const HOVER_COLLAPSE_MS = 300
/** 流式首个 token 后自动展开的延迟（等岛入场动画结束） */
const AUTO_EXPAND_DELAY_MS = 400
/** 对话完成/取消后无交互自动清空、回到笑脸 idle 态的时长 */
const CHAT_IDLE_RESET_MS = 8000

interface Options {
  /** TTS 是否激活（朗读岛存在） */
  ttsActive: boolean
  /** 聊天是否处于「完成/取消」终态（终态闲置一段时间后自动清空对话） */
  chatSettled: boolean
  /** 闲置清空回调（清空本轮对话，岛回到笑脸 idle 态） */
  onChatIdleReset: () => void
}

/**
 * 双灵动岛协调器：跨岛的主副关系、展开唯一性与 hover 交互序列都集中在这里。
 *
 * 形态规则（仿 iOS 灵动岛）：
 * - 展开的岛至多一个，展开者占据视觉中心（left → 50%）并遮盖另一个岛
 * - 双岛并存时只有主岛可以是胶囊，副岛缩小为圆点；后触发者成为主岛
 * - 聊天岛永远在左（锁左缘）、朗读岛永远在右（锁右缘）；单岛时回到页面正中
 *
 * hover 序列：
 * - 悬停主岛 → 直接展开；移出展开区 300ms 后还原为双岛
 * - 悬停副岛 → 副岛先长成胶囊（主副互换、原主岛缩为圆点），停顿后自动展开
 */
export function useIslandCoordinator({ ttsActive, chatSettled, onChatIdleReset }: Options) {
  const [primaryIsland, setPrimaryIsland] = useState<IslandId>("chat")
  const [expandedIsland, setExpandedIsland] = useState<IslandId | null>(null)
  /** 鼠标当前悬停的岛（取消「完成态闲置清空」计时） */
  const [hoveringIsland, setHoveringIsland] = useState<IslandId | null>(null)

  const primaryRef = useRef(primaryIsland)
  primaryRef.current = primaryIsland
  const expandedRef = useRef(expandedIsland)
  expandedRef.current = expandedIsland

  /** 用户主动收起聊天后，本轮流式不再自动展开（新请求时重置） */
  const suppressAutoExpandRef = useRef(false)
  /** 本轮流式已自动展开过一次 */
  const autoExpandedRef = useRef(false)

  const expandTimerRef = useRef<number | null>(null)
  const collapseTimerRef = useRef<number | null>(null)

  const clearExpandTimer = useCallback(() => {
    if (expandTimerRef.current != null) {
      window.clearTimeout(expandTimerRef.current)
      expandTimerRef.current = null
    }
  }, [])

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current != null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }, [])

  /** 排定一次展开：到点时若已有岛展开（期间用户悬停了别的岛）则让位 */
  const scheduleExpand = useCallback(
    (id: IslandId, delay: number) => {
      clearExpandTimer()
      expandTimerRef.current = window.setTimeout(() => {
        expandTimerRef.current = null
        if (expandedRef.current != null) return
        setPrimaryIsland(id)
        setExpandedIsland(id)
      }, delay)
    },
    [clearExpandTimer]
  )

  /** 鼠标进入 / 点击某个岛 */
  const activateIsland = useCallback(
    (id: IslandId) => {
      setHoveringIsland(id)
      clearCollapseTimer()
      clearExpandTimer()
      if (expandedRef.current === id) return

      if (expandedRef.current != null) {
        // 另一个岛正展开：立即收回它（expanded → circle 直接 morph），本岛接管主位
        setExpandedIsland(null)
        setPrimaryIsland(id)
        scheduleExpand(id, PILL_PAUSE_MS)
        return
      }

      if (primaryRef.current !== id) {
        // 副岛：circle → pill（主副互换，原主岛缩为圆点）→ 停顿 → 自动展开
        setPrimaryIsland(id)
        scheduleExpand(id, PILL_PAUSE_MS)
        return
      }

      // 主岛：直接展开
      setExpandedIsland(id)
    },
    [clearCollapseTimer, clearExpandTimer, scheduleExpand]
  )

  /** 鼠标移出某个岛（取消排定的展开序列；展开中的岛延迟收回） */
  const deactivateIsland = useCallback(
    (id: IslandId) => {
      setHoveringIsland(null)
      clearExpandTimer()
      if (expandedRef.current !== id) return
      clearCollapseTimer()
      collapseTimerRef.current = window.setTimeout(() => {
        collapseTimerRef.current = null
        if (expandedRef.current !== id) return
        if (id === "chat") suppressAutoExpandRef.current = true
        setExpandedIsland(null)
      }, HOVER_COLLAPSE_MS)
    },
    [clearCollapseTimer, clearExpandTimer]
  )

  /** 请求收起展开（Esc / 点击岛外 / 面板收起按钮）：岛保留，对话保留 */
  const collapseIsland = useCallback(
    (id: IslandId) => {
      clearExpandTimer()
      clearCollapseTimer()
      if (expandedRef.current !== id) return
      setExpandedIsland(null)
      if (id === "chat") suppressAutoExpandRef.current = true
    },
    [clearCollapseTimer, clearExpandTimer]
  )

  /** 流式首个 token 到达：自动展开一次（用户收起过则本轮忽略；已有展开让位） */
  const requestAutoExpand = useCallback(
    (id: IslandId) => {
      if (autoExpandedRef.current || suppressAutoExpandRef.current) return
      if (expandedRef.current != null) return
      autoExpandedRef.current = true
      scheduleExpand(id, AUTO_EXPAND_DELAY_MS)
    },
    [scheduleExpand]
  )

  /** 新请求触发（发起对话 / 开始朗读）：后触发者成为主岛，重置自动展开窗口 */
  const markIslandTriggered = useCallback((id: IslandId) => {
    suppressAutoExpandRef.current = false
    autoExpandedRef.current = false
    setPrimaryIsland(id)
  }, [])

  // TTS 结束：收回朗读岛展开态、主岛归还聊天（聊天是常驻岛，必须能回到胶囊）
  useEffect(() => {
    if (ttsActive) return
    clearExpandTimer()
    clearCollapseTimer()
    setExpandedIsland((prev) => (prev === "tts" ? null : prev))
    setPrimaryIsland((prev) => (prev === "tts" ? "chat" : prev))
  }, [ttsActive, clearExpandTimer, clearCollapseTimer])

  // 卸载时清理计时器
  useEffect(() => {
    return () => {
      if (expandTimerRef.current != null) window.clearTimeout(expandTimerRef.current)
      if (collapseTimerRef.current != null) window.clearTimeout(collapseTimerRef.current)
    }
  }, [])

  // 完成态闲置：done/cancelled 后一段时间无交互（未展开、未悬停）自动清空对话
  useEffect(() => {
    if (!chatSettled) return
    if (expandedIsland === "chat" || hoveringIsland === "chat") return
    const timer = window.setTimeout(onChatIdleReset, CHAT_IDLE_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [chatSettled, expandedIsland, hoveringIsland, onChatIdleReset])

  // ---------- 形态与锚定推导 ----------

  const chatForm: IslandForm = expandedIsland === "chat"
    ? "expanded"
    : ttsActive && primaryIsland !== "chat"
      ? "circle"
      : "pill"

  const ttsForm: IslandForm | null = !ttsActive
    ? null
    : expandedIsland === "tts"
      ? "expanded"
      : primaryIsland === "tts"
        ? "pill"
        : "circle"

  /**
   * 水平锚定：双岛时聊天岛锁定左缘、朗读岛锁定右缘（morph 期间外缘纹丝不动，
   * 近端边缘在间隙里此消彼长）；单岛与展开态锚定中心。
   */
  const chatAnchor: IslandAnchor = ttsActive && chatForm !== "expanded" ? "left" : "center"
  const ttsAnchor: IslandAnchor = ttsActive && ttsForm !== "expanded" ? "right" : "center"

  return {
    primaryIsland,
    expandedIsland,
    chatForm,
    ttsForm,
    chatAnchor,
    ttsAnchor,
    activateIsland,
    deactivateIsland,
    collapseIsland,
    requestAutoExpand,
    markIslandTriggered
  }
}
