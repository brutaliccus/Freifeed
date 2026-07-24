import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { isNativeCapacitor } from '../lib/platform'
import { todayLocalDateString } from '../lib/time'
import { DatePickerSheet } from './DatePickerSheet'

interface DatePickerFieldProps {
  label?: string
  value: string
  onChange: (yyyyMmDd: string) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

export function DatePickerField({
  label,
  value,
  onChange,
  disabled,
  className = 'input',
  compact = false,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const dateValue = value || todayLocalDateString()
  let display = dateValue
  try {
    display = format(parseISO(dateValue), 'MMM d, yyyy')
  } catch {
    /* keep raw */
  }

  if (!isNativeCapacitor()) {
    if (compact) {
      return (
        <input
          type="date"
          className={className}
          value={dateValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
    }
    return (
      <label className="field-block">
        {label && <span className="field-label">{label}</span>}
        <input
          type="date"
          className={className}
          value={dateValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </label>
    )
  }

  if (compact) {
    return (
      <>
        <button
          type="button"
          className={`picker-trigger picker-trigger--compact ${className}`}
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          aria-label={label ?? 'Select date'}
        >
          <CalendarDays size={18} aria-hidden />
          <span>{display}</span>
        </button>
        {open && (
          <DatePickerSheet
            value={dateValue}
            title={label ?? 'Select date'}
            onClose={() => setOpen(false)}
            onConfirm={(next) => {
              onChange(next)
              setOpen(false)
            }}
          />
        )}
      </>
    )
  }

  return (
    <label className="field-block">
      {label && <span className="field-label">{label}</span>}
      <button
        type="button"
        className={`picker-trigger ${className}`}
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <CalendarDays size={18} aria-hidden />
        <span>{display}</span>
      </button>
      {open && (
        <DatePickerSheet
          value={dateValue}
          title={label ?? 'Select date'}
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
