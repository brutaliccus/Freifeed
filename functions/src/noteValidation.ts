import { HttpsError } from 'firebase-functions/v2/https'
import { parseOptionalDate, parseForPersonId } from './helpers'

const NOTE_KINDS = ['todo', 'appointment', 'reminder', 'general'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

const SCHEDULED_KINDS = ['appointment', 'reminder'] as const
export type ScheduledNoteKind = (typeof SCHEDULED_KINDS)[number]

const REMINDER_MINUTES = [5, 10, 15, 30, 45, 60, 120, 180, 360, 720, 1440] as const
const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'] as const

export interface NoteInputPayload {
  kind?: unknown
  forPersonId?: unknown
  forPersonIds?: unknown
  babyId?: unknown
  text?: unknown
  details?: unknown
  scheduledAt?: unknown
  reminderMinutesBefore?: unknown
  recurrence?: unknown
  inviteePersonIds?: unknown
}

export interface ValidateNoteOptions {
  allowPastSchedule?: boolean
  forceKind?: NoteKind
}

async function parseForPersonIds(
  householdId: string,
  raw: NoteInputPayload,
): Promise<{ forPersonId: string; forPersonIds: string[] }> {
  const out: string[] = []
  const seen = new Set<string>()

  if (Array.isArray(raw.forPersonIds)) {
    for (const item of raw.forPersonIds) {
      if (typeof item !== 'string') continue
      const id = await parseForPersonId(householdId, item)
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }

  if (out.length === 0) {
    const personRaw =
      typeof raw.forPersonId === 'string'
        ? raw.forPersonId
        : typeof raw.babyId === 'string'
          ? `baby:${raw.babyId}`
          : raw.forPersonId
    const id = await parseForPersonId(householdId, personRaw)
    out.push(id)
  }

  if (out.length === 0) {
    throw new HttpsError('invalid-argument', 'Choose who this is for')
  }
  if (out.length > 12) {
    throw new HttpsError('invalid-argument', 'Too many people selected')
  }

  return { forPersonId: out[0]!, forPersonIds: out }
}

async function parseInviteePersonIds(
  householdId: string,
  raw: unknown,
  excludeIds: string[],
): Promise<string[]> {
  if (!Array.isArray(raw)) return []
  const exclude = new Set(excludeIds)
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = await parseForPersonId(householdId, item)
    if (exclude.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length > 12) {
      throw new HttpsError('invalid-argument', 'Too many invitees')
    }
  }
  return out
}

function parseRecurrence(
  raw: unknown,
  firstScheduledMs: number,
): {
  frequency: (typeof RECURRENCE_FREQUENCIES)[number]
  count: number | null
  endAt: string | null
} | null {
  if (raw == null || raw === false) return null
  if (typeof raw !== 'object') {
    throw new HttpsError('invalid-argument', 'Invalid recurrence')
  }
  const r = raw as Record<string, unknown>
  const frequency = r.frequency
  if (
    typeof frequency !== 'string' ||
    !RECURRENCE_FREQUENCIES.includes(frequency as (typeof RECURRENCE_FREQUENCIES)[number])
  ) {
    throw new HttpsError('invalid-argument', 'Invalid recurrence frequency')
  }

  const countRaw = r.count
  const endAtRaw = r.endAt
  const hasCount = countRaw != null && countRaw !== ''
  const hasEndAt = typeof endAtRaw === 'string' && endAtRaw.trim().length > 0

  if (!hasCount && !hasEndAt) {
    throw new HttpsError('invalid-argument', 'Recurrence needs a count or end date')
  }
  if (hasCount && hasEndAt) {
    throw new HttpsError('invalid-argument', 'Use either occurrence count or end date')
  }

  if (hasCount) {
    const count = Math.round(Number(countRaw))
    if (!Number.isFinite(count) || count < 2 || count > 52) {
      throw new HttpsError('invalid-argument', 'Occurrence count must be 2–52')
    }
    return { frequency: frequency as (typeof RECURRENCE_FREQUENCIES)[number], count, endAt: null }
  }

  const endDay = String(endAtRaw).trim().slice(0, 10)
  const endTs = parseOptionalDate(`${endDay}T23:59:59`)
  if (!endTs) {
    throw new HttpsError('invalid-argument', 'Invalid recurrence end date')
  }
  if (endTs.toMillis() < firstScheduledMs) {
    throw new HttpsError('invalid-argument', 'End date must be on or after the first occurrence')
  }

  return {
    frequency: frequency as (typeof RECURRENCE_FREQUENCIES)[number],
    count: null,
    endAt: endDay,
  }
}

async function validateScheduledFields(
  householdId: string,
  raw: NoteInputPayload,
  kind: ScheduledNoteKind,
  options?: ValidateNoteOptions,
) {
  const { forPersonId, forPersonIds } = await parseForPersonIds(householdId, raw)

  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (!text) throw new HttpsError('invalid-argument', 'Text required')
  if (text.length > 2000) throw new HttpsError('invalid-argument', 'Text too long')

  const scheduledAtIso =
    typeof raw.scheduledAt === 'string' ? raw.scheduledAt : String(raw.scheduledAt ?? '')
  const scheduledTs = parseOptionalDate(scheduledAtIso)
  if (!scheduledTs) {
    throw new HttpsError('invalid-argument', 'Date/time required')
  }
  const scheduledMs = scheduledTs.toMillis()
  if (!options?.allowPastSchedule && scheduledMs <= Date.now() - 60_000) {
    const label = kind === 'reminder' ? 'Reminder' : 'Appointment'
    throw new HttpsError('invalid-argument', `${label} must be in the future`)
  }

  const reminderRaw = Number(raw.reminderMinutesBefore)
  if (!Number.isFinite(reminderRaw)) {
    throw new HttpsError('invalid-argument', 'Reminder offset required')
  }
  const reminderMinutesBefore = Math.round(reminderRaw)
  if (!REMINDER_MINUTES.includes(reminderMinutesBefore as (typeof REMINDER_MINUTES)[number])) {
    throw new HttpsError('invalid-argument', 'Invalid reminder time')
  }

  const details =
    typeof raw.details === 'string' && raw.details.trim()
      ? raw.details.trim().slice(0, 2000)
      : null

  const recurrence = parseRecurrence(raw.recurrence, scheduledMs)
  const inviteePersonIds = await parseInviteePersonIds(
    householdId,
    raw.inviteePersonIds,
    forPersonIds,
  )

  return {
    kind,
    forPersonId,
    forPersonIds,
    text,
    details,
    scheduledAt: scheduledTs,
    reminderMinutesBefore,
    recurrence,
    inviteePersonIds,
  }
}

export async function validateNoteInput(
  householdId: string,
  raw: NoteInputPayload,
  options?: ValidateNoteOptions,
) {
  const kindRaw =
    options?.forceKind ?? (typeof raw.kind === 'string' ? raw.kind : 'todo')
  if (!NOTE_KINDS.includes(kindRaw as NoteKind)) {
    throw new HttpsError('invalid-argument', 'Invalid note type')
  }
  const kind = kindRaw as NoteKind

  if (kind === 'appointment' || kind === 'reminder') {
    return validateScheduledFields(householdId, raw, kind, options)
  }

  const { forPersonId, forPersonIds } = await parseForPersonIds(householdId, raw)

  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (!text) throw new HttpsError('invalid-argument', 'Text required')
  if (text.length > 2000) throw new HttpsError('invalid-argument', 'Text too long')

  return {
    kind,
    forPersonId,
    forPersonIds,
    text,
    details: null as string | null,
    scheduledAt: null,
    reminderMinutesBefore: null as number | null,
    recurrence: null,
    inviteePersonIds: [] as string[],
  }
}
