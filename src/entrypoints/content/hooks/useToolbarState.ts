import { useCallback, useEffect, useRef, useState } from "react"

import { getSettings } from "@/shared/storage"
import { trackEvent, lengthBucket, type AnalyticsSource } from "@/shared/analytics"
import type { ActionTemplate, QuickAction, SelectionAnchor, SelectionContext } from "@/shared/types"

/** 划词工具栏出现事件的节流窗口：同一页连续划词只保留一条 */
const TOOLBAR_SHOWN_THROTTLE_MS = 5000

/**
 * Hook for managing toolbar state and custom actions
 * @param source 触发来源（web / pdf），仅作为埋点维度
 */
export function useToolbarState(source: AnalyticsSource = "web") {
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [toolbarAnchor, setToolbarAnchor] = useState<SelectionAnchor | null>(null)
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null)
  const [actions, setActions] = useState<ActionTemplate[]>([])
  const [quickActions, setQuickActions] = useState<QuickAction[]>([])

  const toolbarVisibleRef = useRef(false)
  const selectionContextRef = useRef<SelectionContext | null>(null)
  const lastToolbarShownAtRef = useRef(0)

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
      setQuickActions(settings.quickActions.filter((a) => a.enabled))
    })

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (_changes, areaName) => {
      if (areaName !== "sync") {
        return
      }

      void getSettings().then((settings) => {
        setActions(settings.actions.filter((a) => a.enabled !== false))
        setQuickActions(settings.quickActions.filter((a) => a.enabled))
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

    // 划词流失率：工具栏出现次数 vs action_clicked 次数（节流，避免连续划词刷量）
    const now = Date.now()
    if (now - lastToolbarShownAtRef.current >= TOOLBAR_SHOWN_THROTTLE_MS) {
      lastToolbarShownAtRef.current = now
      void trackEvent("selection_toolbar_shown", {
        source,
        char_length_bucket: lengthBucket(context.text.length)
      })
    }
  }, [source])

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
    quickActions,
    toolbarVisibleRef,
    selectionContextRef,
    closeToolbar,
    openToolbar,
    hasCapturedPageSelection,
    shouldPreserveToolbar
  }
}
