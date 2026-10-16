import { useCallback, useEffect, useRef, useState } from "react"

import type { ChatSessionInit } from "@/entrypoints/content/components/ChatSession"

/** App / PdfViewer 持有的对话会话：init 快照 + 钉住状态（钉住期间不被新触发替换，而是与其它实例并存） */
export interface ManagedChatSession extends ChatSessionInit {
  pinned: boolean
}

/**
 * 对话会话管理（多实例并存）：
 * - 新触发总是**追加**全新会话实例，与既有实例（含钉住的）并存；销毁只发生在单个实例关闭时
 * - 防抖：存在解析 prompt 相同的未关闭会话（同动作同选区重复点击）时忽略本次触发；
 *   相应会话被关闭后才能重新响应
 * - 关闭路径：× / 点外（未钉住）由面板自身处理并回收单例；Esc 由本 hook统一监听，
 *   每按一次关闭（销毁）最新创建的一个对话窗
 */
export function useChatSessions() {
  const [sessions, setSessions] = useState<ManagedChatSession[]>([])
  const nextSessionIdRef = useRef(1)

  /** 会话数组实时快照（防抖判断走 ref，避免触发路径回调依赖数组而频繁重建） */
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  /** 追加全新会话实例（与既有实例并存；新实例默认不钉住，位置按当前工具栏落位锚定） */
  const openSession = useCallback((session: Omit<ChatSessionInit, "id">) => {
    setSessions((prev) => [...prev, { ...session, pinned: false, id: nextSessionIdRef.current++ }])
  }, [])

  /** 关闭单个会话：实例销毁（卸载时中断流式并清理节流定时器） */
  const closeSession = useCallback((id: number) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  /** 钉子状态回写（写入同一对象，不重建会话实例） */
  const setSessionPinned = useCallback((id: number, pinned: boolean) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, pinned } : s)))
  }, [])

  /** 防抖判断：存在仍开着的相同 prompt 会话（含钉住的）则本次触发应被忽略 */
  const hasSessionForPrompt = useCallback(
    (prompt: string) => sessionsRef.current.some((s) => s.initialPrompt === prompt),
    []
  )

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

  return { sessions, openSession, closeSession, setSessionPinned, hasSessionForPrompt }
}
