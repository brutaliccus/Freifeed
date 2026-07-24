import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const DEFAULT_DELAY_MS = 500

interface UseLongPressOptions {
  delayMs?: number
  disabled?: boolean
}

/**
 * Fires `onLongPress` after holding the primary button; suppresses the following click.
 */
export function useLongPress(
  onLongPress: () => void,
  { delayMs = DEFAULT_DELAY_MS, disabled = false }: UseLongPressOptions = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPressRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (disabled || e.button !== 0) return
      didLongPressRef.current = false
      clearTimer()
      timerRef.current = setTimeout(() => {
        didLongPressRef.current = true
        onLongPress()
      }, delayMs)
    },
    [clearTimer, delayMs, disabled, onLongPress],
  )

  const onPointerUp = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onPointerLeave = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onPointerCancel = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const shouldSuppressClick = useCallback(() => {
    if (!didLongPressRef.current) return false
    didLongPressRef.current = false
    return true
  }, [])

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    shouldSuppressClick,
  }
}
