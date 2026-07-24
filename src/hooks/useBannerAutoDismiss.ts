import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getBannerAutoDismissMs,
  subscribeBannerTimeoutSeconds,
} from '../lib/bannerNotificationSettings'

/**
 * Countdown for in-app banners. When timeout is 0, only swipe dismiss applies.
 */
export function useBannerAutoDismiss(
  bannerKey: string,
  onDismiss: () => void,
): { progress: number; showTimer: boolean } {
  const [dismissMs, setDismissMs] = useState(getBannerAutoDismissMs)
  const [progress, setProgress] = useState(100)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  const stableDismiss = useCallback(() => {
    onDismissRef.current()
  }, [])

  useEffect(() => subscribeBannerTimeoutSeconds(() => setDismissMs(getBannerAutoDismissMs())), [])

  useEffect(() => {
    if (!bannerKey) return

    if (dismissMs == null) {
      setProgress(100)
      return
    }

    setProgress(100)
    const started = performance.now()
    let frame = 0

    const tick = () => {
      const elapsed = performance.now() - started
      const remaining = Math.max(0, 100 - (elapsed / dismissMs) * 100)
      setProgress(remaining)
      if (elapsed >= dismissMs) {
        stableDismiss()
        return
      }
      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [bannerKey, dismissMs, stableDismiss])

  return { progress, showTimer: dismissMs != null }
}
