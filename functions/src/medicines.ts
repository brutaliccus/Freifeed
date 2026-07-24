import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  db,
  requireUid,
  serializeTimestamp,
  parseOptionalDate,
  assertHouseholdMember,
  parseForPersonId,
  FieldValue,
  Timestamp,
} from './helpers'
import { MAX_LIST_LIMIT } from './listQuery'

const region = 'us-central1'
const callableOptions = { region, invoker: 'public' as const }

const FREQUENCY_TYPES = ['daily', 'twice_daily', 'three_times_daily', 'periodic'] as const
const MEDICINE_CATEGORIES = ['required', 'as_needed'] as const
type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number]
type FrequencyType = (typeof FREQUENCY_TYPES)[number]

interface FrequencyPayload {
  type?: string
  times?: unknown
  intervalHours?: unknown
}

interface MedicineInputPayload {
  name?: unknown
  forPersonId?: unknown
  totalPills?: unknown
  dosage?: unknown
  category?: unknown
  durationDays?: unknown
  frequency?: FrequencyPayload | unknown
  startedAt?: unknown
  lastTakenAt?: unknown
  active?: unknown
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function parseTime(raw: unknown): string {
  if (typeof raw !== 'string' || !TIME_RE.test(raw)) {
    throw new HttpsError('invalid-argument', 'Invalid reminder time (use HH:mm)')
  }
  return raw
}

function parseFrequency(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    throw new HttpsError('invalid-argument', 'Missing frequency')
  }
  const f = raw as FrequencyPayload
  const type = f.type as FrequencyType
  if (!FREQUENCY_TYPES.includes(type)) {
    throw new HttpsError('invalid-argument', 'Invalid frequency type')
  }

  let times: string[] = []
  let intervalHours: number | null = null

  if (type === 'periodic') {
    const n = Number(f.intervalHours)
    if (!Number.isFinite(n) || n <= 0 || n > 72) {
      throw new HttpsError('invalid-argument', 'Interval hours must be between 1 and 72')
    }
    intervalHours = Math.round(n * 100) / 100
  } else {
    const arr = Array.isArray(f.times) ? f.times : []
    const expectedCount = type === 'daily' ? 1 : type === 'twice_daily' ? 2 : 3
    if (arr.length !== expectedCount) {
      throw new HttpsError('invalid-argument', `Expected ${expectedCount} reminder times`)
    }
    times = arr.map(parseTime)
  }

  return { type, times, intervalHours }
}

function parseMedicineInput(input: MedicineInputPayload, forPersonId: string) {
  if (!input || typeof input !== 'object') {
    throw new HttpsError('invalid-argument', 'Missing medicine input')
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) throw new HttpsError('invalid-argument', 'Medicine name is required')
  if (name.length > 80) throw new HttpsError('invalid-argument', 'Medicine name is too long')

  const totalPills = Number(input.totalPills)
  if (!Number.isFinite(totalPills) || totalPills < 0 || totalPills > 10_000) {
    throw new HttpsError('invalid-argument', 'Invalid pill count')
  }

  const dosage = typeof input.dosage === 'string' ? input.dosage.trim() : ''
  if (dosage.length > 60) throw new HttpsError('invalid-argument', 'Dosage is too long')

  let durationDays: number | null = null
  if (input.durationDays !== null && input.durationDays !== undefined && input.durationDays !== '') {
    const d = Number(input.durationDays)
    if (!Number.isFinite(d) || d <= 0 || d > 365 * 5) {
      throw new HttpsError('invalid-argument', 'Invalid duration in days')
    }
    durationDays = Math.round(d)
  }

  const frequency = parseFrequency(input.frequency)

  const startedAt =
    parseOptionalDate(typeof input.startedAt === 'string' ? input.startedAt : null) ??
    Timestamp.now()

  const lastTakenAt =
    input.lastTakenAt === null || input.lastTakenAt === undefined
      ? null
      : parseOptionalDate(typeof input.lastTakenAt === 'string' ? input.lastTakenAt : null)

  const active = input.active === undefined ? true : Boolean(input.active)

  let category: MedicineCategory = 'required'
  if (input.category !== undefined && input.category !== null && input.category !== '') {
    const raw = String(input.category)
    if (!MEDICINE_CATEGORIES.includes(raw as MedicineCategory)) {
      throw new HttpsError('invalid-argument', 'Invalid medicine category')
    }
    category = raw as MedicineCategory
  }

  return {
    forPersonId,
    name,
    totalPills: Math.round(totalPills),
    dosage,
    category,
    durationDays,
    frequency,
    startedAt,
    lastTakenAt,
    active,
  }
}

function serializeMedicine(id: string, data: FirebaseFirestore.DocumentData) {
  const forPersonId =
    typeof data.forPersonId === 'string' && data.forPersonId.includes(':')
      ? data.forPersonId
      : 'baby:unknown'
  return {
    id,
    forPersonId,
    name: data.name ?? '',
    totalPills: data.totalPills ?? 0,
    dosage: data.dosage ?? '',
    category: data.category === 'as_needed' ? 'as_needed' : 'required',
    durationDays: data.durationDays ?? null,
    frequency: data.frequency ?? { type: 'daily', times: ['08:00'], intervalHours: null },
    startedAt: serializeTimestamp(data.startedAt),
    lastTakenAt: serializeTimestamp(data.lastTakenAt),
    active: data.active !== false,
    createdAt: serializeTimestamp(data.createdAt as Timestamp),
    updatedAt: serializeTimestamp(data.updatedAt as Timestamp),
  }
}

export const listMedicines = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const snap = await db
    .collection(`households/${householdId}/medicines`)
    .orderBy('createdAt', 'desc')
    .limit(MAX_LIST_LIMIT)
    .get()

  const medicines = snap.docs.map((d) => serializeMedicine(d.id, d.data()))
  return { medicines }
})

export const createMedicine = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, input } = request.data as {
    householdId: string
    input: MedicineInputPayload
  }
  if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)

  const forPersonId = await parseForPersonId(householdId, input.forPersonId)
  const data = parseMedicineInput(input, forPersonId)
  const ref = await db.collection(`households/${householdId}/medicines`).add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { medicineId: ref.id }
})

export const updateMedicine = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, medicineId, input } = request.data as {
    householdId: string
    medicineId: string
    input: MedicineInputPayload
  }
  if (!householdId || !medicineId || !input) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/medicines/${medicineId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Medicine not found')

  const forPersonId = await parseForPersonId(householdId, input.forPersonId)
  const data = parseMedicineInput(input, forPersonId)

  const updatePayload: Record<string, unknown> = {
    forPersonId: data.forPersonId,
    name: data.name,
    totalPills: data.totalPills,
    dosage: data.dosage,
    category: data.category,
    durationDays: data.durationDays,
    frequency: data.frequency,
    startedAt: data.startedAt,
    active: data.active,
    updatedAt: FieldValue.serverTimestamp(),
  }
  // Preserve the existing lastTakenAt unless the caller explicitly sent a value.
  if (Object.prototype.hasOwnProperty.call(input, 'lastTakenAt')) {
    updatePayload.lastTakenAt = data.lastTakenAt
  }

  await ref.update(updatePayload)

  return { ok: true }
})

export const deleteMedicine = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, medicineId } = request.data as {
    householdId: string
    medicineId: string
  }
  if (!householdId || !medicineId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  await db.doc(`households/${householdId}/medicines/${medicineId}`).delete()
  return { ok: true }
})

export const markMedicineTaken = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, medicineId, takenAt } = request.data as {
    householdId: string
    medicineId: string
    takenAt?: string | null
  }
  if (!householdId || !medicineId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/medicines/${medicineId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Medicine not found')

  const ts =
    (typeof takenAt === 'string' ? parseOptionalDate(takenAt) : null) ?? Timestamp.now()

  await ref.update({
    lastTakenAt: ts,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { ok: true }
})

export const setMedicineActive = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, medicineId, active, restartDuration } = request.data as {
    householdId: string
    medicineId: string
    active: boolean
    restartDuration?: boolean
  }
  if (!householdId || !medicineId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}/medicines/${medicineId}`)
  const existing = await ref.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Medicine not found')

  const patch: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
    active: Boolean(active),
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (active && restartDuration) {
    patch.startedAt = Timestamp.now()
  }
  await ref.update(patch)

  return { ok: true }
})
