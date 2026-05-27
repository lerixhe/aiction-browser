import { SELECTORS } from "~/shared/constants"

/**
 * Get deep active element through shadow DOM boundaries
 */
export function getDeepActiveElement(root: Document | ShadowRoot = document): Element | null {
  const activeElement = root.activeElement
  if (!activeElement) {
    return null
  }

  if (activeElement instanceof HTMLElement && activeElement.shadowRoot) {
    return getDeepActiveElement(activeElement.shadowRoot) ?? activeElement
  }

  return activeElement
}

/**
 * Check if target is inside extension root element
 */
export function isInsideExtensionRoot(
  target: EventTarget | null,
  extensionRoot: HTMLElement | null
): boolean {
  if (extensionRoot && target instanceof Node && extensionRoot.contains(target)) {
    return true
  }

  if (target instanceof HTMLElement) {
    return !!target.closest(SELECTORS.EXTENSION_ROOT)
  }

  if (target instanceof Node && target.parentElement) {
    return !!target.parentElement.closest(SELECTORS.EXTENSION_ROOT)
  }

  return false
}

/**
 * Check if event is inside extension UI
 */
export function isInsideExtensionEvent(
  event: Event,
  extensionRoot: HTMLElement | null
): boolean {
  const path = typeof event.composedPath === "function" ? event.composedPath() : []
  return path.some((node) => isInsideExtensionRoot(node, extensionRoot))
}

/**
 * Check if extension UI is focused
 */
export function isExtensionUiFocused(extensionRoot: HTMLElement | null): boolean {
  return isInsideExtensionRoot(getDeepActiveElement(), extensionRoot)
}

/**
 * Check if element has selected text in control
 */
export function hasSelectedTextInControl(element: Element | null): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return false
  }

  const { selectionStart, selectionEnd } = element
  return selectionStart != null && selectionEnd != null && selectionStart !== selectionEnd
}

/**
 * Check if there is selection inside extension UI
 */
export function hasSelectionInsideExtensionUi(extensionRoot: HTMLElement | null): boolean {
  if (!extensionRoot) {
    return false
  }

  const activeElement = getDeepActiveElement()
  if (isInsideExtensionRoot(activeElement, extensionRoot) && hasSelectedTextInControl(activeElement)) {
    return true
  }

  const selections: Selection[] = []
  const documentSelection = window.getSelection()
  if (documentSelection) {
    selections.push(documentSelection)
  }

  const extensionRootNode = extensionRoot.getRootNode()
  const shadowSelectionGetter =
    extensionRootNode instanceof ShadowRoot
      ? (extensionRootNode as ShadowRoot & { getSelection?: () => Selection | null }).getSelection
      : null

  if (typeof shadowSelectionGetter === "function") {
    const shadowSelection = shadowSelectionGetter.call(extensionRootNode)
    if (shadowSelection) {
      selections.push(shadowSelection)
    }
  }

  return selections.some((selection) => {
    if (!selection.toString().trim()) {
      return false
    }

    return (
      isInsideExtensionRoot(selection.anchorNode, extensionRoot) ||
      isInsideExtensionRoot(selection.focusNode, extensionRoot)
    )
  })
}
