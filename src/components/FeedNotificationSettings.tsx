import { useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { NotificationSettingsToggle } from './NotificationSettingsToggle'
import { useNotificationPermissionState } from '../hooks/useNotificationPermissionState'
import {
  areFeedNotificationsEnabled,
  setFeedNotificationsEnabled,
} from '../lib/feedNotifications'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import { registerNativePartnerPushToken } from '../lib/partnerPushRegistration'

interface FeedNotificationSettingsProps {
  onEnabledChange: (enabled: boolean) => void
}

export function FeedNotificationSettings({ onEnabledChange }: FeedNotificationSettingsProps) {
  const [enabled, setEnabled] = useState(areFeedNotificationsEnabled)
  const [busy, setBusy] = useState(false)
  const { permission, requestPermission } = useNotificationPermissionState()
  const native = usesNativeNotifications()

  const toggle = async () => {
    if (busy) return
    const next = !enabled
    setBusy(true)
    try {
      if (next) {
        const perm = await requestPermission()
        if (perm !== 'granted') return
      }
      setFeedNotificationsEnabled(next)
      onEnabledChange(next)
      if (next && native) {
        await registerNativePartnerPushToken()
      }
      setEnabled(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="profile-section">
      <h2>Notification timers</h2>
      <p className="muted">
        {native
          ? 'Live nursing timers in the Android notification shade (system chronometer) for any in-progress feed in your household.'
          : 'Live nursing timers in your notification bar for any in-progress feed in your household — yours or your partner\'s. Works best with FreiFeed installed to your home screen.'}
      </p>
      <NotificationSettingsToggle
        enabled={enabled}
        busy={busy}
        onClick={() => void toggle()}
        onLabel="Notification timers on"
        offLabel="Notification timers off"
        iconOn={<Bell size={18} aria-hidden />}
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
