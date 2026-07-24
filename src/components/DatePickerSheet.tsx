import { useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayLocalDateString } from '../lib/time'

interface DatePickerSheetProps {
  value: string
  title?: string
  onClose: () => void
  onConfirm: (yyyyMmDd: string) => void
}

export function DatePickerSheet({ value, title = 'Pick date', onClose, onConfirm }: DatePickerSheetProps) {
  const initial = useMemo(() => {
    try {
      return parseISO(value || todayLocalDateString())
    } catch {
      return new Date()
    }
  }, [value])

  const [month, setMonth] = useState(() => startOfMonth(initial))
  const [selected, setSelected] = useState(initial)

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 })
    const days = eachDayOfInterval({ start, end })
    const rows: Date[][] = []
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7))
    }
    return rows
  }, [month])

  return (
    <div className="modal-overlay picker-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet picker-sheet"
        role="dialog"
        aria-labelledby="date-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header picker-sheet__month-header">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft size={22} />
          </button>
          <h2 id="date-picker-title">{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight size={22} />
          </button>
        </header>
        <p className="picker-sheet__preview">{format(month, 'MMMM yyyy')}</p>
        <div className="picker-calendar">
          <div className="picker-calendar__dow">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <span key={d} className="picker-calendar__dow-cell muted">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="picker-calendar__week">
              {week.map((day) => {
                const inMonth = isSameMonth(day, month)
                const isSelected = isSameDay(day, selected)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={[
                      'picker-calendar__day',
                      inMonth ? '' : 'picker-calendar__day--outside',
                      isSelected ? 'picker-calendar__day--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelected(day)}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <footer className="modal__footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(format(selected, 'yyyy-MM-dd'))}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
