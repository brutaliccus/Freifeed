import { useState } from 'react'
import { BellRing, BellOff } from 'lucide-react'
import { NotificationSettingsToggle } from './NotificationSettingsToggle'
import { useNotificationPermissionState } from '../hooks/useNotificationPermissionState'
import type { ActiveFeedDraft } from '../lib/activeFeedSession'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import {
  buildFeedReminderPayload,
  getFeedReminderSettings,
  isFeedReminderIntervalValid,
  setFeedReminderEnabled,
  setFeedReminderInterval,
  syncFeedRemindersToServiceWorker,
} from '../lib/feedReminders'
import {
  getFeedReminderSnoozeMinutes,
  setFeedReminderSnoozeMinutes,
} from '../lib/feedReminderState'
import type { Baby, Feeding } from '../types'

interface FeedReminderSettingsProps {
  feedings: Feeding[]
  babies: Baby[]
  localSessions: ActiveFeedDraft[]
}

export function FeedReminderSettings({ feedings, babies, localSessions }: FeedReminderSettingsProps) {
  const initial = getFeedReminderSettings()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [hours, setHours] = useState(String(initial.hours))
  const [minutes, setMinutes] = useState(String(initial.minutes))
  const [snoozeMinutes, setSnoozeMinutes] = useState(getFeedReminderSnoozeMinutes())
  const [busy, setBusy] = useState(false)
  const { permission, requestPermission } = useNotificationPermissionState()
  const native = usesNativeNotifications()
  const [intervalError, setIntervalError] = useState<string | null>(null)

  const parsedHours = Number(hours)
  const parsedMinutes = Number(minutes)

  const pushToServiceWorker = (nextEnabled: boolean) => {
    void (async () => {
      const settings = getFeedReminderSettings()
      if (!nextEnabled || !isFeedReminderIntervalValid(settings)) {
        await syncFeedRemindersToServiceWorker(null)
        return
      }
      const payload = buildFeedReminderPayload(feedings, babies, localSessions)
      await syncFeedRemindersToServiceWorker({ ...payload, enabled: true })
    })()
  }

  const saveInterval = () => {
    const h = Number.isFinite(parsedHours) ? Math.max(0, Math.min(48, Math.floor(parsedHours))) : 0
    const m = Number.isFinite(parsedMinutes) ? Math.max(0, Math.min(59, Math.floor(parsedMinutes))) : 0
    setHours(String(h))
    setMinutes(String(m))
    setFeedReminderInterval(h, m)
    if (h * 60 + m <= 0) {
      setIntervalError('Set at least 1 minute.')
    } else {
      setIntervalError(null)
      if (enabled) pushToServiceWorker(true)
    }
  }

  const saveSnooze = (value: number) => {
    setFeedReminderSnoozeMinutes(value)
    setSnoozeMinutes(value)
    if (enabled) pushToServiceWorker(true)
  }

  const toggle = async () => {
    if (busy) return
    const next = !enabled
    if (next) {
      const h = Number.isFinite(parsedHours) ? Math.max(0, Math.min(48, Math.floor(parsedHours))) : 0
      const m = Number.isFinite(parsedMinutes) ? Math.max(0, Math.min(59, Math.floor(parsedMinutes))) : 0
      setFeedReminderInterval(h, m)
      if (h * 60 + m <= 0) {
        setIntervalError('Set at least 1 minute before turning on.')
        return
      }
      setIntervalError(null)
      setBusy(true)
      try {
        const perm = await requestPermission()
        if (perm !== 'granted') return
      } finally {
        setBusy(false)
      }
    }
    setEnabled(next)
    setFeedReminderEnabled(next)
    pushToServiceWorker(next)
  }

  return (
    <section className="profile-section">
      <h2>Feed reminder</h2>
      <p className="muted">
        {native
          ? 'Android will notify you when it has been a while since each baby was last fed (nursing or bottle). Each alert fires once per feed until you dismiss or snooze.'
          : "Get a notification when it's been a while since each baby was last fed — nursing or bottle (not when a session ended). Each alert fires once per feed until you dismiss it or snooze."}
      </p>

      <div className="reminder-interval">
        <label className="reminder-interval__field">
          <span className="field-label">Hours</span>
          <input
            type="number"
            className="input input--small"
            min={0}
            max={48}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onBlur={() => void saveInterval()}
          />
        </label>
        <label className="reminder-interval__field">
          <span className="field-label">Minutes</span>
          <input
            type="number"
            className="input input--small"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onBlur={() => void saveInterval()}
          />
        </label>
      </div>
      {intervalError && <p className="error-text">{intervalError}</p>}

      <label className="reminder-snooze-slider">
        <span className="field-label">
          Snooze length: <strong>{snoozeMinutes} min</strong>
        </span>
        <span className="muted reminder-snooze-slider__hint">
          &quot;Remind me again&quot; on the notification waits this long before alerting again.
        </span>
        <input
          type="range"
          className="reminder-snooze-slider__input"
          min={5}
          max={60}
          step={5}
          value={snoozeMinutes}
          onChange={(e) => void saveSnooze(Number(e.target.value))}
        />
        <div className="reminder-snooze-slider__ticks" aria-hidden>
          <span>5</span>
          <span>60</span>
        </div>
      </label>

      <NotificationSettingsToggle
        enabled={enabled}
        busy={busy}
        onClick={() => void toggle()}
        onLabel="Feed reminder on"
        offLabel="Feed reminder off"
        iconOn={<BellRing size={18} aria-hidden />}
        iconOff={<BellOff size={18} aria-hidden />}
      />
      {permission === 'denied' && (
        <p className="error-text">
          Notifications are blocked. Enable them for Freifeed in your{' '}
          {native ? 'phone' : 'browser or phone'} settings.
        </p>
      )}
      {permission === 'unsupported' && !native && (
        <p className="muted">Notifications are not supported in this browser.</p>
      )}
    </section>
  )
}
