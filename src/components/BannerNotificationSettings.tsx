import { useState } from 'react'
import {
  BANNER_TIMEOUT_MAX_SEC,
  BANNER_TIMEOUT_STEP_SEC,
  formatBannerTimeoutLabel,
  getBannerTimeoutSeconds,
  setBannerTimeoutSeconds,
} from '../lib/bannerNotificationSettings'

export function BannerNotificationSettings() {
  const [timeoutSec, setTimeoutSec] = useState(getBannerTimeoutSeconds)

  const saveTimeout = (value: number) => {
    setBannerTimeoutSeconds(value)
    setTimeoutSec(getBannerTimeoutSeconds())
  }

  return (
    <section className="profile-section">
      <h2>Banner notification timeout</h2>
      <p className="muted">
        In-app banners (medicine due, app updates, and similar alerts) can close automatically
        after this many seconds, or stay until you swipe them away.
      </p>

      <label className="reminder-snooze-slider banner-timeout-slider">
        <span className="field-label">
          Auto-dismiss: <strong>{formatBannerTimeoutLabel(timeoutSec)}</strong>
        </span>
        <span className="muted reminder-snooze-slider__hint">
          {timeoutSec <= 0
            ? 'Banners stay until you swipe right to dismiss.'
            : 'Swipe right anytime to dismiss sooner. The bar shows time remaining.'}
        </span>
        <input
          type="range"
          className="reminder-snooze-slider__input"
          min={0}
          max={BANNER_TIMEOUT_MAX_SEC}
          step={BANNER_TIMEOUT_STEP_SEC}
          value={timeoutSec}
          onChange={(e) => saveTimeout(Number(e.target.value))}
          aria-valuetext={formatBannerTimeoutLabel(timeoutSec)}
        />
        <div className="reminder-snooze-slider__ticks banner-timeout-slider__ticks" aria-hidden>
          {Array.from(
            { length: BANNER_TIMEOUT_MAX_SEC / BANNER_TIMEOUT_STEP_SEC + 1 },
            (_, i) => i * BANNER_TIMEOUT_STEP_SEC,
          ).map((sec) => (
            <span key={sec}>{sec === 0 ? 'Off' : sec}</span>
          ))}
        </div>
      </label>
    </section>
  )
}
