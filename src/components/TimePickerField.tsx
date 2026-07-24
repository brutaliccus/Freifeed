import { useState } from 'react'
import { format } from 'date-fns'
import { Clock } from 'lucide-react'
import { formatTimeOfDay } from '../lib/medicineSchedule'
import { TimePickerSheet, type TimePickerContext } from './TimePickerSheet'

interface TimePickerFieldProps {
  label: string
  value: string
  onChange: (hhmm: string) => void
  disabled?: boolean
  className?: string
  required?: boolean
  context?: TimePickerContext
  showLabel?: boolean
}

export function TimePickerField({
  label,
  value,
  onChange,
  disabled,
  className = 'input',
  context,
  showLabel = true,
}: TimePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const display = value ? formatTimeOfDay(value) : 'Pick time'
  const pickerValue = value || format(new Date(), 'HH:mm')

  return (
    <label className="field-block">
      {showLabel && <span className="field-label">{label}</span>}
      <button
        type="button"
        className={`picker-trigger ${className}`}
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <Clock size={18} aria-hidden />
        <span>{display}</span>
      </button>
      {open && (
        <TimePickerSheet
          value={pickerValue}
          title={label}
          context={context}
          onClose={() => setOpen(false)}
          onConfirm={(next) => {
            onChange(next)
            setOpen(false)
          }}
        />
      )}
    </label>
  )
}
