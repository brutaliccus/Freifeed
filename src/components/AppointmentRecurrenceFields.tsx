import { Repeat } from 'lucide-react'
import { FeedDateButton } from './FeedDateButton'
import { RECURRENCE_FREQUENCY_OPTIONS } from '../lib/appointmentRecurrence'
import type { AppointmentRecurrence } from '../types'

export type RecurrenceEndMode = 'count' | 'until'

interface AppointmentRecurrenceFieldsProps {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  frequency: AppointmentRecurrence['frequency']
  onFrequencyChange: (frequency: AppointmentRecurrence['frequency']) => void
  endMode: RecurrenceEndMode
  onEndModeChange: (mode: RecurrenceEndMode) => void
  occurrenceCount: number
  onOccurrenceCountChange: (count: number) => void
  endDateStr: string
  onEndDateStrChange: (date: string) => void
  disabled?: boolean
}

export function AppointmentRecurrenceFields({
  enabled,
  onEnabledChange,
  frequency,
  onFrequencyChange,
  endMode,
  onEndModeChange,
  occurrenceCount,
  onOccurrenceCountChange,
  endDateStr,
  onEndDateStrChange,
  disabled,
}: AppointmentRecurrenceFieldsProps) {
  return (
    <fieldset className="note-appt-recurrence medicine-modal__frequency">
      <label className="note-appt-recurrence__toggle checkbox-field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          disabled={disabled}
        />
        <Repeat size={18} aria-hidden />
        <span>Recurring appointment</span>
      </label>

      {enabled && (
        <>
          <legend className="field-label">How often</legend>
          <div className="medicine-modal__radial note-appt-recurrence__freq">
            {RECURRENCE_FREQUENCY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`medicine-modal__freq-option${frequency === opt.value ? ' medicine-modal__freq-option--active' : ''}`}
              >
                <input
                  type="radio"
                  name="appt-recurrence-freq"
                  value={opt.value}
                  checked={frequency === opt.value}
                  onChange={() => onFrequencyChange(opt.value)}
                  disabled={disabled}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          <legend className="field-label">For how long</legend>
          <div className="medicine-modal__radial note-appt-recurrence__duration">
            <label
              className={`medicine-modal__freq-option${endMode === 'count' ? ' medicine-modal__freq-option--active' : ''}`}
            >
              <input
                type="radio"
                name="appt-recurrence-end"
                checked={endMode === 'count'}
                onChange={() => onEndModeChange('count')}
                disabled={disabled}
              />
              <span>Number of times</span>
            </label>
            <label
              className={`medicine-modal__freq-option${endMode === 'until' ? ' medicine-modal__freq-option--active' : ''}`}
            >
              <input
                type="radio"
                name="appt-recurrence-end"
                checked={endMode === 'until'}
                onChange={() => onEndModeChange('until')}
                disabled={disabled}
              />
              <span>Until a date</span>
            </label>
          </div>

          {endMode === 'count' ? (
            <label className="field-block">
              <span className="field-label">Total visits (including first)</span>
              <div className="note-appt-recurrence__count-row">
                <button
                  type="button"
                  className="note-appt-recurrence__step"
                  onClick={() => onOccurrenceCountChange(Math.max(2, occurrenceCount - 1))}
                  disabled={disabled || occurrenceCount <= 2}
                  aria-label="Fewer occurrences"
                >
                  −
                </button>
                <span className="note-appt-recurrence__count-value">{occurrenceCount}</span>
                <button
                  type="button"
                  className="note-appt-recurrence__step"
                  onClick={() => onOccurrenceCountChange(Math.min(52, occurrenceCount + 1))}
                  disabled={disabled || occurrenceCount >= 52}
                  aria-label="More occurrences"
                >
                  +
                </button>
              </div>
            </label>
          ) : (
            <div className="field-block">
              <span className="field-label">Last date</span>
              <FeedDateButton value={endDateStr} onChange={onEndDateStrChange} disabled={disabled} />
            </div>
          )}
        </>
      )}
    </fieldset>
  )
}
