import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { isNativeCapacitor } from '../lib/platform'
import { todayLocalDateString } from '../lib/time'
import { DatePickerSheet } from './DatePickerSheet'

interface FeedDateButtonProps {
  value: string
  onChange: (date: string) => void
  disabled?: boolean
}

export function FeedDateButton({ value, onChange, disabled }: FeedDateButtonProps) {
  const [open, setOpen] = useState(false)
  const dateValue = value || todayLocalDateString()

  if (isNativeCapacitor()) {
    return (
      <>
        <div className="feed-date-btn-wrap">
          <button
            type="button"
            className="feed-date-btn"
            onClick={() => !disabled && setOpen(true)}
            disabled={disabled}
            aria-label="Select feed date"
          >
            <CalendarDays size={20} aria-hidden />
          </button>
        </div>
        {open && (
          <DatePickerSheet
            value={dateValue}
            title="Feed date"
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

  const inputRef = { current: null as HTMLInputElement | null }

  const openPicker = () => {
    const input = inputRef.current
    if (!input || disabled) return
    if (typeof input.showPicker === 'function') {
      input.showPicker()
    } else {
      input.click()
    }
  }

  return (
    <div className="feed-date-btn-wrap">
      <input
        ref={(el) => {
          inputRef.current = el
        }}
        type="date"
        className="feed-date-btn__input"
        value={dateValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        className="feed-date-btn"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Select feed date"
      >
        <CalendarDays size={20} aria-hidden />
      </button>
    </div>
  )
}
