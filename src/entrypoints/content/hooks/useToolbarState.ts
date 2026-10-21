import { useCallback, useEffect, useRef, useState } from "react"

import { getSettings } from "@/shared/storage"
import { trackEvent, lengthBucket, type AnalyticsSource } from "@/shared/analytics"
import type { ActionTemplate, QuickAction, SelectionAnchor, SelectionContext } from "@/shared/types"

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
  /** 上次上报的工具栏落位；同一落位的重复触发不算新的渲染 */
  const lastShownKeyRef = useRef<string | null>(null)

  // Sync refs with state
  useEffect(() => {
    toolbarVisibleRef.current = toolbarVisible
  }, [toolbarVisible])

  useEffect(() => {
    selectionContextRef.current = selectionContext
  }, [selectionContext])

  // Load actions from settings
  useEffect(() => {
    const loadActions = () => {
      void getSettings().then((settings) => {
        setActions(settings.actions.filter((a) => a.enabled !== false))
        setQuickActions(settings.quickActions.filter((a) => a.enabled))
      })
    }

    loadActions()

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (_changes, areaName) => {
      if (areaName !== "sync") {
        return
      }

      loadActions()
    }

    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => chrome.storage.onChanged.removeListener(onStorageChanged)
  }, [])

  // Close toolbar
  const closeToolbar = useCallback(() => {
    setToolbarVisible(false)
    setToolbarAnchor(null)
    setSelectionContext(null)
    // 收起后再次出现算一次新的渲染
    lastShownKeyRef.current = null
  }, [])

  // Open toolbar with context and anchor
  const openToolbar = useCallback((context: SelectionContext, anchor: SelectionAnchor) => {
    setSelectionContext(context)
    setToolbarAnchor(anchor)
    setToolbarVisible(true)

    // 划词流失率埋点：工具栏出现 = 1 次渲染；可见期间没有位移的重复触发不重复计
    const shownKey = `${anchor.mouseX},${anchor.mouseY}`
    if (lastShownKeyRef.current !== shownKey) {
      lastShownKeyRef.current = shownKey
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
