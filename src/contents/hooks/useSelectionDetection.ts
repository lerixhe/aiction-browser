import { useCallback, useEffect, useRef } from "react"

import { getSelectionSnapshot } from "~/shared/selection"
import type { SelectionAnchor, SelectionContext } from "~/shared/types"

import {
  hasSelectionInsideExtensionUi,
  isExtensionUiFocused,
  isInsideExtensionEvent
} from "~/contents/utils/domUtils"

interface UseSelectionDetectionOptions {
  extensionRootRef: React.RefObject<HTMLElement | null>
  onSelectionChange: (context: SelectionContext | null, anchor: SelectionAnchor | null) => void
  isToolbarVisible: () => boolean
}

/**
 * Hook for detecting text selection on the page
 */
export function useSelectionDetection({
  extensionRootRef,
  onSelectionChange,
  isToolbarVisible
}: UseSelectionDetectionOptions) {
  const rafIdRef = useRef<number | null>(null)
  const lastAnchorRef = useRef<SelectionAnchor | null>(null)
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const updateSelection = useCallback(
    (event?: Event) => {
      if (rafIdRef.current != null) {
        window.cancelAnimationFrame(rafIdRef.current)
      }

      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null

        if (isExtensionUiFocused(extensionRootRef.current)) {
          return
        }

        if (hasSelectionInsideExtensionUi(extensionRootRef.current)) {
          return
        }

        // Capture mouse position from the triggering event
        if (event instanceof MouseEvent) {
          lastMouseRef.current = { x: event.clientX, y: event.clientY }
        }
        const mouse = lastMouseRef.current

        const target = event?.target ?? null
        const snapshot = getSelectionSnapshot(target)

        if (!snapshot) {
          onSelectionChange(null, null)
          return
        }

        let anchor = snapshot.anchor

        if (!anchor && event instanceof MouseEvent) {
          anchor = {
            x: event.clientX,
            y: event.clientY,
            rectRight: event.clientX,
            mouseX: event.clientX,
            mouseY: event.clientY
          }
        }

        if (!anchor && lastAnchorRef.current) {
          anchor = lastAnchorRef.current
        }

        if (!anchor) {
          onSelectionChange(null, null)
          return
        }

        // Stamp mouse position onto the anchor
        anchor = { ...anchor, mouseX: mouse.x, mouseY: mouse.y }

        lastAnchorRef.current = anchor
        onSelectionChange(snapshot.context, anchor)
      })
    },
    [extensionRootRef, onSelectionChange]
  )

  useEffect(() => {
    const isInsideExtension = (event: Event) =>
      isInsideExtensionEvent(event, extensionRootRef.current)

    const readSelectionText = () => {
      if (isExtensionUiFocused(extensionRootRef.current) || hasSelectionInsideExtensionUi(extensionRootRef.current)) {
        return ""
      }
      const snapshot = getSelectionSnapshot(null)
      return snapshot?.context.text.trim() ?? ""
    }

    const onPointerUp = (event: PointerEvent) => {
      if (isInsideExtension(event)) {
        return
      }

      updateSelection(event)
    }

    const handleSelectionChangeEvent = (event: Event) => {
      // When toolbar is visible, ignore all selection changes — the editor is the source of truth
      if (isToolbarVisible()) {
        return
      }

      if (isExtensionUiFocused(extensionRootRef.current) || hasSelectionInsideExtensionUi(extensionRootRef.current)) {
        return
      }

      if (!readSelectionText()) {
        onSelectionChange(null, null)
        return
      }

      updateSelection(event)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (isInsideExtension(event)) {
        return
      }

      if (!readSelectionText()) {
        return
      }

      updateSelection(event)
    }

    const onFocusIn = (event: FocusEvent) => {
      if (isInsideExtension(event)) {
        return
      }

      updateSelection(event)
    }

    // Unified click-outside: any pointerdown outside the extension UI closes everything
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (isInsideExtension(event)) {
        return
      }

      // Click outside extension UI → close toolbar
      onSelectionChange(null, null)
    }

    document.addEventListener("pointerup", onPointerUp, true)
    document.addEventListener("selectionchange", handleSelectionChangeEvent, true)
    document.addEventListener("keyup", onKeyUp, true)
    document.addEventListener("focusin", onFocusIn, true)
    document.addEventListener("pointerdown", onDocumentPointerDown, true)

    return () => {
      if (rafIdRef.current != null) {
        window.cancelAnimationFrame(rafIdRef.current)
      }

      document.removeEventListener("pointerup", onPointerUp, true)
      document.removeEventListener("selectionchange", handleSelectionChangeEvent, true)
      document.removeEventListener("keyup", onKeyUp, true)
      document.removeEventListener("focusin", onFocusIn, true)
      document.removeEventListener("pointerdown", onDocumentPointerDown, true)
    }
  }, [extensionRootRef, updateSelection, isToolbarVisible, onSelectionChange])

  return {}
}
