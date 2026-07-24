import { useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { NotificationSettingsToggle } from './NotificationSettingsToggle'
import {
  areMedicineNotificationsEnabled,
  areMedicineOverdueFollowupsEnabled,
  setMedicineOverdueFollowupsEnabled,
} from '../lib/medicineNotifications'

interface MedicineOverdueNotificationSettingsProps {
  onEnabledChange: () => void
}

export function MedicineOverdueNotificationSettings({
  onEnabledChange,
}: MedicineOverdueNotificationSettingsProps) {
  const [enabled, setEnabled] = useState(areMedicineOverdueFollowupsEnabled)
  const masterOn = areMedicineNotificationsEnabled()

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    setMedicineOverdueFollowupsEnabled(next)
    onEnabledChange()
  }

  return (
    <section className="profile-section">
      <h2>Missed dose reminders</h2>
      <p className="muted">
        For scheduled (not as-needed) medicines: if you have not tapped “I took it” yet, get a reminder
        1 hour and 3 hours after the dose was due.
      </p>
      <NotificationSettingsToggle
        enabled={enabled && masterOn}
        disabled={!masterOn}
        onClick={toggle}
        onLabel="Missed dose reminders on"
        offLabel="Missed dose reminders off"
        iconOn={<Bell size={18} aria-hidden />}
        iconOff={<BellOff size={18} aria-hidden />}
      />
      {!masterOn && (
        <p className="muted">Turn on medicine reminders above to use missed-dose follow-ups.</p>
      )}
    </section>
  )
}
