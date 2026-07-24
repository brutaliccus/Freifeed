import type { CSSProperties, ReactNode } from 'react'
import { useSwipeDismiss } from '../hooks/useSwipeDismiss'
import { useBannerAutoDismiss } from '../hooks/useBannerAutoDismiss'

interface InAppBannerProps {
  /** Changes reset the auto-dismiss timer. */
  bannerKey: string
  onDismiss: () => void
  children: ReactNode
  className?: string
  style?: CSSProperties
  role?: 'alert' | 'status'
  ariaLabel?: string
}

export function InAppBanner({
  bannerKey,
  onDismiss,
  children,
  className = 'in-app-banner',
  style,
  role = 'alert',
  ariaLabel = 'Notification. Swipe right to dismiss.',
}: InAppBannerProps) {
  const { ref: swipeRef, handlers: swipeHandlers } = useSwipeDismiss(onDismiss)
  const { progress, showTimer } = useBannerAutoDismiss(bannerKey, onDismiss)

  return (
    <div className="in-app-banner-anchor" style={style}>
      <div
        ref={swipeRef}
        className={className}
        role={role}
        aria-label={ariaLabel}
        {...swipeHandlers}
      >
        {children}
        {showTimer && (
          <div
            className="in-app-banner__timer"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Alert auto-dismiss timer"
          >
            <span className="in-app-banner__timer-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
