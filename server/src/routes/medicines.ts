import type { FastifyInstance } from 'fastify'
import { getDb, nowIso, parseJson, toJson, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { assertHouseholdMember, parseForPersonId } from '../household.js'
import { MAX_LIST_LIMIT } from '../listQuery.js'
import { parseOptionalDate } from '../milk/validation.js'
import { registerCallable } from './helpers.js'

const FREQUENCY_TYPES = ['daily', 'twice_daily', 'three_times_daily', 'periodic'] as const
const MEDICINE_CATEGORIES = ['required', 'as_needed'] as const
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function parseTime(raw: unknown): string {
  if (typeof raw !== 'string' || !TIME_RE.test(raw)) {
    throw new HttpsError('invalid-argument', 'Invalid reminder time (use HH:mm)')
  }
  return raw
}

function parseFrequency(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw new HttpsError('invalid-argument', 'Missing frequency')
  const f = raw as { type?: string; times?: unknown; intervalHours?: unknown }
  const type = f.type as (typeof FREQUENCY_TYPES)[number]
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

function parseMedicineInput(input: Record<string, unknown>, forPersonId: string) {
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
    parseOptionalDate(typeof input.startedAt === 'string' ? input.startedAt : null) ?? nowIso()
  const lastTakenAt =
    input.lastTakenAt === null || input.lastTakenAt === undefined
      ? null
      : parseOptionalDate(typeof input.lastTakenAt === 'string' ? input.lastTakenAt : null)
  const active = input.active === undefined ? true : Boolean(input.active)

  let category: (typeof MEDICINE_CATEGORIES)[number] = 'required'
  if (input.category !== undefined && input.category !== null && input.category !== '') {
    const raw = String(input.category)
    if (!MEDICINE_CATEGORIES.includes(raw as (typeof MEDICINE_CATEGORIES)[number])) {
      throw new HttpsError('invalid-argument', 'Invalid medicine category')
    }
    category = raw as (typeof MEDICINE_CATEGORIES)[number]
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

function serializeMedicine(row: Record<string, unknown>) {
  const forPersonId =
    typeof row.for_person_id === 'string' && row.for_person_id.includes(':')
      ? row.for_person_id
      : 'baby:unknown'
  return {
    id: String(row.id),
    forPersonId,
    name: (row.name as string) ?? '',
    totalPills: (row.total_pills as number) ?? 0,
    dosage: (row.dosage as string) ?? '',
    category: row.category === 'as_needed' ? 'as_needed' : 'required',
    durationDays: (row.duration_days as number | null) ?? null,
    frequency: parseJson(row.frequency as string, {
      type: 'daily',
      times: ['08:00'],
      intervalHours: null,
    }),
    startedAt: (row.started_at as string | null) ?? null,
    lastTakenAt: (row.last_taken_at as string | null) ?? null,
    active: row.active !== 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function registerMedicineRoutes(app: FastifyInstance) {
  registerCallable(app, 'listMedicines', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const rows = getDb()
      .prepare(
        `SELECT * FROM medicines WHERE household_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(householdId, MAX_LIST_LIMIT) as Record<string, unknown>[]
    return { medicines: rows.map(serializeMedicine) }
  })

  registerCallable(
    app,
    'createMedicine',
    (uid, body) => {
      const householdId = body.householdId as string
      const input = body.input as Record<string, unknown>
      if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const forPersonId = parseForPersonId(householdId, input.forPersonId)
      const data = parseMedicineInput(input, forPersonId)
      const id = newId()
      const now = nowIso()
      getDb()
        .prepare(
          `INSERT INTO medicines (id, household_id, for_person_id, name, total_pills, dosage, category,
            duration_days, frequency, started_at, last_taken_at, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          householdId,
          data.forPersonId,
          data.name,
          data.totalPills,
          data.dosage,
          data.category,
          data.durationDays,
          toJson(data.frequency),
          data.startedAt,
          data.lastTakenAt,
          data.active ? 1 : 0,
          now,
          now,
        )
      return { medicineId: id }
    },
    { collections: () => ['medicines'] },
  )

  registerCallable(
    app,
    'updateMedicine',
    (uid, body) => {
      const householdId = body.householdId as string
      const medicineId = body.medicineId as string
      const input = body.input as Record<string, unknown>
      if (!householdId || !medicineId || !input) {
        throw new HttpsError('invalid-argument', 'Missing fields')
      }
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const existing = db
        .prepare('SELECT id FROM medicines WHERE household_id=? AND id=?')
        .get(householdId, medicineId)
      if (!existing) throw new HttpsError('not-found', 'Medicine not found')
      const forPersonId = parseForPersonId(householdId, input.forPersonId)
      const data = parseMedicineInput(input, forPersonId)
      const now = nowIso()
      if (Object.prototype.hasOwnProperty.call(input, 'lastTakenAt')) {
        db.prepare(
          `UPDATE medicines SET for_person_id=?, name=?, total_pills=?, dosage=?, category=?,
            duration_days=?, frequency=?, started_at=?, last_taken_at=?, active=?, updated_at=?
           WHERE household_id=? AND id=?`,
        ).run(
          data.forPersonId,
          data.name,
          data.totalPills,
          data.dosage,
          data.category,
          data.durationDays,
          toJson(data.frequency),
          data.startedAt,
          data.lastTakenAt,
          data.active ? 1 : 0,
          now,
          householdId,
          medicineId,
        )
      } else {
        db.prepare(
          `UPDATE medicines SET for_person_id=?, name=?, total_pills=?, dosage=?, category=?,
            duration_days=?, frequency=?, started_at=?, active=?, updated_at=?
           WHERE household_id=? AND id=?`,
        ).run(
          data.forPersonId,
          data.name,
          data.totalPills,
          data.dosage,
          data.category,
          data.durationDays,
          toJson(data.frequency),
          data.startedAt,
          data.active ? 1 : 0,
          now,
          householdId,
          medicineId,
        )
      }
      return { ok: true }
    },
    { collections: () => ['medicines'] },
  )

  registerCallable(
    app,
    'deleteMedicine',
    (uid, body) => {
      const householdId = body.householdId as string
      const medicineId = body.medicineId as string
      if (!householdId || !medicineId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      getDb()
        .prepare('DELETE FROM medicines WHERE household_id=? AND id=?')
        .run(householdId, medicineId)
      return { ok: true }
    },
    { collections: () => ['medicines'] },
  )

  registerCallable(
    app,
    'markMedicineTaken',
    (uid, body) => {
      const householdId = body.householdId as string
      const medicineId = body.medicineId as string
      if (!householdId || !medicineId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const existing = db
        .prepare('SELECT id FROM medicines WHERE household_id=? AND id=?')
        .get(householdId, medicineId)
      if (!existing) throw new HttpsError('not-found', 'Medicine not found')
      const ts =
        (typeof body.takenAt === 'string' ? parseOptionalDate(body.takenAt) : null) ?? nowIso()
      db.prepare(
        'UPDATE medicines SET last_taken_at=?, updated_at=? WHERE household_id=? AND id=?',
      ).run(ts, nowIso(), householdId, medicineId)
      return { ok: true }
    },
    { collections: () => ['medicines'] },
  )

  registerCallable(
    app,
    'setMedicineActive',
    (uid, body) => {
      const householdId = body.householdId as string
      const medicineId = body.medicineId as string
      if (!householdId || !medicineId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const existing = db
        .prepare('SELECT id FROM medicines WHERE household_id=? AND id=?')
        .get(householdId, medicineId)
      if (!existing) throw new HttpsError('not-found', 'Medicine not found')
      const now = nowIso()
      if (body.active && body.restartDuration) {
        db.prepare(
          'UPDATE medicines SET active=?, started_at=?, updated_at=? WHERE household_id=? AND id=?',
        ).run(body.active ? 1 : 0, now, now, householdId, medicineId)
      } else {
        db.prepare(
          'UPDATE medicines SET active=?, updated_at=? WHERE household_id=? AND id=?',
        ).run(body.active ? 1 : 0, now, householdId, medicineId)
      }
      return { ok: true }
    },
    { collections: () => ['medicines'] },
  )
}
