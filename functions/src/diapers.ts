import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  db,
  requireUid,
  serializeTimestamp,
  assertHouseholdMember,
  assertBabyExists,
  FieldValue,
  Timestamp,
} from './helpers'
import { validateDiaperInput, type DiaperInputPayload } from './diaperValidation'
import { MAX_LIST_LIMIT, parseSinceDays, sinceTimestamp } from './listQuery'

const region = 'us-central1'
const callableOptions = { region, invoker: 'public' as const }

export const listDiapers = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const sinceDays = parseSinceDays((request.data as { sinceDays?: number }).sinceDays)
  const snap = await db
    .collection(`households/${householdId}/diapers`)
    .where('changedAt', '>=', sinceTimestamp(sinceDays))
    .orderBy('changedAt', 'desc')
    .limit(MAX_LIST_LIMIT)
    .get()

  const diapers = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      babyId: data.babyId,
      kind: data.kind,
      changedAt: serializeTimestamp(data.changedAt as Timestamp),
      note: data.note ?? null,
      createdAt: serializeTimestamp(data.createdAt as Timestamp)!,
      updatedAt: serializeTimestamp(data.updatedAt as Timestamp)!,
    }
  })

  return { diapers }
})

export const createDiaper = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, input } = request.data as {
    householdId: string
    input: DiaperInputPayload
  }
  if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const parsed = validateDiaperInput(input)
  await assertBabyExists(householdId, parsed.babyId)

  const ref = await db.collection(`households/${householdId}/diapers`).add({
    babyId: parsed.babyId,
    kind: parsed.kind,
    changedAt: Timestamp.fromDate(parsed.changedAt),
    note: parsed.note,
    lastActorUid: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { diaperId: ref.id }
})

export const updateDiaper = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, diaperId, input } = request.data as {
    householdId: string
    diaperId: string
    input: DiaperInputPayload
  }
  if (!householdId || !diaperId || !input) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  await assertHouseholdMember(uid, householdId)
  const parsed = validateDiaperInput(input)
  await assertBabyExists(householdId, parsed.babyId)

  const ref = db.doc(`households/${householdId}/diapers/${diaperId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Diaper change not found')

  await ref.update({
    babyId: parsed.babyId,
    kind: parsed.kind,
    changedAt: Timestamp.fromDate(parsed.changedAt),
    note: parsed.note,
    lastActorUid: uid,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true }
})

export const deleteDiaper = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, diaperId } = request.data as {
    householdId: string
    diaperId: string
  }
  if (!householdId || !diaperId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/diapers/${diaperId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Diaper change not found')

  await ref.delete()
  return { ok: true }
})
