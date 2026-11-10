import type { FastifyInstance } from 'fastify'
import { getDb, nowIso, parseJson, toJson, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { assertHouseholdMember, parseForPersonId } from '../household.js'
import { MAX_LIST_LIMIT } from '../listQuery.js'
import { parseOptionalDate } from '../milk/validation.js'
import { registerCallable } from './helpers.js'

const NOTE_KINDS = ['todo', 'appointment', 'reminder', 'general'] as const
const REMINDER_MINUTES = [5, 10, 15, 30, 45, 60, 120, 180, 360, 720, 1440] as const
const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'] as const

type NoteKind = (typeof NOTE_KINDS)[number]

async function parseForPersonIds(householdId: string, raw: Record<string, unknown>) {
  const out: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw.forPersonIds)) {
    for (const item of raw.forPersonIds) {
      if (typeof item !== 'string') continue
      const id = parseForPersonId(householdId, item)
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
    out.push(parseForPersonId(householdId, personRaw))
  }
  if (out.length === 0) throw new HttpsError('invalid-argument', 'Choose who this is for')
  if (out.length > 12) throw new HttpsError('invalid-argument', 'Too many people selected')
  return { forPersonId: out[0]!, forPersonIds: out }
}

function parseRecurrence(raw: unknown, firstScheduledMs: number) {
  if (raw == null || raw === false) return null
  if (typeof raw !== 'object') throw new HttpsError('invalid-argument', 'Invalid recurrence')
  const r = raw as Record<string, unknown>
  const frequency = r.frequency
  if (
    typeof frequency !== 'string' ||
    !RECURRENCE_FREQUENCIES.includes(frequency as (typeof RECURRENCE_FREQUENCIES)[number])
  ) {
    throw new HttpsError('invalid-argument', 'Invalid recurrence frequency')
  }
  const hasCount = r.count != null && r.count !== ''
  const hasEndAt = typeof r.endAt === 'string' && r.endAt.trim().length > 0
  if (!hasCount && !hasEndAt) {
    throw new HttpsError('invalid-argument', 'Recurrence needs a count or end date')
  }
  if (hasCount && hasEndAt) {
    throw new HttpsError('invalid-argument', 'Use either occurrence count or end date')
  }
  if (hasCount) {
    const count = Math.round(Number(r.count))
    if (!Number.isFinite(count) || count < 2 || count > 52) {
      throw new HttpsError('invalid-argument', 'Occurrence count must be 2–52')
    }
    return {
      frequency: frequency as (typeof RECURRENCE_FREQUENCIES)[number],
      count,
      endAt: null as string | null,
    }
  }
  const endDay = String(r.endAt).trim().slice(0, 10)
  const endTs = parseOptionalDate(`${endDay}T23:59:59`)
  if (!endTs) throw new HttpsError('invalid-argument', 'Invalid recurrence end date')
  if (new Date(endTs).getTime() < firstScheduledMs) {
    throw new HttpsError('invalid-argument', 'End date must be on or after the first occurrence')
  }
  return {
    frequency: frequency as (typeof RECURRENCE_FREQUENCIES)[number],
    count: null as number | null,
    endAt: endDay,
  }
}

async function validateNoteInput(
  householdId: string,
  raw: Record<string, unknown>,
  options?: { allowPastSchedule?: boolean; forceKind?: NoteKind },
) {
  const kindRaw = options?.forceKind ?? (typeof raw.kind === 'string' ? raw.kind : 'todo')
  if (!NOTE_KINDS.includes(kindRaw as NoteKind)) {
    throw new HttpsError('invalid-argument', 'Invalid note type')
  }
  const kind = kindRaw as NoteKind
  const { forPersonId, forPersonIds } = await parseForPersonIds(householdId, raw)
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (!text) throw new HttpsError('invalid-argument', 'Text required')
  if (text.length > 2000) throw new HttpsError('invalid-argument', 'Text too long')

  if (kind === 'appointment' || kind === 'reminder') {
    const scheduledAtIso =
      typeof raw.scheduledAt === 'string' ? raw.scheduledAt : String(raw.scheduledAt ?? '')
    const scheduledAt = parseOptionalDate(scheduledAtIso)
    if (!scheduledAt) throw new HttpsError('invalid-argument', 'Date/time required')
    const scheduledMs = new Date(scheduledAt).getTime()
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
    const inviteePersonIds: string[] = []
    if (Array.isArray(raw.inviteePersonIds)) {
      const exclude = new Set(forPersonIds)
      for (const item of raw.inviteePersonIds) {
        if (typeof item !== 'string') continue
        const id = parseForPersonId(householdId, item)
        if (exclude.has(id) || inviteePersonIds.includes(id)) continue
        inviteePersonIds.push(id)
      }
    }
    return {
      kind,
      forPersonId,
      forPersonIds,
      text,
      details,
      scheduledAt,
      reminderMinutesBefore,
      recurrence,
      inviteePersonIds,
    }
  }

  return {
    kind,
    forPersonId,
    forPersonIds,
    text,
    details: null as string | null,
    scheduledAt: null as string | null,
    reminderMinutesBefore: null as number | null,
    recurrence: null,
    inviteePersonIds: [] as string[],
  }
}

function legacyBabyId(forPersonId: string): string | null {
  return forPersonId.startsWith('baby:') ? forPersonId.slice(5) : null
}

function serialize(row: Record<string, unknown>) {
  const forPersonId =
    typeof row.for_person_id === 'string' && row.for_person_id.includes(':')
      ? row.for_person_id
      : row.baby_id
        ? `baby:${row.baby_id}`
        : ''
  const forPersonIds = parseJson<string[]>(row.for_person_ids as string, [])
  const ids = forPersonIds.length > 0 ? forPersonIds : forPersonId ? [forPersonId] : []
  return {
    id: String(row.id),
    forPersonId: ids[0] ?? forPersonId,
    forPersonIds: ids,
    babyId: legacyBabyId(ids[0] ?? forPersonId),
    kind: typeof row.kind === 'string' ? row.kind : 'todo',
    text: row.text,
    details: (row.details as string | null) ?? null,
    scheduledAt: (row.scheduled_at as string | null) ?? null,
    reminderMinutesBefore:
      typeof row.reminder_minutes_before === 'number' ? row.reminder_minutes_before : null,
    recurrence: parseJson(row.recurrence as string, null),
    inviteePersonIds: parseJson<string[]>(row.invitee_person_ids as string, []),
    archived: row.archived === 1,
    completedAt: (row.completed_at as string | null) ?? null,
    lastArchivedOccurrenceAt: (row.last_archived_occurrence_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function registerNoteRoutes(app: FastifyInstance) {
  registerCallable(app, 'listNotes', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const rows = getDb()
      .prepare(`SELECT * FROM notes WHERE household_id=? ORDER BY created_at DESC LIMIT ?`)
      .all(householdId, MAX_LIST_LIMIT) as Record<string, unknown>[]
    return { notes: rows.map(serialize) }
  })

  registerCallable(
    app,
    'createNote',
    async (uid, body) => {
      const householdId = body.householdId as string
      const input = body.input as Record<string, unknown>
      if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const parsed = await validateNoteInput(householdId, input)
      const id = newId()
      const now = nowIso()
      getDb()
        .prepare(
          `INSERT INTO notes (id, household_id, for_person_id, for_person_ids, baby_id, kind, text,
            details, scheduled_at, reminder_minutes_before, recurrence, invitee_person_ids,
            archived, completed_at, last_archived_occurrence_at, last_actor_uid, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, ?)`,
        )
        .run(
          id,
          householdId,
          parsed.forPersonId,
          toJson(parsed.forPersonIds),
          legacyBabyId(parsed.forPersonId),
          parsed.kind,
          parsed.text,
          parsed.details,
          parsed.scheduledAt,
          parsed.reminderMinutesBefore,
          toJson(parsed.recurrence),
          toJson(parsed.inviteePersonIds),
          uid,
          now,
          now,
        )
      return { noteId: id }
    },
    { collections: () => ['notes'] },
  )

  registerCallable(
    app,
    'updateNote',
    async (uid, body) => {
      const householdId = body.householdId as string
      const noteId = body.noteId as string
      const input = body.input as Record<string, unknown>
      if (!householdId || !noteId || !input) {
        throw new HttpsError('invalid-argument', 'Missing fields')
      }
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const existing = db
        .prepare('SELECT * FROM notes WHERE household_id=? AND id=?')
        .get(householdId, noteId) as Record<string, unknown> | undefined
      if (!existing) throw new HttpsError('not-found', 'Note not found')
      const existingKind =
        typeof existing.kind === 'string' ? (existing.kind as NoteKind) : 'todo'
      const parsed = await validateNoteInput(householdId, input, {
        allowPastSchedule: true,
        forceKind: existingKind,
      })
      db.prepare(
        `UPDATE notes SET for_person_id=?, for_person_ids=?, baby_id=?, text=?, details=?,
          scheduled_at=?, reminder_minutes_before=?, recurrence=?, invitee_person_ids=?,
          last_actor_uid=?, updated_at=? WHERE household_id=? AND id=?`,
      ).run(
        parsed.forPersonId,
        toJson(parsed.forPersonIds),
        legacyBabyId(parsed.forPersonId),
        parsed.text,
        parsed.details,
        parsed.scheduledAt,
        parsed.reminderMinutesBefore,
        toJson(parsed.recurrence),
        toJson(parsed.inviteePersonIds),
        uid,
        nowIso(),
        householdId,
        noteId,
      )
      return { ok: true }
    },
    { collections: () => ['notes'] },
  )

  registerCallable(
    app,
    'archiveNote',
    (uid, body) => {
      const householdId = body.householdId as string
      const noteId = body.noteId as string
      if (!householdId || !noteId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const existing = db
        .prepare('SELECT * FROM notes WHERE household_id=? AND id=?')
        .get(householdId, noteId) as Record<string, unknown> | undefined
      if (!existing) throw new HttpsError('not-found', 'Note not found')
      const kind = typeof existing.kind === 'string' ? existing.kind : 'todo'
      const recurrence = parseJson(existing.recurrence as string, null)
      if (
        body.occurrenceAt &&
        (kind === 'appointment' || kind === 'reminder') &&
        recurrence
      ) {
        const at = new Date(String(body.occurrenceAt))
        if (Number.isNaN(at.getTime())) {
          throw new HttpsError('invalid-argument', 'Invalid occurrence time')
        }
        db.prepare(
          `UPDATE notes SET last_archived_occurrence_at=?, last_actor_uid=?, updated_at=?
           WHERE household_id=? AND id=?`,
        ).run(at.toISOString(), uid, nowIso(), householdId, noteId)
        return { ok: true }
      }
      const now = nowIso()
      db.prepare(
        `UPDATE notes SET archived=1, completed_at=?, last_actor_uid=?, updated_at=?
         WHERE household_id=? AND id=?`,
      ).run(now, uid, now, householdId, noteId)
      return { ok: true }
    },
    { collections: () => ['notes'] },
  )

  registerCallable(
    app,
    'unarchiveNote',
    (uid, body) => {
      const householdId = body.householdId as string
      const noteId = body.noteId as string
      if (!householdId || !noteId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const existing = db
        .prepare('SELECT id FROM notes WHERE household_id=? AND id=?')
        .get(householdId, noteId)
      if (!existing) throw new HttpsError('not-found', 'Note not found')
      if (body.clearOccurrence) {
        db.prepare(
          `UPDATE notes SET last_archived_occurrence_at=NULL, last_actor_uid=?, updated_at=?
           WHERE household_id=? AND id=?`,
        ).run(uid, nowIso(), householdId, noteId)
        return { ok: true }
      }
      db.prepare(
        `UPDATE notes SET archived=0, completed_at=NULL, last_actor_uid=?, updated_at=?
         WHERE household_id=? AND id=?`,
      ).run(uid, nowIso(), householdId, noteId)
      return { ok: true }
    },
    { collections: () => ['notes'] },
  )

  registerCallable(
    app,
    'deleteNote',
    (uid, body) => {
      const householdId = body.householdId as string
      const noteId = body.noteId as string
      if (!householdId || !noteId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const existing = db
        .prepare('SELECT id FROM notes WHERE household_id=? AND id=?')
        .get(householdId, noteId)
      if (!existing) throw new HttpsError('not-found', 'Note not found')
      db.prepare('DELETE FROM notes WHERE household_id=? AND id=?').run(householdId, noteId)
      return { ok: true }
    },
    { collections: () => ['notes'] },
  )
}
