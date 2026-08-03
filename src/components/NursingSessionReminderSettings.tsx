import { useState } from 'react'
import { BellRing, BellOff } from 'lucide-react'
import { NotificationSettingsToggle } from './NotificationSettingsToggle'
import { useNotificationPermissionState } from '../hooks/useNotificationPermissionState'
import type { ActiveFeedDraft } from '../lib/activeFeedSession'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import {
  buildNursingSessionReminderPayload,
  syncNursingSessionRemindersToServiceWorker,
} from '../lib/nursingSessionReminders'
import { syncNativeNursingSessionReminders } from '../lib/nativeNotifications'
import {
  getNursingSessionReminderEnabled,
  getNursingSessionReminderMinutes,
  NURSING_SESSION_REMINDER_MAX_MIN,
  NURSING_SESSION_REMINDER_MIN_MIN,
  NURSING_SESSION_REMINDER_STEP_MIN,
  setNursingSessionReminderEnabled,
  setNursingSessionReminderMinutes,
} from '../lib/nursingSessionReminderSettings'
import type { Baby, Feeding } from '../types'

interface NursingSessionReminderSettingsProps {
  feedings: Feeding[]
  babies: Baby[]
  localSessions: ActiveFeedDraft[]
}

export function NursingSessionReminderSettings({
  feedings,
  babies,
  localSessions,
}: NursingSessionReminderSettingsProps) {
  const [enabled, setEnabled] = useState(getNursingSessionReminderEnabled)
  const [minutes, setMinutes] = useState(getNursingSessionReminderMinutes)
  const [busy, setBusy] = useState(false)
  const { permission, requestPermission } = useNotificationPermissionState()
  const native = usesNativeNotifications()

  const pushReminders = (nextEnabled: boolean) => {
    void (async () => {
      if (!nextEnabled) {
        if (native) await syncNativeNursingSessionReminders(null)
        else await syncNursingSessionRemindersToServiceWorker(null)
        return
      }
      const payload = buildNursingSessionReminderPayload(feedings, babies, localSessions)
      const next = { ...payload, enabled: true }
      if (native) await syncNativeNursingSessionReminders(next)
      else await syncNursingSessionRemindersToServiceWorker(next)
    })()
  }

  const saveMinutes = (value: number) => {
    setNursingSessionReminderMinutes(value)
    setMinutes(value)
    if (enabled) pushReminders(true)
  }

  const toggle = async () => {
    if (busy) return
    const next = !enabled
    if (next) {
      setBusy(true)
      try {
        const perm = await requestPermission()
        if (perm !== 'granted') return
      } finally {
        setBusy(false)
      }
    }
    setEnabled(next)
    setNursingSessionReminderEnabled(next)
    pushReminders(next)
  }

  const tickCount =
    (NURSING_SESSION_REMINDER_MAX_MIN - NURSING_SESSION_REMINDER_MIN_MIN) /
      NURSING_SESSION_REMINDER_STEP_MIN +
    1

  return (
    <section className="profile-section">
      <h2>Nursing timer reminder</h2>
      <p className="muted">
        {native
          ? 'Uses the same Android alarms as appointments — works with Freifeed closed, including when your partner started the session.'
          : 'Get a notification when a nursing session has been running longer than the time you set — yours or your partner\'s.'}
      </p>

      <label className="reminder-snooze-slider banner-timeout-slider">
        <span className="field-label">
          Remind after: <strong>{minutes} min</strong>
        </span>
        <span className="muted reminder-snooze-slider__hint">
          Fires once per session when the timer exceeds this length.
        </span>
        <input
          type="range"
          className="reminder-snooze-slider__input"
          min={NURSING_SESSION_REMINDER_MIN_MIN}
          max={NURSING_SESSION_REMINDER_MAX_MIN}
          step={NURSING_SESSION_REMINDER_STEP_MIN}
          value={minutes}
          onChange={(e) => saveMinutes(Number(e.target.value))}
          aria-valuetext={`${minutes} minutes`}
        />
        <div className="reminder-snooze-slider__ticks banner-timeout-slider__ticks" aria-hidden>
          {Array.from({ length: tickCount }, (_, i) => (
            <span key={i}>{NURSING_SESSION_REMINDER_MIN_MIN + i * NURSING_SESSION_REMINDER_STEP_MIN}</span>
          ))}
        </div>
      </label>

      <NotificationSettingsToggle
        enabled={enabled}
        busy={busy}
        onClick={() => void toggle()}
        onLabel="Nursing timer reminder on"
        offLabel="Nursing timer reminder off"
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
