import { useCallback, useEffect, useRef, useState } from "react"

import type { ChatSessionInit } from "@/entrypoints/content/components/ChatSession"

/** App / PdfViewer 持有的对话会话：init 快照 + 钉住状态 + 防抖命中提示信号 */
export interface ManagedChatSession extends ChatSessionInit {
  pinned: boolean
  /**
   * 递增信号：防抖命中时要求该实例闪一圈主色脉冲（不重新请求、也不改位置）。
   * 命中是静默的话，用户会以为按钮坏了（卡片可能只是滚出了视口）。
   */
  revealNonce: number
}

/**
 * 对话会话管理（多实例并存）：
 * - 新触发总是**追加**全新会话实例，与既有实例（含钉住的）并存；销毁只发生在单个实例关闭时
 * - 防抖：存在解析 prompt 相同的未关闭会话（同动作同选区重复点击）时不再新建，
 *   而是让那个实例闪一圈主色脉冲（`revealSession`）作为反馈；相应会话被关闭后才能重新响应
 * - 关闭路径：× / 点外（未钉住）由面板自身处理并回收单例；Esc 由本 hook统一监听，
 *   每按一次关闭（销毁）最新创建的一个对话窗
 */
export function useChatSessions() {
  const [sessions, setSessions] = useState<ManagedChatSession[]>([])
  const nextSessionIdRef = useRef(1)

  /** 会话列表快照（防抖判断直接用已提交的 state，不用 ref 镜像） */

  /**
   * 追加全新会话实例（与既有实例并存；新实例默认不钉住，位置按当前工具栏落位锚定）。
   *
   * 这里的同 prompt 去重是**最后一道闸**：触发路径已做同步判断（见 App.handleAction），
   * 但那条判断依赖已提交的 state，同一宏任务内重复触发仍可能双双通过，
   * 所以在 updater 里用 prev 再做一次原子判断（id 已在外面生成，去重命中只是浪费一个序号）。
   */
  const openSession = useCallback((session: Omit<ChatSessionInit, "id">) => {
    const id = nextSessionIdRef.current++
    setSessions((prev) => {
      if (prev.some((s) => s.initialPrompt === session.initialPrompt)) {
        return prev
      }
      return [...prev, { ...session, pinned: false, revealNonce: 0, id }]
    })
  }, [])

  /** 关闭单个会话：实例销毁（卸载时中断流式并清理节流定时器） */
  const closeSession = useCallback((id: number) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  /** 钉子状态回写（写入同一对象，不重建会话实例） */
  const setSessionPinned = useCallback((id: number, pinned: boolean) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, pinned } : s)))
  }, [])

  /**
   * 防抖判断：返回仍开着的相同 prompt 会话（含钉住的），没有则 null。
   *
   * 直接用已提交的 state（而不是在渲染期写 ref 镜像）：事件处理器闭包里的 sessions
   * 就是最近一次已提交的值，而「渲染期写 ref」在并发渲染被中断/丢弃时会留下
   * 一个从未提交的快照，据此算出的 id 在已提交列表里根本不存在，
   * `revealSession` 就会匹配不上、闪烁信号也就发不出去。
   */
  const findSessionForPrompt = useCallback(
    (prompt: string) => sessions.find((s) => s.initialPrompt === prompt) ?? null,
    [sessions]
  )

  /** 防抖命中反馈：让该会话的卡片闪一圈主色脉冲（不重新请求，也不改位置） */
  const revealSession = useCallback((id: number) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, revealNonce: s.revealNonce + 1 } : s)))
  }, [])

  // Esc 依次关闭最新创建的对话窗（一次一个；IME 组合中的 Esc 是输入法行为，忽略）。
  // Esc 从逐面板监听上移到本 hook：多实例并存时避免一次按键连环关闭所有面板。
  useEffect(() => {
    if (sessions.length === 0) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      setSessions((prev) => prev.slice(0, -1))
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [sessions.length])

  return { sessions, openSession, closeSession, setSessionPinned, findSessionForPrompt, revealSession }
}
