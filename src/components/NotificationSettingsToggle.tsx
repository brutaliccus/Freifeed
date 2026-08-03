import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface NotificationSettingsToggleProps {
  enabled: boolean
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  onLabel: string
  offLabel: string
  iconOn: ReactNode
  iconOff: ReactNode
}

export function NotificationSettingsToggle({
  enabled,
  busy = false,
  disabled = false,
  onClick,
  onLabel,
  offLabel,
  iconOn,
  iconOff,
}: NotificationSettingsToggleProps) {
  // Busy copy assumes `enabled` is still the pre-toggle value (callers must not
  // flip it until the async work finishes).
  const label = busy ? (enabled ? 'Turning off…' : 'Turning on…') : enabled ? onLabel : offLabel

  return (
    <button
      type="button"
      className={`btn btn-secondary notification-settings-btn${busy ? ' notification-settings-btn--busy' : ''}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      aria-pressed={enabled}
    >
      {busy ? (
        <Loader2 size={18} className="notification-settings-btn__spinner" aria-hidden />
      ) : enabled ? (
        iconOn
      ) : (
        iconOff
      )}
      {label}
    </button>
  )
}
