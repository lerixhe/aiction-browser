import { useCallback, useEffect, useRef, useState } from "react"

/** 保存成功后「✓ 已保存」的停留时长 */
const JUST_SAVED_MS = 2000

/**
 * 单值草稿（docs/OPTIONS_UI.md §5.1）。
 *
 * `committed` 仍是唯一真源：草稿只在上层浅拷贝，dirty 由「草稿 vs 已保存值」比较得出，
 * 外部值变化且本地无修改时自动跟随（导入配置 / 保存后回读）。
 */
export function useDraftState<T>(committed: T, isEqual: (a: T, b: T) => boolean = Object.is) {
  const [draft, setDraft] = useState<T>(committed)
  const [justSaved, setJustSaved] = useState(false)
  const isEqualRef = useRef(isEqual)
  const lastCommittedRef = useRef(committed)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    isEqualRef.current = isEqual
  }, [isEqual])

  useEffect(() => {
    const previous = lastCommittedRef.current
    lastCommittedRef.current = committed
    setDraft((current) => (isEqualRef.current(current, previous) ? committed : current))
  }, [committed])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const dirty = !isEqualRef.current(draft, committed)

  const markSaved = useCallback(() => {
    setJustSaved(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setJustSaved(false), JUST_SAVED_MS)
  }, [])

  const discard = useCallback(() => {
    setDraft(lastCommittedRef.current)
    setJustSaved(false)
  }, [])

  return { draft, setDraft, dirty, justSaved, markSaved, discard }
}

function defaultItemEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 按条目 id 保留的草稿表（docs/OPTIONS_UI.md §2.4 / §5.1）：
 * 改了 provider A 未保存就切到 B，A 的草稿留在内存并标记未保存点；
 * 只有保存 / 丢弃 / 组件卸载才丢弃。
 */
export function useDraftItemMap<T extends { id: string }>(
  committed: T[],
  isEqual: (a: T, b: T) => boolean = defaultItemEqual
) {
  const [drafts, setDrafts] = useState<Record<string, T>>({})
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const getCommitted = useCallback((id: string) => committed.find((item) => item.id === id), [committed])

  const getEffective = useCallback(
    (id: string) => drafts[id] ?? getCommitted(id),
    [drafts, getCommitted]
  )

  const isDirty = useCallback(
    (id: string) => {
      const draft = drafts[id]
      const current = getCommitted(id)
      return Boolean(draft && current && !isEqual(draft, current))
    },
    [drafts, getCommitted, isEqual]
  )

  const dirtyIds = committed.filter((item) => isDirty(item.id)).map((item) => item.id)

  const update = useCallback(
    (id: string, updater: (current: T) => T) => {
      setDrafts((prev) => {
        const base = prev[id] ?? committed.find((item) => item.id === id)
        if (!base) return prev
        return { ...prev, [id]: updater(base) }
      })
    },
    [committed]
  )

  /** 保存成功后调用：草稿交给 committed，并（约 2s）点亮保存条的「已保存」 */
  const markSaved = useCallback((id: string) => {
    setDrafts((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setJustSavedId(id)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setJustSavedId(null), JUST_SAVED_MS)
  }, [])

  const discard = useCallback((id: string) => {
    setDrafts((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setJustSavedId(null)
  }, [])

  return { drafts, getEffective, isDirty, dirtyIds, update, markSaved, discard, justSavedId }
}

/**
 * `⌘S / Ctrl+S` 保存当前分区（docs/OPTIONS_UI.md §2.4）。
 * 无论是否 dirty 都吞掉浏览器原生保存对话框。
 */
export function useSaveShortcut(onSave: () => void) {
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        onSaveRef.current()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])
}
