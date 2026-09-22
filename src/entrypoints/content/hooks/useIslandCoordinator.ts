import { useCallback, useEffect, useRef, useState } from "react"

import { ISLAND_METRICS } from "@/entrypoints/content/components/islandMetrics"
import type { IslandAnchor, IslandForm } from "@/entrypoints/content/components/DynamicIsland"

export type IslandId = "chat" | "tts"
export type { IslandAnchor, IslandForm } from "@/entrypoints/content/components/DynamicIsland"

/** 鼠标移出展开面板后自动收回的延迟 */
const HOVER_COLLAPSE_MS = 300
/** 流式首个 token 后自动自动展开的延迟（等岛入场动画结束） */
const AUTO_EXPAND_DELAY_MS = 400
/** 对话完成/取消后无交互自动清空、回到笑脸 idle 态的时长 */
const CHAT_IDLE_RESET_MS = 8000

interface Options {
  /** 朗读是否激活（朗读岛存在） */
  ttsActive: boolean
  /** 朗读退场动画进行中：球播放吸收动画，聊天岛同时回中 */
  ttsExiting?: boolean
  /** 朗读播放完毕（finished 态），闲置退场计时开始 */
  ttsFinished?: boolean
  /** finished 闲置到期：由 App 启动退场动画（随后 stop 卸载） */
  onTtsDismiss?: () => void
  /** 聊天是否处于「完成/取消」终态（终态闲置一段时间后自动清空对话） */
  chatSettled: boolean
  /** 闲置清空回调（清空本轮对话，岛回到笑脸 idle 态） */
  onChatIdleReset: () => void
}

/**
 * 双灵动岛协调器：展开唯一性与 hover 交互序列集中在这里。
 *
 * 形态固定（无主副互换）：
 * - 聊天岛常驻，只在 pill（折叠）⇄ expanded（面板）之间切换
 * - 朗读岛按需出现，只在 circle（圆球）⇄ expanded（控制条）之间切换
 * - 双岛并存时聊天岛锁定左缘、朗读岛锁定右缘；单岛与展开态锚定页面正中
 *
 * hover 序列：悬停任一岛直接展开；移出展开区 300ms 后还原。
 *
 * 朗读退场：finished 后闲置 5s（未悬停、未展开）触发 onTtsDismiss，
 * App 播放吸收动画（球缩小左移淡出、聊天岛回中）后 stop 卸载。
 */
export function useIslandCoordinator({
  ttsActive,
  ttsExiting,
  ttsFinished,
  onTtsDismiss,
  chatSettled,
  onChatIdleReset
}: Options) {
  const [expandedIsland, setExpandedIsland] = useState<IslandId | null>(null)
  /** 鼠标当前悬停的岛（取消「完成态闲置清空」计时） */
  const [hoveringIsland, setHoveringIsland] = useState<IslandId | null>(null)

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

  /** 排定一次延迟展开（自动展开用）：到点时若已有岛展开则让位 */
  const scheduleExpand = useCallback(
    (id: IslandId, delay: number) => {
      clearExpandTimer()
      expandTimerRef.current = window.setTimeout(() => {
        expandTimerRef.current = null
        if (expandedRef.current != null) return
        setExpandedIsland(id)
      }, delay)
    },
    [clearExpandTimer]
  )

  /** 鼠标进入 / 点击某个岛：直接展开（形态固定，无主副互换序列） */
  const activateIsland = useCallback(
    (id: IslandId) => {
      setHoveringIsland(id)
      clearCollapseTimer()
      clearExpandTimer()
      if (expandedRef.current === id) return
      // 展开唯一：另一岛若正展开，本次 set 同时收回它（两个岛独立 morph）
      setExpandedIsland(id)
    },
    [clearCollapseTimer, clearExpandTimer]
  )

  /** 鼠标移出某个岛（取消排定的展开；展开中的岛延迟收回） */
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
    [clearExpandTimer, clearCollapseTimer]
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

  /** 新请求触发（发起对话 / 开始朗读）：重置自动展开窗口，并收起另一岛的展开态 */
  const markIslandTriggered = useCallback(
    (id: IslandId) => {
      clearExpandTimer()
      clearCollapseTimer()
      suppressAutoExpandRef.current = false
      autoExpandedRef.current = false
      // 新任务反馈不能被对方的展开面板遮住：收起非本岛的展开
      setExpandedIsland((prev) => (prev === id ? prev : null))
    },
    [clearExpandTimer, clearCollapseTimer]
  )

  // 朗读退场动画开始：收回朗读岛展开态（吸收动画在圆球形态下播放）
  useEffect(() => {
    if (!ttsExiting) return
    clearExpandTimer()
    clearCollapseTimer()
    setExpandedIsland((prev) => (prev === "tts" ? null : prev))
  }, [ttsExiting, clearExpandTimer, clearCollapseTimer])

  // 朗读彻底结束（idle）：兜底收回展开态，避免残留到下一次朗读
  useEffect(() => {
    if (ttsActive) return
    clearExpandTimer()
    clearCollapseTimer()
    setExpandedIsland((prev) => (prev === "tts" ? null : prev))
  }, [ttsActive, clearExpandTimer, clearCollapseTimer])

  // 卸载时清理计时器
  useEffect(() => {
    return () => {
      if (expandTimerRef.current != null) window.clearTimeout(expandTimerRef.current)
      if (collapseTimerRef.current != null) window.clearTimeout(collapseTimerRef.current)
    }
  }, [])

  /**
   * 朗读退场倒计时是否在跑（finished 且未悬停/未展开/未退场中）。
   * 圆环进度条的唯一计时事实来源：与下方退场 setTimeout 同帧启停——
   * 悬停/展开时同时暂停（清 timer + 卸载环），移开后同时从头重新计 5s。
   */
  const ttsDismissCounting =
    !!ttsFinished && !!onTtsDismiss && !ttsExiting && expandedIsland !== "tts" && hoveringIsland !== "tts"

  // 朗读完毕闲置：finished 后一段时间无交互（未展开、未悬停）触发退场
  useEffect(() => {
    if (!ttsDismissCounting) return
    const timer = window.setTimeout(onTtsDismiss!, ISLAND_METRICS.ttsDismissMs)
    return () => window.clearTimeout(timer)
  }, [ttsDismissCounting, onTtsDismiss])

  // 完成态闲置：done/cancelled 后一段时间无交互（未展开、未悬停）自动清空对话
  useEffect(() => {
    if (!chatSettled) return
    if (expandedIsland === "chat" || hoveringIsland === "chat") return
    const timer = window.setTimeout(onChatIdleReset, CHAT_IDLE_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [chatSettled, expandedIsland, hoveringIsland, onChatIdleReset])

  // ---------- 形态与锚定推导 ----------

  // 聊天岛：pill ⇄ expanded（永不做圆点）
  const chatForm: IslandForm = expandedIsland === "chat" ? "expanded" : "pill"

  // 朗读岛：circle ⇄ expanded（永不做胶囊）；退场动画强制收成圆球
  const ttsForm: IslandForm | null = !ttsActive
    ? null
    : ttsExiting || expandedIsland !== "tts"
      ? "circle"
      : "expanded"

  /**
   * 水平锚定：双岛时聊天岛锁定左缘、朗读岛锁定右缘（外缘纹丝不动）；
   * 单岛与展开态锚定中心。退场瞬间（ttsExiting）聊天岛即回中，
   * 与朗读球的吸收动画同帧开始。
   */
  const dualLayout = ttsActive && !ttsExiting
  const chatAnchor: IslandAnchor = dualLayout && chatForm !== "expanded" ? "left" : "center"
  const ttsAnchor: IslandAnchor = ttsForm !== "expanded" ? "right" : "center"

  return {
    expandedIsland,
    ttsDismissCounting,
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
