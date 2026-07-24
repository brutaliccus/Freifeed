import { format, isValid } from 'date-fns'
import {
  MedicineAlertNative,
  type MedicineAlertScheduleItem,
} from './medicineAlertNative'
import { isAppointmentSubjectWatchEnabled } from './noteSubjects'
import { ensureNativeNotificationPermission } from './nativeNotifications'
import { isAndroidNative } from './platform'
import type { BabyNote } from '../types'
import type { Timestamp } from 'firebase/firestore'
import { expandAppointmentOccurrences } from './appointmentRecurrence'
import { noteForPersonIds, noteInvolvedPersonIds } from './notePeople'
import { subjectLabel, type NoteSubject } from './noteSubjects'

/** Must stay in sync with native notification id range usage. */
export const APPOINTMENT_ALERT_ID_BASE = 44_000
export const APPOINTMENT_ALERT_ID_SPAN = 8_000

function stableId(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h) % APPOINTMENT_ALERT_ID_SPAN
}

/** All native alarm ids that may have been scheduled for this note (bucket 0–511). */
export function appointmentNotificationIdsForNote(noteId: string): number[] {
  const base = stableId(noteId)
  const ids = new Set<number>()
  for (let bucket = 0; bucket < 512; bucket++) {
    ids.add(APPOINTMENT_ALERT_ID_BASE + ((base * 513 + bucket) % APPOINTMENT_ALERT_ID_SPAN))
  }
  return [...ids]
}

export async function cancelAppointmentNotificationsForNote(noteId: string): Promise<void> {
  if (!isAndroidNative()) return
  const ids = appointmentNotificationIdsForNote(noteId)
  try {
    await MedicineAlertNative.cancelScheduledIds({ ids })
  } catch {
    /* plugin unavailable */
  }
  lastScheduledIds = lastScheduledIds.filter((id) => !ids.includes(id))
  lastNativeSyncAt = 0
}

function appointmentNotifId(noteId: string, dueMs: number): number {
  const bucket = Math.abs(Math.floor(dueMs / 60_000)) % 512
  return APPOINTMENT_ALERT_ID_BASE + ((stableId(noteId) * 513 + bucket) % APPOINTMENT_ALERT_ID_SPAN)
}

/** Prefix for MedicineAlertNative payloads — Android skips "I took it" action. */
export function appointmentAlertKey(noteId: string): string {
  return `apt:${noteId}`
}

function safeInviteeIds(note: BabyNote): string[] {
  return Array.isArray(note.inviteePersonIds) ? note.inviteePersonIds : []
}

function involvedPersonIds(note: BabyNote): string[] {
  return noteInvolvedPersonIds(note)
}

function shouldNotifyForNote(householdId: string, note: BabyNote): boolean {
  return involvedPersonIds(note).some((id) =>
    isAppointmentSubjectWatchEnabled(householdId, id),
  )
}

function occurrenceKey(noteId: string, dueMs: number): string {
  return `${appointmentAlertKey(noteId)}:${dueMs}`
}

function safeMillis(ts: Timestamp | null | undefined): number | null {
  if (!ts || typeof ts.toMillis !== 'function') return null
  try {
    return ts.toMillis()
  } catch {
    return null
  }
}

/** Stable signature for debouncing native reschedule work. */
export function appointmentScheduleSignature(
  notes: BabyNote[],
  watchSig: string,
): string {
  try {
    return JSON.stringify({
      watch: watchSig,
      notes: notes
        .filter(
          (n) =>
            (n.kind === 'appointment' || n.kind === 'reminder') &&
            !n.archived &&
            n.scheduledAt,
        )
        .map((n) => [
          n.id,
          n.kind,
          safeMillis(n.scheduledAt),
          n.reminderMinutesBefore,
          n.recurrence,
          noteForPersonIds(n),
          safeInviteeIds(n),
          n.text,
          safeMillis(n.updatedAt),
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    })
  } catch {
    return ''
  }
}

let lastScheduledIds: number[] = []
let lastNativeSyncAt = 0
let syncInFlight = false
let syncQueued = false
const MIN_NATIVE_SYNC_MS = 90_000

/** Wipe orphan appointment alarms (e.g. deleted notes) — full range, use sparingly. */
async function cancelAllScheduledAppointmentAlarms(): Promise<void> {
  if (!isAndroidNative()) return
  try {
    await MedicineAlertNative.cancelScheduledInRange({
      baseId: APPOINTMENT_ALERT_ID_BASE,
      count: APPOINTMENT_ALERT_ID_SPAN,
    })
  } catch {
    /* plugin unavailable */
  }
  lastScheduledIds = []
}

async function cancelKnownScheduledAppointmentAlarms(): Promise<void> {
  if (!isAndroidNative() || lastScheduledIds.length === 0) return
  try {
    await MedicineAlertNative.cancelScheduledIds({ ids: lastScheduledIds })
  } catch {
    /* plugin unavailable */
  }
  lastScheduledIds = []
}

export async function syncNativeAppointmentNotifications(
  notes: BabyNote[],
  subjects: NoteSubject[],
  householdId: string,
  options?: { force?: boolean },
): Promise<void> {
  if (!isAndroidNative()) return

  const now = Date.now()
  if (!options?.force && now - lastNativeSyncAt < MIN_NATIVE_SYNC_MS) return

  if (syncInFlight) {
    syncQueued = true
    return
  }

  syncInFlight = true
  try {
    await syncNativeAppointmentNotificationsInner(notes, subjects, householdId)
    lastNativeSyncAt = Date.now()
  } catch (err) {
    console.error('[appointment-notifications] sync failed', err)
  } finally {
    syncInFlight = false
    if (syncQueued) {
      syncQueued = false
      void syncNativeAppointmentNotifications(notes, subjects, householdId, { force: true })
    }
  }
}

async function syncNativeAppointmentNotificationsInner(
  notes: BabyNote[],
  subjects: NoteSubject[],
  householdId: string,
): Promise<void> {
  if (!(await ensureNativeNotificationPermission())) return

  await cancelKnownScheduledAppointmentAlarms()

  const now = Date.now()
  const byOccurrence = new Map<string, MedicineAlertScheduleItem>()
  const horizon = now + 90 * 24 * 60 * 60_000
  const maxOccurrencesPerNote = 48

  for (const note of notes) {
    if ((note.kind !== 'appointment' && note.kind !== 'reminder') || note.archived) continue
    if (!shouldNotifyForNote(householdId, note)) continue

    const remindBefore = note.reminderMinutesBefore ?? 15
    const isReminder = note.kind === 'reminder'
    let occurrences: Date[]
    try {
      occurrences = expandAppointmentOccurrences(note, {
        fromMs: now,
        untilMs: horizon,
        maxCount: maxOccurrencesPerNote,
      })
    } catch {
      continue
    }

    const forLabels = noteForPersonIds(note)
      .map((id) => subjectLabel(subjects, id))
      .filter(Boolean)
    const person = forLabels.join(', ') || 'Household'
    const inviteeLabels = safeInviteeIds(note)
      .map((id) => subjectLabel(subjects, id))
      .filter(Boolean)
    const withLine =
      inviteeLabels.length > 0 ? ` · with ${inviteeLabels.join(', ')}` : ''

    for (const at of occurrences) {
      if (!isValid(at)) continue
      const dueMs = at.getTime()
      const fireAt = dueMs - remindBefore * 60_000
      if (fireAt <= now) continue

      const key = occurrenceKey(note.id, dueMs)
      if (byOccurrence.has(key)) continue

      const when = format(at, 'EEE M/d h:mm a')
      byOccurrence.set(key, {
        id: appointmentNotifId(note.id, dueMs),
        atMs: fireAt,
        title: `${isReminder ? 'Reminder' : 'Appointment'} — ${person}`,
        body: `${note.text} · ${when}${withLine}`,
        medicineId: appointmentAlertKey(note.id),
        dueMs,
      })
    }
  }

  const toSchedule = [...byOccurrence.values()]
  lastScheduledIds = toSchedule.map((item) => item.id)

  if (toSchedule.length > 0) {
    try {
      await MedicineAlertNative.scheduleAlarms({ items: toSchedule })
    } catch {
      lastScheduledIds = []
      /* plugin unavailable */
    }
  }
}

export async function clearNativeAppointmentNotifications(): Promise<void> {
  if (!isAndroidNative()) return
  lastNativeSyncAt = 0
  try {
    await cancelAllScheduledAppointmentAlarms()
  } catch {
    /* plugin unavailable */
  }
}
