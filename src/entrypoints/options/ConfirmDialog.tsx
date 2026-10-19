import { useEffect, useRef } from "react"

import { Button } from "./ui"

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** 确认按钮的语义色：危险操作（默认）或主色 */
  tone?: "danger" | "primary"
}

/**
 * 二次确认弹层：打开时焦点落到「取消」，Tab 在弹层内循环（focus trap），Esc 取消。
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = "danger"
}: ConfirmDialogProps) {
  const titleId = "opt-confirm-title"
  const descriptionId = "opt-confirm-description"

  const cardRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== "Tab") {
        return
      }
      const nodes = cardRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!nodes || nodes.length === 0) {
        return
      }
      const list = Array.from(nodes)
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !cardRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  return (
    <div className="opt-modal-overlay" onClick={onCancel}>
      <div
        ref={cardRef}
        className="opt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}>
        <h2 id={titleId} className="opt-dialog-title">
          {title}
        </h2>
        <p id={descriptionId} className="opt-dialog-message">
          {message}
        </p>
        <div className="opt-dialog-actions">
          <button ref={cancelRef} type="button" className="opt-btn opt-btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <Button variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
