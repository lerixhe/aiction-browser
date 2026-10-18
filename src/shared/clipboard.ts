/**
 * 剪贴板写入（内容脚本 / 页面上下文共用）。
 *
 * 优先用异步 Clipboard API；被拒（非安全上下文、无用户手势、权限策略等）时退到
 * `execCommand("copy")` 兜底。兜底路径必须保证「复制」不产生副作用：
 * 不改变页面选区、不抢走焦点——否则复制动作会把划词工具栏/选区上下文弄丢。
 */

/**
 * Clipboard API 被拒时的兜底复制。
 *
 * 首选：直接对页面现有选区执行 `execCommand("copy")`——不创建、不聚焦任何节点，
 * 因此不会触发 focusin / selectionchange 相关的选区重算（工具栏与选区保持原样）。
 * 选区不可用时才退到离屏 textarea，并在复制后还原选区与焦点——
 * 兜底路径同样不能让复制按钮成为「会关掉工具栏」的特例。
 */
export function copyTextFallback(text: string) {
  const selection = window.getSelection()

  if (selection && !selection.isCollapsed) {
    try {
      if (document.execCommand("copy")) return
    } catch {
      // 继续走 textarea 方案
    }
  }

  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
    : []
  const previousActive = document.activeElement as HTMLElement | null

  const textarea = document.createElement("textarea")
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "0"
  textarea.style.opacity = "0"
  textarea.style.pointerEvents = "none"
  document.body.appendChild(textarea)
  textarea.value = text
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)

  if (selection) {
    selection.removeAllRanges()
    ranges.forEach((range) => selection.addRange(range))
  }
  if (previousActive && previousActive !== document.body) {
    previousActive.focus?.()
  }
}

/** 写入剪贴板：成功返回 true（失败不抛错，调用方按需给反馈） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      copyTextFallback(text)
      return true
    } catch {
      return false
    }
  }
}
