import { useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { NotificationSettingsToggle } from './NotificationSettingsToggle'
import { useNotificationPermissionState } from '../hooks/useNotificationPermissionState'
import {
  areMedicineNotificationsEnabled,
  setMedicineNotificationsEnabled,
} from '../lib/medicineNotifications'
import { usesNativeNotifications } from '../lib/notificationPlatform'

interface MedicineNotificationSettingsProps {
  onEnabledChange: (enabled: boolean) => void
}

export function MedicineNotificationSettings({ onEnabledChange }: MedicineNotificationSettingsProps) {
  const [enabled, setEnabled] = useState(areMedicineNotificationsEnabled)
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
      setEnabled(next)
      setMedicineNotificationsEnabled(next)
      onEnabledChange(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="profile-section">
      <h2>Medicine reminders</h2>
      <p className="muted">
        {native
          ? 'Scheduled with Android alarms when a dose is due. Tap “I took it” on the notification to log it.'
          : 'Alerts when a dose is due, with pill count and dosage. Tap "I took it" on the notification to log it.'}
      </p>
      <NotificationSettingsToggle
        enabled={enabled}
        busy={busy}
        onClick={() => void toggle()}
        onLabel="Medicine reminders on"
        offLabel="Medicine reminders off"
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
