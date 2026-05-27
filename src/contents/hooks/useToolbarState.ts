import { useCallback, useEffect, useRef, useState } from "react"

import { getSettings } from "~/shared/storage"
import type { ActionTemplate, SelectionAnchor, SelectionContext, ToolbarMode } from "~/shared/types"

/**
 * Hook for managing toolbar state and custom actions
 */
export function useToolbarState() {
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [toolbarAnchor, setToolbarAnchor] = useState<SelectionAnchor | null>(null)
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null)
  const [actions, setActions] = useState<ActionTemplate[]>([])
  const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("explode")

  const toolbarVisibleRef = useRef(false)
  const selectionContextRef = useRef<SelectionContext | null>(null)

  // Sync refs with state
  useEffect(() => {
    toolbarVisibleRef.current = toolbarVisible
  }, [toolbarVisible])

  useEffect(() => {
    selectionContextRef.current = selectionContext
  }, [selectionContext])

  // Load actions from settings
  useEffect(() => {
    void getSettings().then((settings) => {
      setActions(settings.actions.filter((a) => a.enabled !== false))
      setToolbarMode(settings.toolbarMode)
    })

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (_changes, areaName) => {
      if (areaName !== "sync") {
        return
      }

      void getSettings().then((settings) => {
        setActions(settings.actions.filter((a) => a.enabled !== false))
        setToolbarMode(settings.toolbarMode)
      })
    }

    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => chrome.storage.onChanged.removeListener(onStorageChanged)
  }, [])

  // Close toolbar
  const closeToolbar = useCallback(() => {
    setToolbarVisible(false)
    setToolbarAnchor(null)
    setSelectionContext(null)
  }, [])

  // Open toolbar with context and anchor
  const openToolbar = useCallback((context: SelectionContext, anchor: SelectionAnchor) => {
    setSelectionContext(context)
    setToolbarAnchor(anchor)
    setToolbarVisible(true)
  }, [])

  // Check if toolbar has captured page selection
  const hasCapturedPageSelection = useCallback(() => {
    return toolbarVisibleRef.current && selectionContextRef.current != null
  }, [])

  // Check if toolbar should be preserved
  const shouldPreserveToolbar = useCallback(
    (target: EventTarget | null, isInsideExtension: boolean, isExtensionFocused: boolean) => {
      return hasCapturedPageSelection() && (isInsideExtension || isExtensionFocused)
    },
    [hasCapturedPageSelection]
  )

  return {
    toolbarVisible,
    toolbarAnchor,
    selectionContext,
    actions,
    toolbarMode,
    toolbarVisibleRef,
    selectionContextRef,
    closeToolbar,
    openToolbar,
    hasCapturedPageSelection,
    shouldPreserveToolbar
  }
}
