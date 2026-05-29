import { useCallback, useEffect, useRef } from "react"

interface Position {
  x: number
  y: number
}

interface DraggableOptions {
  initialPosition?: Position
  boundaryPadding?: number
}

export function useDraggable(options: DraggableOptions = {}) {
  const { initialPosition, boundaryPadding = 20 } = options
  const elementRef = useRef<HTMLDivElement | null>(null)
  const isDragging = useRef(false)
  const dragOffset = useRef<Position>({ x: 0, y: 0 })
  const currentPosition = useRef<Position | null>(initialPosition ?? null)
  const rafId = useRef<number | null>(null)

  const applyPosition = useCallback((element: HTMLElement, pos: Position) => {
    element.style.left = `${pos.x}px`
    element.style.top = `${pos.y}px`
    element.style.transform = "none"
  }, [])

  const handleDragStart = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      const target = event.target as HTMLElement
      if (
        target.closest("button") ||
        target.closest("select") ||
        target.closest("input") ||
        target.closest("textarea")
      ) {
        return
      }

      const element = elementRef.current
      if (!element) return

      event.preventDefault()

      const rect = element.getBoundingClientRect()
      let clientX: number, clientY: number

      if ("touches" in event) {
        const touch = event.touches[0]
        clientX = touch.clientX
        clientY = touch.clientY
      } else {
        clientX = event.clientX
        clientY = event.clientY
      }

      isDragging.current = true
      dragOffset.current = {
        x: clientX - rect.left,
        y: clientY - rect.top
      }

      element.style.cursor = "grabbing"
      element.style.userSelect = "none"
      element.style.willChange = "left, top"
    },
    []
  )

  useEffect(() => {
    const handleDragMove = (event: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return

      const element = elementRef.current
      if (!element) return

      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
      }

      rafId.current = requestAnimationFrame(() => {
        let clientX: number, clientY: number

        if (event.type === "touchmove") {
          const touchEvent = event as TouchEvent
          clientX = touchEvent.touches[0].clientX
          clientY = touchEvent.touches[0].clientY
        } else {
          const mouseEvent = event as MouseEvent
          clientX = mouseEvent.clientX
          clientY = mouseEvent.clientY
        }

        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const rect = element.getBoundingClientRect()
        const width = rect.width
        const height = rect.height

        let newLeft = clientX - dragOffset.current.x
        let newTop = clientY - dragOffset.current.y

        newLeft = Math.max(boundaryPadding, Math.min(newLeft, viewportWidth - width - boundaryPadding))
        newTop = Math.max(boundaryPadding, Math.min(newTop, viewportHeight - height - boundaryPadding))

        currentPosition.current = { x: newLeft, y: newTop }
        applyPosition(element, currentPosition.current)
      })
    }

    const handleDragEnd = () => {
      if (!isDragging.current) return

      isDragging.current = false

      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }

      const element = elementRef.current
      if (element) {
        element.style.cursor = ""
        element.style.userSelect = ""
        element.style.willChange = ""
      }
    }

    document.addEventListener("mousemove", handleDragMove, { passive: true })
    document.addEventListener("mouseup", handleDragEnd, { passive: true })
    document.addEventListener("touchmove", handleDragMove, { passive: true })
    document.addEventListener("touchend", handleDragEnd, { passive: true })

    return () => {
      document.removeEventListener("mousemove", handleDragMove)
      document.removeEventListener("mouseup", handleDragEnd)
      document.removeEventListener("touchmove", handleDragMove)
      document.removeEventListener("touchend", handleDragEnd)

      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
      }
    }
  }, [boundaryPadding, applyPosition])

  const setInitialPosition = useCallback((element: HTMLElement) => {
    if (currentPosition.current) {
      applyPosition(element, currentPosition.current)
    }
  }, [applyPosition])

  return {
    elementRef,
    currentPosition,
    handleDragStart,
    setInitialPosition
  }
}