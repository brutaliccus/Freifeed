import {
  format,
  formatDistanceToNow,
  differenceInMinutes,
  differenceInCalendarDays,
  startOfDay,
  endOfDay,
  addDays,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
} from 'date-fns'
import type { Timestamp } from 'firebase/firestore'
import type { Diaper, Feeding, NursingSide } from '../types'

/**
 * Convert Firestore Timestamp-like values to Date without throwing.
 * Guards cold-start / corrupt-cache cases where `storedAt` etc. may be
 * missing, a plain `{__ts}` blob, or a non-Timestamp object.
 */
export function timestampToDate(ts: Timestamp | null | undefined): Date | null {
  if (ts == null) return null
  try {
    if (typeof (ts as Timestamp).toDate === 'function') {
      const d = (ts as Timestamp).toDate()
      return Number.isFinite(d.getTime()) ? d : null
    }
    if (typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
      const ms = (ts as { toMillis: () => number }).toMillis()
      return Number.isFinite(ms) ? new Date(ms) : null
    }
    if (typeof ts === 'object' && '__ts' in ts) {
      const ms = Number((ts as { __ts: unknown }).__ts)
      return Number.isFinite(ms) ? new Date(ms) : null
    }
    if (typeof ts === 'object' && 'seconds' in ts) {
      const seconds = Number((ts as { seconds: unknown }).seconds)
      const nanos = Number((ts as { nanoseconds?: unknown }).nanoseconds ?? 0)
      if (!Number.isFinite(seconds)) return null
      return new Date(seconds * 1000 + nanos / 1e6)
    }
    if (typeof ts === 'number' && Number.isFinite(ts)) return new Date(ts)
    if (typeof ts === 'string') {
      const d = new Date(ts)
      return Number.isFinite(d.getTime()) ? d : null
    }
  } catch {
    return null
  }
  return null
}

/** Sort-safe millis from a Timestamp-like value (0 if missing/invalid). */
export function timestampMs(ts: Timestamp | null | undefined): number {
  return timestampToDate(ts)?.getTime() ?? 0
}

export function dateToTimeInputValue(date: Date | null): string {
  if (!date) return ''
  return format(date, 'HH:mm')
}

/** Local calendar date as yyyy-MM-dd (avoids UTC drift from toISOString). */
export function todayLocalDateString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function parseDayLocal(dayStr: string): Date {
  const isoDay = dayStr.trim().slice(0, 10)
  const [year, month, day] = isoDay.split('-').map(Number)
  if (!year || !month || !day) return new Date(Number.NaN)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function combineDateAndTime(baseDate: Date, timeValue: string): Date | null {
  if (!timeValue) return null
  const [hours, minutes] = timeValue.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes, 0, 0)
}

export function formatTimeShort(date: Date | null): string {
  if (!date) return '—'
  return format(date, 'h:mm a')
}

export function formatSinceLast(date: Date | null): string {
  if (!date) return 'No feeds yet'
  return formatDistanceToNow(date, { addSuffix: true })
}

/** Like formatSinceLast but uses ~ instead of "about" for tighter home-card layout. */
export function formatSinceLastCompact(date: Date | null): string {
  return formatSinceLast(date).replace(/^about /i, '~ ')
}

export function feedDurationMinutes(feeding: Feeding): number | null {
  const start = timestampToDate(feeding.startAt)
  const end = timestampToDate(feeding.endAt)
  if (!start || !end) return null
  const mins = differenceInMinutes(end, start)
  return mins >= 0 ? mins : null
}

export function formatDuration(mins: number | null): string {
  if (mins == null) return ''
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function sideLabel(side: NursingSide | null): string {
  if (!side) return '—'
  if (side === 'both') return 'Both'
  return side === 'left' ? 'L' : 'R'
}

export function dayRange(date: Date) {
  return { start: startOfDay(date), end: endOfDay(date) }
}

export function weekRange(date: Date) {
  return { start: startOfWeek(date, { weekStartsOn: 0 }), end: endOfWeek(date, { weekStartsOn: 0 }) }
}

export function diaperInDay(diaper: Diaper, day: Date): boolean {
  const anchor = timestampToDate(diaper.changedAt) ?? timestampToDate(diaper.createdAt)
  if (!anchor) return false
  const { start, end } = dayRange(day)
  return isWithinInterval(anchor, { start, end })
}

export function feedingInDay(feeding: Feeding, day: Date): boolean {
  const anchor = timestampToDate(feeding.startAt) ?? timestampToDate(feeding.endAt) ?? timestampToDate(feeding.createdAt)
  if (!anchor) return false
  const { start, end } = dayRange(day)
  return isWithinInterval(anchor, { start, end })
}

export function feedingInWeek(feeding: Feeding, weekAnchor: Date): boolean {
  const anchor = timestampToDate(feeding.startAt) ?? timestampToDate(feeding.endAt) ?? timestampToDate(feeding.createdAt)
  if (!anchor) return false
  const { start, end } = weekRange(weekAnchor)
  return isWithinInterval(anchor, { start, end })
}

export function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7)
}

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

/** Minutes after local midnight on `viewDay` for a wall-clock instant (timeline positioning). */
export function minutesOnDay(instant: Date, viewDay: Date): number {
  const dayStart = startOfDay(viewDay)
  return (instant.getTime() - dayStart.getTime()) / 60_000
}

export function yPositionOnTimeline(
  date: Date,
  hourHeight: number,
  headerHeight: number,
): number {
  return headerHeight + (minutesSinceMidnight(date) / 60) * hourHeight
}

export const TIMELINE_HOUR_HEIGHT = 48
export const TIMELINE_DAY_HEIGHT = TIMELINE_HOUR_HEIGHT * 24

/** Fixed window for daily timelines — avoids DOM growing with every loaded document. */
export function getTimelineRangeForLoadedDays(daysLoaded: number): { origin: Date; dayCount: number } {
  const today = startOfDay(new Date())
  const days = Math.max(daysLoaded, 16)
  const origin = addDays(today, -days)
  const dayCount = days + 2
  return { origin, dayCount }
}

export function getDiaperTimelineRange(diapers: Diaper[]): { origin: Date; dayCount: number } {
  const today = startOfDay(new Date())
  let origin = addDays(today, -14)
  let lastDay = addDays(today, 1)

  for (const d of diapers) {
    const anchor = timestampToDate(d.changedAt) ?? timestampToDate(d.createdAt)
    if (!anchor) continue
    const dayStart = startOfDay(anchor)
    if (dayStart < origin) origin = dayStart
    if (dayStart > lastDay) lastDay = dayStart
  }

  const dayCount = differenceInCalendarDays(lastDay, origin) + 1
  return { origin, dayCount: Math.max(dayCount, 16) }
}

export function diaperInTimelineRange(diaper: Diaper, origin: Date, dayCount: number): boolean {
  const anchor = timestampToDate(diaper.changedAt) ?? timestampToDate(diaper.createdAt)
  if (!anchor) return false
  const rangeStart = origin
  const rangeEnd = endOfDay(addDays(origin, dayCount - 1))
  return anchor >= rangeStart && anchor <= rangeEnd
}

export function getTimelineRange(feedings: Feeding[]): { origin: Date; dayCount: number } {
  const today = startOfDay(new Date())
  let origin = addDays(today, -14)
  let lastDay = addDays(today, 1)

  for (const f of feedings) {
    const anchor =
      timestampToDate(f.startAt) ?? timestampToDate(f.endAt) ?? timestampToDate(f.createdAt)
    if (!anchor) continue
    const dayStart = startOfDay(anchor)
    if (dayStart < origin) origin = dayStart
    if (dayStart > lastDay) lastDay = dayStart
  }

  const dayCount = differenceInCalendarDays(lastDay, origin) + 1
  return { origin, dayCount: Math.max(dayCount, 16) }
}

export function feedingInTimelineRange(feeding: Feeding, origin: Date, dayCount: number): boolean {
  const start =
    timestampToDate(feeding.startAt) ??
    timestampToDate(feeding.endAt) ??
    timestampToDate(feeding.createdAt)
  if (!start) return false
  const end = timestampToDate(feeding.endAt) ?? start
  const rangeStart = origin
  const rangeEnd = endOfDay(addDays(origin, dayCount - 1))
  return start <= rangeEnd && end >= rangeStart
}

/** Y offset within a timeline track (0 = midnight on origin day). */
export function timelineYInTrack(
  instant: Date,
  origin: Date,
  hourHeight = TIMELINE_HOUR_HEIGHT,
): number {
  const dayIndex = differenceInCalendarDays(startOfDay(instant), startOfDay(origin))
  const dayHeight = hourHeight * 24
  return dayIndex * dayHeight + (minutesSinceMidnight(instant) / 60) * hourHeight
}

export function timelineDayAtScrollY(
  scrollY: number,
  trackOffset: number,
  origin: Date,
  dayCount: number,
  hourHeight = TIMELINE_HOUR_HEIGHT,
): Date {
  const dayHeight = hourHeight * 24
  const dayIndex = Math.floor((scrollY - trackOffset + dayHeight / 2) / dayHeight)
  const clamped = Math.max(0, Math.min(dayIndex, dayCount - 1))
  return addDays(origin, clamped)
}
