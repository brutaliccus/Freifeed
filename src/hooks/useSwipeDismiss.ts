import { useCallback, useRef, type RefObject, type TouchEvent } from 'react'

const SWIPE_THRESHOLD_PX = 56

type SwipeDismissHandlers = {
  onTouchStart: (e: TouchEvent) => void
  onTouchMove: (e: TouchEvent) => void
  onTouchEnd: () => void
  onTouchCancel: () => void
}

/**
 * Swipe right on a top-anchored banner to dismiss (touch only).
 */
export function useSwipeDismiss(
  onDismiss: () => void,
): { ref: RefObject<HTMLDivElement | null>; handlers: SwipeDismissHandlers } {
  const ref = useRef<HTMLDivElement | null>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const offsetRef = useRef(0)
  const draggingRef = useRef(false)
  const horizontalRef = useRef(false)

  const applyOffset = useCallback((dx: number) => {
    offsetRef.current = dx
    const el = ref.current
    if (!el) return
    el.style.transform = dx === 0 ? '' : `translateX(${dx}px)`
    el.style.opacity = dx === 0 ? '' : String(Math.max(0.35, 1 - dx / 180))
  }, [])

  const resetOffset = useCallback(() => {
    applyOffset(0)
  }, [applyOffset])

  const handlers: SwipeDismissHandlers = {
    onTouchStart(e) {
      startXRef.current = e.touches[0]?.clientX ?? 0
      startYRef.current = e.touches[0]?.clientY ?? 0
      draggingRef.current = true
      horizontalRef.current = false
    },
    onTouchMove(e) {
      if (!draggingRef.current) return
      const x = e.touches[0]?.clientX ?? startXRef.current
      const y = e.touches[0]?.clientY ?? startYRef.current
      const dx = x - startXRef.current
      const dy = y - startYRef.current
      if (!horizontalRef.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        if (Math.abs(dx) <= Math.abs(dy)) {
          draggingRef.current = false
          return
        }
        horizontalRef.current = true
      }
      const swipeX = Math.max(0, dx)
      applyOffset(swipeX)
    },
    onTouchEnd() {
      if (!draggingRef.current && !horizontalRef.current) return
      draggingRef.current = false
      if (!horizontalRef.current) return
      horizontalRef.current = false
      if (offsetRef.current >= SWIPE_THRESHOLD_PX) {
        onDismiss()
        return
      }
      resetOffset()
    },
    onTouchCancel() {
      draggingRef.current = false
      resetOffset()
    },
  }

  return { ref, handlers }
}
