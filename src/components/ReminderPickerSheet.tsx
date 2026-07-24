import { APPOINTMENT_REMINDER_OPTIONS } from '../lib/noteReminders'

interface ReminderPickerSheetProps {
  value: number
  title?: string
  onClose: () => void
  onConfirm: (minutes: number) => void
}

export function ReminderPickerSheet({
  value,
  title = 'Remind me',
  onClose,
  onConfirm,
}: ReminderPickerSheetProps) {
  return (
    <div className="modal-overlay picker-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet picker-sheet reminder-picker-sheet"
        role="dialog"
        aria-labelledby="reminder-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-sheet__header">
          <h2 id="reminder-picker-title">{title}</h2>
        </header>
        <p className="reminder-picker-sheet__hint muted">
          Notification before the appointment starts
        </p>
        <div className="reminder-picker-sheet__grid">
          {APPOINTMENT_REMINDER_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              className={`picker-grid__cell reminder-picker-sheet__option${value === opt.minutes ? ' picker-grid__cell--active' : ''}`}
              onClick={() => onConfirm(opt.minutes)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <footer className="picker-sheet__footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}
