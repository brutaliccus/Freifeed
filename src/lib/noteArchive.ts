import { expandAppointmentOccurrences, lastAppointmentOccurrence } from './appointmentRecurrence'
import { isScheduledNoteKind } from './notePeople'
import { timestampToDate } from './time'
import type { BabyNote } from '../types'

/** Move past appointments/reminders to archive this long after their due time. */
export const NOTE_ARCHIVE_GRACE_MS = 2 * 60 * 60 * 1000

export function hasUpcomingOccurrences(note: BabyNote, nowMs: number): boolean {
  if (!isScheduledNoteKind(note.kind) || !note.scheduledAt) return false
  const horizon = nowMs + 365 * 24 * 60 * 60_000
  return expandAppointmentOccurrences(note, { fromMs: nowMs, untilMs: horizon }).length > 0
}

/** Latest occurrence that is past due by at least NOTE_ARCHIVE_GRACE_MS. */
export function latestOccurrenceReadyToArchive(
  note: BabyNote,
  nowMs: number,
): Date | null {
  if (!isScheduledNoteKind(note.kind) || note.archived || !note.scheduledAt) return null

  const cutoff = nowMs - NOTE_ARCHIVE_GRACE_MS
  const seriesStart = timestampToDate(note.scheduledAt)
  if (!seriesStart) return null

  const occurrences = expandAppointmentOccurrences(note, {
    fromMs: seriesStart.getTime(),
    untilMs: cutoff,
    maxCount: 500,
  })
  if (occurrences.length === 0) return null
  return occurrences[occurrences.length - 1] ?? null
}

export function hasOlderArchivedNotes(
  notes: BabyNote[],
  nowMs: number,
  archiveDays: number,
): boolean {
  const cutoff = nowMs - archiveDays * 86_400_000
  return notes.some((n) => {
    if (!noteShowsInArchivePanel(n) && !n.archived) return false
    return noteArchiveDisplayMs(n, nowMs) < cutoff
  })
}

export function noteArchiveDisplayMs(note: BabyNote, nowMs: number): number {
  const occ = archivedOccurrenceDisplayAt(note, nowMs)
  if (occ) return occ.getTime()
  if (note.completedAt) return note.completedAt.toMillis()
  return note.updatedAt.toMillis()
}

export function noteInArchiveWindow(
  note: BabyNote,
  nowMs: number,
  archiveDays: number,
): boolean {
  if (!noteShowsInArchivePanel(note) && !note.archived) return false
  const cutoff = nowMs - archiveDays * 86_400_000
  return noteArchiveDisplayMs(note, nowMs) >= cutoff
}

export function noteShowsInArchivePanel(note: BabyNote): boolean {
  if (note.archived) return true
  if (
    isScheduledNoteKind(note.kind) &&
    note.recurrence &&
    note.lastArchivedOccurrenceAt != null
  ) {
    return true
  }
  return false
}

export function isOccurrenceArchiveEntry(note: BabyNote): boolean {
  return (
    !note.archived &&
    isScheduledNoteKind(note.kind) &&
    !!note.recurrence &&
    note.lastArchivedOccurrenceAt != null
  )
}

export function archivedOccurrenceDisplayAt(note: BabyNote, nowMs: number): Date | null {
  if (note.lastArchivedOccurrenceAt) {
    return timestampToDate(note.lastArchivedOccurrenceAt)
  }
  if (note.archived && isScheduledNoteKind(note.kind)) {
    return lastAppointmentOccurrence(note, nowMs) ?? timestampToDate(note.scheduledAt)
  }
  return null
}

export type NoteArchiveAction =
  | { type: 'full'; noteId: string }
  | { type: 'occurrence'; noteId: string; occurrenceAt: string }

export function computeNoteArchiveActions(
  notes: BabyNote[],
  nowMs: number,
): NoteArchiveAction[] {
  const actions: NoteArchiveAction[] = []

  for (const note of notes) {
    if (!isScheduledNoteKind(note.kind) || note.archived) continue
    if (!note.scheduledAt) continue

    const ready = latestOccurrenceReadyToArchive(note, nowMs)
    if (!ready) continue

    const readyMs = ready.getTime()
    const lastArchivedMs = note.lastArchivedOccurrenceAt?.toMillis?.() ?? null

    if (note.recurrence && hasUpcomingOccurrences(note, nowMs)) {
      if (lastArchivedMs == null || readyMs > lastArchivedMs) {
        actions.push({
          type: 'occurrence',
          noteId: note.id,
          occurrenceAt: ready.toISOString(),
        })
      }
      continue
    }

    if (!hasUpcomingOccurrences(note, nowMs)) {
      actions.push({ type: 'full', noteId: note.id })
    }
  }

  return actions
}
