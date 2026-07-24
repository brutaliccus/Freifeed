import { useState } from 'react'
import { Bell } from 'lucide-react'
import { reminderLabel } from '../lib/noteReminders'
import { ReminderPickerSheet } from './ReminderPickerSheet'

interface ReminderPickerFieldProps {
  label?: string
  value: number
  onChange: (minutes: number) => void
  disabled?: boolean
}

export function ReminderPickerField({
  label = 'Remind me',
  value,
  onChange,
  disabled,
}: ReminderPickerFieldProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="field-block">
      <span className="field-label">{label}</span>
      <button
        type="button"
        className="picker-trigger input reminder-picker-field"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <Bell size={18} aria-hidden />
        <span>{reminderLabel(value)}</span>
      </button>
      {open && (
        <ReminderPickerSheet
          value={value}
          title={label}
          onClose={() => setOpen(false)}
          onConfirm={(minutes) => {
            onChange(minutes)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
