import { addDays, addMonths, addWeeks, endOfDay, format, parseISO } from 'date-fns'
import type { AppointmentRecurrence, BabyNote } from '../types'
import { timestampToDate } from './time'

export const RECURRENCE_FREQUENCY_OPTIONS: {
  value: AppointmentRecurrence['frequency']
  label: string
}[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
]

const FREQUENCY_LABEL: Record<AppointmentRecurrence['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

export function advanceOccurrence(
  date: Date,
  frequency: AppointmentRecurrence['frequency'],
): Date {
  switch (frequency) {
    case 'daily':
      return addDays(date, 1)
    case 'weekly':
      return addWeeks(date, 1)
    case 'biweekly':
      return addWeeks(date, 2)
    case 'monthly':
      return addMonths(date, 1)
    default:
      return addWeeks(date, 1)
  }
}

export function expandAppointmentOccurrences(
  note: BabyNote,
  options?: {
    fromMs?: number
    untilMs?: number
    maxCount?: number
  },
): Date[] {
  const start = timestampToDate(note.scheduledAt)
  if (!start) return []

  const fromMs = options?.fromMs ?? start.getTime()
  const untilMs = options?.untilMs ?? start.getTime() + 365 * 24 * 60 * 60_000
  const maxCount = options?.maxCount ?? 120
  const recurrence = note.recurrence

  if (!recurrence) {
    return start.getTime() >= fromMs && start.getTime() <= untilMs ? [start] : []
  }

  const endLimitMs = recurrence.endAt
    ? endOfDay(parseISO(recurrence.endAt.slice(0, 10))).getTime()
    : null
  const maxByCount = recurrence.count != null ? recurrence.count : maxCount

  const out: Date[] = []
  let current = new Date(start.getTime())
  let i = 0

  while (i < maxByCount && i < maxCount) {
    const t = current.getTime()
    if (endLimitMs != null && t > endLimitMs) break
    if (t > untilMs) break
    if (t >= fromMs) out.push(new Date(t))
    current = advanceOccurrence(current, recurrence.frequency)
    i++
  }

  return out
}

export function lastAppointmentOccurrence(note: BabyNote, untilMs = Date.now()): Date | null {
  const start = timestampToDate(note.scheduledAt)
  if (!start) return null
  const dates = expandAppointmentOccurrences(note, {
    fromMs: start.getTime(),
    untilMs,
  })
  return dates.length > 0 ? dates[dates.length - 1]! : null
}

export function nextAppointmentOccurrence(note: BabyNote, fromMs = Date.now()): Date | null {
  const dates = expandAppointmentOccurrences(note, {
    fromMs,
    untilMs: fromMs + 365 * 24 * 60 * 60_000,
  })
  return dates[0] ?? null
}

export function describeRecurrence(
  recurrence: AppointmentRecurrence,
  firstAt: Date | null,
): string {
  const freq = FREQUENCY_LABEL[recurrence.frequency] ?? recurrence.frequency
  if (recurrence.count != null) {
    return `${freq} · ${recurrence.count} times`
  }
  if (recurrence.endAt) {
    try {
      const end = parseISO(recurrence.endAt.slice(0, 10))
      return `${freq} until ${format(end, 'MMM d, yyyy')}`
    } catch {
      return `${freq} until set date`
    }
  }
  if (firstAt) {
    return `${freq} from ${format(firstAt, 'MMM d')}`
  }
  return freq
}
