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
import { validateMeasurementInput, type MeasurementInputPayload } from './measurementValidation'
import { MAX_LIST_LIMIT, parseSinceDays, sinceTimestamp } from './listQuery'

const region = 'us-central1'
const callableOptions = { region, invoker: 'public' as const }

export const listMeasurements = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const sinceDays = parseSinceDays((request.data as { sinceDays?: number }).sinceDays)
  const snap = await db
    .collection(`households/${householdId}/measurements`)
    .where('measuredAt', '>=', sinceTimestamp(sinceDays))
    .orderBy('measuredAt', 'desc')
    .limit(MAX_LIST_LIMIT)
    .get()

  const measurements = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      babyId: data.babyId,
      measuredAt: serializeTimestamp(data.measuredAt as Timestamp),
      weightLb: data.weightLb ?? null,
      weightOz: data.weightOz ?? null,
      lengthIn: data.lengthIn ?? null,
      headCircIn: data.headCircIn ?? null,
      note: data.note ?? null,
      createdAt: serializeTimestamp(data.createdAt as Timestamp)!,
      updatedAt: serializeTimestamp(data.updatedAt as Timestamp)!,
    }
  })

  return { measurements }
})

export const createMeasurement = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, input } = request.data as {
    householdId: string
    input: MeasurementInputPayload
  }
  if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const parsed = validateMeasurementInput(input)
  await assertBabyExists(householdId, parsed.babyId)

  const ref = await db.collection(`households/${householdId}/measurements`).add({
    babyId: parsed.babyId,
    measuredAt: Timestamp.fromDate(parsed.measuredAt),
    weightLb: parsed.weightLb,
    weightOz: parsed.weightOz,
    lengthIn: parsed.lengthIn,
    headCircIn: parsed.headCircIn,
    note: parsed.note,
    lastActorUid: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { measurementId: ref.id }
})

export const updateMeasurement = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, measurementId, input } = request.data as {
    householdId: string
    measurementId: string
    input: MeasurementInputPayload
  }
  if (!householdId || !measurementId || !input) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  await assertHouseholdMember(uid, householdId)
  const parsed = validateMeasurementInput(input)
  await assertBabyExists(householdId, parsed.babyId)

  const ref = db.doc(`households/${householdId}/measurements/${measurementId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Measurement not found')

  await ref.update({
    babyId: parsed.babyId,
    measuredAt: Timestamp.fromDate(parsed.measuredAt),
    weightLb: parsed.weightLb,
    weightOz: parsed.weightOz,
    lengthIn: parsed.lengthIn,
    headCircIn: parsed.headCircIn,
    note: parsed.note,
    lastActorUid: uid,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true }
})

export const deleteMeasurement = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, measurementId } = request.data as {
    householdId: string
    measurementId: string
  }
  if (!householdId || !measurementId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/measurements/${measurementId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Measurement not found')

  await ref.delete()
  return { ok: true }
})
