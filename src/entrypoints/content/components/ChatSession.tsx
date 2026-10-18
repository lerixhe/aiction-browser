import { useEffect, useRef } from "react"

import ChatPanel from "@/entrypoints/content/components/ChatPanel"
import type { AnchorRect } from "@/entrypoints/content/components/floating"
import { useChatState } from "@/entrypoints/content/hooks/useChatState"
import type { SelectionContext } from "@/shared/types"

/** 单个对话会话的初始快照（触发动作时刻解析，实例存续期间不再变化） */
export interface ChatSessionInit {
  /** 会话唯一 id（父级以它作为 React key，变更即销毁旧实例、重建新实例） */
  id: number
  /** 锚定矩形：触发时刻快照的工具栏落位（文档坐标） */
  anchor: AnchorRect | null
  /** 触发时的选区文本（快照，目前仅用于空状态文案区分） */
  capturedText: string
  /** 选区上下文（用于 system prompt 与后续追问） */
  context: SelectionContext
  /**
   * 会话首个 prompt（动作模板解析 / 自由输入拼装的结果）：
   * - 挂载即自动发送
   * - 同时充当防抖键：同一动作在同一选区上的重复点击（prompt 相同），
   *   只要本会话未关闭，父级就不重复响应；命中时本实例会闪一圈脉冲作为反馈
   */
  initialPrompt: string
}

interface Props {
  init: ChatSessionInit
  /** 钉住状态（父级持有，跨渲染持久）；钉住后父级会保护本会话不被新触发替换 */
  pinned: boolean
  onPinnedChange: (pinned: boolean) => void
  /**
   * 递增信号：父级防抖命中时置位，要求本实例的卡片闪一圈主色脉冲（不动位置）。
   * 命中静默的话用户会以为按钮失效（卡片可能只是滚出了视口）。
   */
  revealNonce: number
  /** 关闭会话（父级销毁本实例） */
  onClose: () => void
}

/**
 * 单个对话会话实例：每个 action 触发独立创建一个，关闭即整体销毁。
 * 实例内部持有独立的 messages、流式请求 abort、输入框状态，
 * 互不与其它会话共享（卸载时中断流式并清理节流定时器）。
 */
export default function ChatSession({ init, pinned, revealNonce, onPinnedChange, onClose }: Props) {
  const chat = useChatState()

  /** 挂载即完成一次性初始化，防止意外重放（卸载后再挂载会是新实例，ref 自动归零） */
  const bootstrappedRef = useRef(false)

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true

    // 写入选区上下文（后续追问 sendPrompt 的兜底 context 取自 hook 内部 state）
    chat.setContext(init.context)

    // 会话创建即发送动作解析出的首个 prompt
    void chat.sendPrompt(init.initialPrompt, init.context)
    // 仅在挂载时执行一次：sendPrompt 的首帧闭包即足够（prompt/context 均来自快照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ChatPanel
      open
      anchor={init.anchor}
      capturedText={init.capturedText}
      messages={chat.messages}
      requestState={chat.requestState.status}
      modelName={chat.modelName}
      pinned={pinned}
      onPinChange={onPinnedChange}
      onSend={(input) => {
        void chat.sendPrompt(input)
      }}
      onStop={chat.stopStreaming}
      onClose={onClose}
      revealNonce={revealNonce}
    />
  )
}
