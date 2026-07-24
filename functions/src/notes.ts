import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  db,
  requireUid,
  serializeTimestamp,
  assertHouseholdMember,
  FieldValue,
  Timestamp,
} from './helpers'
import { validateNoteInput, type NoteInputPayload } from './noteValidation'
import { MAX_LIST_LIMIT } from './listQuery'

const region = 'us-central1'
const callableOptions = { region, invoker: 'public' as const }

function parseInviteeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is string => typeof id === 'string' && id.includes(':'))
}

function parseForPersonIdsFromDoc(
  data: Record<string, unknown>,
  fallbackForPersonId: string,
): string[] {
  const raw = data.forPersonIds
  if (Array.isArray(raw)) {
    const ids = raw.filter((id): id is string => typeof id === 'string' && id.includes(':'))
    if (ids.length > 0) return ids
  }
  return fallbackForPersonId ? [fallbackForPersonId] : []
}

function legacyBabyId(forPersonId: string): string | null {
  return forPersonId.startsWith('baby:') ? forPersonId.slice(5) : null
}

function parseRecurrenceFromDoc(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const frequency = r.frequency
  if (typeof frequency !== 'string') return null
  return {
    frequency,
    count: typeof r.count === 'number' ? r.count : null,
    endAt: typeof r.endAt === 'string' ? r.endAt : null,
  }
}

export const listNotes = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const snap = await db
    .collection(`households/${householdId}/notes`)
    .orderBy('createdAt', 'desc')
    .limit(MAX_LIST_LIMIT)
    .get()

  const notes = snap.docs.map((d) => {
    const data = d.data()
    const forPersonId =
      typeof data.forPersonId === 'string' && data.forPersonId.includes(':')
        ? data.forPersonId
        : data.babyId
          ? `baby:${data.babyId}`
          : ''
    const forPersonIds = parseForPersonIdsFromDoc(data, forPersonId)
    return {
      id: d.id,
      forPersonId: forPersonIds[0] ?? forPersonId,
      forPersonIds,
      babyId: legacyBabyId(forPersonIds[0] ?? forPersonId),
      kind: typeof data.kind === 'string' ? data.kind : 'todo',
      text: data.text,
      details: data.details ?? null,
      scheduledAt: serializeTimestamp(data.scheduledAt as Timestamp | undefined),
      reminderMinutesBefore:
        typeof data.reminderMinutesBefore === 'number' ? data.reminderMinutesBefore : null,
      recurrence: parseRecurrenceFromDoc(data.recurrence),
      inviteePersonIds: parseInviteeIds(data.inviteePersonIds),
      archived: data.archived === true,
      completedAt: serializeTimestamp(data.completedAt as Timestamp | undefined),
      lastArchivedOccurrenceAt: serializeTimestamp(
        data.lastArchivedOccurrenceAt as Timestamp | undefined,
      ),
      createdAt: serializeTimestamp(data.createdAt as Timestamp)!,
      updatedAt: serializeTimestamp(data.updatedAt as Timestamp)!,
    }
  })

  return { notes }
})

export const createNote = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, input } = request.data as {
    householdId: string
    input: NoteInputPayload
  }
  if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const parsed = await validateNoteInput(householdId, input)

  const ref = await db.collection(`households/${householdId}/notes`).add({
    forPersonId: parsed.forPersonId,
    forPersonIds: parsed.forPersonIds,
    babyId: legacyBabyId(parsed.forPersonId),
    kind: parsed.kind,
    text: parsed.text,
    details: parsed.details,
    scheduledAt: parsed.scheduledAt,
    reminderMinutesBefore: parsed.reminderMinutesBefore,
    recurrence: parsed.recurrence,
    inviteePersonIds: parsed.inviteePersonIds,
    archived: false,
    completedAt: null,
    lastArchivedOccurrenceAt: null,
    lastActorUid: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { noteId: ref.id }
})

export const updateNote = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, noteId, input } = request.data as {
    householdId: string
    noteId: string
    input: NoteInputPayload
  }
  if (!householdId || !noteId || !input) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/notes/${noteId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Note not found')

  const existingKind =
    typeof existing.data()?.kind === 'string' ? existing.data()!.kind : 'todo'
  const parsed = await validateNoteInput(householdId, input, {
    allowPastSchedule: true,
    forceKind: existingKind as 'todo' | 'appointment' | 'reminder' | 'general',
  })

  await ref.update({
    forPersonId: parsed.forPersonId,
    forPersonIds: parsed.forPersonIds,
    babyId: legacyBabyId(parsed.forPersonId),
    text: parsed.text,
    details: parsed.details,
    scheduledAt: parsed.scheduledAt,
    reminderMinutesBefore: parsed.reminderMinutesBefore,
    recurrence: parsed.recurrence,
    inviteePersonIds: parsed.inviteePersonIds,
    lastActorUid: uid,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true }
})

export const archiveNote = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, noteId, occurrenceAt } = request.data as {
    householdId: string
    noteId: string
    occurrenceAt?: string
  }
  if (!householdId || !noteId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/notes/${noteId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Note not found')
  const data = existing.data()!
  const kind = typeof data.kind === 'string' ? data.kind : 'todo'
  const recurrence = data.recurrence

  if (
    occurrenceAt &&
    (kind === 'appointment' || kind === 'reminder') &&
    recurrence
  ) {
    const at = new Date(occurrenceAt)
    if (Number.isNaN(at.getTime())) {
      throw new HttpsError('invalid-argument', 'Invalid occurrence time')
    }
    await ref.update({
      lastArchivedOccurrenceAt: Timestamp.fromDate(at),
      lastActorUid: uid,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { ok: true }
  }

  await ref.update({
    archived: true,
    completedAt: FieldValue.serverTimestamp(),
    lastActorUid: uid,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true }
})

export const unarchiveNote = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, noteId, clearOccurrence } = request.data as {
    householdId: string
    noteId: string
    clearOccurrence?: boolean
  }
  if (!householdId || !noteId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/notes/${noteId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Note not found')

  if (clearOccurrence) {
    await ref.update({
      lastArchivedOccurrenceAt: null,
      lastActorUid: uid,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { ok: true }
  }

  await ref.update({
    archived: false,
    completedAt: null,
    lastActorUid: uid,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true }
})

export const deleteNote = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, noteId } = request.data as {
    householdId: string
    noteId: string
  }
  if (!householdId || !noteId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/notes/${noteId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Note not found')

  await ref.delete()
  return { ok: true }
})
