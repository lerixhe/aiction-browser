import type { SelectionContext, SelectionAnchor, SelectionSnapshot } from "~/shared/types"

type TextControl = HTMLInputElement | HTMLTextAreaElement

const BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "TD", "TH", "BLOCKQUOTE", "PRE",
  "H1", "H2", "H3", "H4", "H5", "H6", "ARTICLE", "SECTION",
  "MAIN", "ASIDE", "NAV", "HEADER", "FOOTER", "FIGURE", "FIGCAPTION",
  "DETAILS", "SUMMARY", "DD", "DT"
])

const MAX_SURROUND_LENGTH = 500

function getPageMeta(): { description?: string } {
  const metaDesc = document.querySelector('meta[name="description"]')
  const description = metaDesc?.getAttribute("content")?.trim()
  return description ? { description } : {}
}

function getSurroundingBlock(range: Range): string | undefined {
  let node: Node | null = range.commonAncestorContainer

  if (node.nodeType !== Node.ELEMENT_NODE) {
    node = node.parentElement
  }

  while (node instanceof Element) {
    if (BLOCK_TAGS.has(node.tagName)) {
      const text = node.textContent?.trim() || ""
      if (!text) {
        return undefined
      }
      if (text.length > MAX_SURROUND_LENGTH) {
        return text.slice(0, MAX_SURROUND_LENGTH) + "..."
      }
      return text
    }
    node = node.parentElement
  }

  return undefined
}

function createSelectionContext(
  text: string,
  options?: { surround?: string }
): SelectionContext {
  const context: SelectionContext = {
    text,
    title: document.title || "",
    url: window.location.href
  }

  if (options?.surround && options.surround !== text) {
    context.surround = options.surround
  }

  const meta = getPageMeta()
  if (meta.description) {
    context.meta = meta
  }

  return context
}

function getRangeAnchor(selection: Selection | null): SelectionAnchor | null {
  if (!selection || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)
  const rects = range.getClientRects()
  const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect()

  if (!rect) {
    return null
  }

  if (rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0) {
    return null
  }

  return {
    x: rect.left + Math.max(rect.width / 2, 0),
    y: rect.top,
    rectRight: rect.left + rect.width,
    mouseX: 0,
    mouseY: 0
  }
}

function getElementAnchor(element: Element): SelectionAnchor | null {
  const rect = element.getBoundingClientRect()

  if (rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0) {
    return null
  }

  return {
    x: rect.left + Math.max(rect.width / 2, 0),
    y: rect.top,
    rectRight: rect.left + rect.width,
    mouseX: 0,
    mouseY: 0
  }
}

function getSelectionFromTargetRoot(target: EventTarget | null): Selection | null {
  if (!(target instanceof Node)) {
    return null
  }

  const root = target.getRootNode()
  if (!root || root === document) {
    return null
  }

  const getSelection = (root as { getSelection?: () => Selection | null }).getSelection
  if (typeof getSelection !== "function") {
    return null
  }

  try {
    return getSelection.call(root) ?? null
  } catch {
    return null
  }
}

function getDeepActiveElement(root: Document | ShadowRoot = document): Element | null {
  const activeElement = root.activeElement
  if (!activeElement) {
    return null
  }

  if (activeElement instanceof HTMLElement && activeElement.shadowRoot) {
    const nestedActiveElement = getDeepActiveElement(activeElement.shadowRoot)
    if (nestedActiveElement) {
      return nestedActiveElement
    }
  }

  return activeElement
}

function asTextControl(element: Element | null): TextControl | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element
  }

  return null
}

function getTextControlFromTarget(target: EventTarget | null): TextControl | null {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target
  }

  if (target instanceof Element) {
    const closestControl = target.closest("input,textarea")
    const controlFromClosest = asTextControl(closestControl)
    if (controlFromClosest) {
      return controlFromClosest
    }
  }

  return asTextControl(getDeepActiveElement())
}

function getTextControlSnapshot(target: EventTarget | null): SelectionSnapshot | null {
  const control = getTextControlFromTarget(target)
  if (!control) {
    return null
  }

  const selectionStart = control.selectionStart
  const selectionEnd = control.selectionEnd

  if (selectionStart == null || selectionEnd == null || selectionStart === selectionEnd) {
    return null
  }

  const start = Math.min(selectionStart, selectionEnd)
  const end = Math.max(selectionStart, selectionEnd)
  const text = control.value.slice(start, end).trim()

  if (!text) {
    return null
  }

  const fullValue = control.value.trim()
  const surround = fullValue !== text ? fullValue : undefined

  return {
    context: createSelectionContext(text, { surround }),
    anchor: getElementAnchor(control)
  }
}

function getRangeSelectionSnapshot(target: EventTarget | null): SelectionSnapshot | null {
  const rootSelection = getSelectionFromTargetRoot(target)
  const rangeSelection = rootSelection && rootSelection.toString().trim() ? rootSelection : window.getSelection()

  if (!rangeSelection) {
    return null
  }

  const text = rangeSelection.toString().trim()
  if (!text) {
    return null
  }

  let surround: string | undefined
  if (rangeSelection.rangeCount > 0) {
    const range = rangeSelection.getRangeAt(0)
    surround = getSurroundingBlock(range)
  }

  return {
    context: createSelectionContext(text, { surround }),
    anchor: getRangeAnchor(rangeSelection)
  }
}

export function getSelectionSnapshot(target: EventTarget | null = null): SelectionSnapshot | null {
  const textControlSnapshot = getTextControlSnapshot(target)
  if (textControlSnapshot) {
    return textControlSnapshot
  }

  return getRangeSelectionSnapshot(target)
}

export function getSelectionContext(target: EventTarget | null = null): SelectionContext | null {
  return getSelectionSnapshot(target)?.context ?? null
}

export function getSelectionAnchor(target: EventTarget | null = null): SelectionAnchor | null {
  return getSelectionSnapshot(target)?.anchor ?? null
}
