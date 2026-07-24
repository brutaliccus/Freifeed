import { endOfDay, format, startOfDay } from 'date-fns'
import { expandAppointmentOccurrences } from './appointmentRecurrence'
import { noteVisibleForPersonId } from './notePeople'
import { NOTE_ARCHIVE_GRACE_MS } from './noteArchive'
import type { BabyNote } from '../types'

export interface TodayScheduledItem {
  note: BabyNote
  at: Date
}

function dayBounds(now = new Date()) {
  return { fromMs: startOfDay(now).getTime(), untilMs: endOfDay(now).getTime() }
}

/** Hide scheduled items on home once they are past due by the archive grace window. */
function isStillVisibleOnHome(at: Date, nowMs: number): boolean {
  return at.getTime() + NOTE_ARCHIVE_GRACE_MS > nowMs
}

function occurrencesToday(note: BabyNote, now = new Date()): Date[] {
  const nowMs = now.getTime()
  const { fromMs, untilMs } = dayBounds(now)
  return expandAppointmentOccurrences(note, { fromMs, untilMs }).filter((d) => {
    const t = d.getTime()
    return t >= fromMs && t <= untilMs && isStillVisibleOnHome(d, nowMs)
  })
}

export function todayAppointmentsForPerson(
  notes: BabyNote[],
  personId: string,
  now = new Date(),
): TodayScheduledItem[] {
  const items: TodayScheduledItem[] = []
  for (const note of notes) {
    if (note.archived || note.kind !== 'appointment') continue
    if (!noteVisibleForPersonId(note, personId)) continue
    for (const at of occurrencesToday(note, now)) {
      items.push({ note, at })
    }
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime())
  return items
}

export function todayRemindersForHousehold(
  notes: BabyNote[],
  now = new Date(),
): TodayScheduledItem[] {
  const items: TodayScheduledItem[] = []
  for (const note of notes) {
    if (note.archived || note.kind !== 'reminder') continue
    for (const at of occurrencesToday(note, now)) {
      items.push({ note, at })
    }
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime())
  return items
}

/** e.g. "Dental · Tue, Jun 16 · 11:30 AM" */
export function formatAppointmentShorthand(note: BabyNote, at: Date): string {
  const when = format(at, 'EEE, MMM d · h:mm a')
  return `${note.text.trim()} · ${when}`
}

export function formatReminderBannerLine(item: TodayScheduledItem): string {
  return `${item.note.text.trim()} · ${format(item.at, 'h:mm a')}`
}
