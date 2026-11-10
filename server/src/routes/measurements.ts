import type { FastifyInstance } from 'fastify'
import { getDb, nowIso, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { assertBabyExists, assertHouseholdMember } from '../household.js'
import { MAX_LIST_LIMIT, parseSinceDays, sinceIso } from '../listQuery.js'
import { parseBabyId } from '../milk/validation.js'
import { registerCallable } from './helpers.js'

function validateMeasurementInput(raw: {
  babyId: string
  measuredAt: string
  weightLb?: number | null
  weightOz?: number | null
  lengthIn?: number | null
  headCircIn?: number | null
  note?: string | null
}) {
  const babyId = parseBabyId(raw.babyId)
  const measuredAt = new Date(raw.measuredAt)
  if (Number.isNaN(measuredAt.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid measurement date')
  }
  const weightLb = raw.weightLb != null ? Number(raw.weightLb) : null
  const weightOz = raw.weightOz != null ? Number(raw.weightOz) : null
  const lengthIn = raw.lengthIn != null ? Number(raw.lengthIn) : null
  const headCircIn = raw.headCircIn != null ? Number(raw.headCircIn) : null
  if (weightLb == null && weightOz == null && lengthIn == null && headCircIn == null) {
    throw new HttpsError('invalid-argument', 'Enter at least one measurement')
  }
  if (weightLb != null && (weightLb < 0 || weightLb > 200)) {
    throw new HttpsError('invalid-argument', 'Invalid weight')
  }
  if (weightOz != null && (weightOz < 0 || weightOz >= 16)) {
    throw new HttpsError('invalid-argument', 'Invalid weight ounces')
  }
  if (lengthIn != null && (lengthIn <= 0 || lengthIn > 60)) {
    throw new HttpsError('invalid-argument', 'Invalid length/height')
  }
  if (headCircIn != null && (headCircIn <= 0 || headCircIn > 30)) {
    throw new HttpsError('invalid-argument', 'Invalid head circumference')
  }
  const note =
    typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : null
  return {
    babyId,
    measuredAt: measuredAt.toISOString(),
    weightLb,
    weightOz,
    lengthIn,
    headCircIn,
    note,
  }
}

function serialize(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    babyId: row.baby_id,
    measuredAt: row.measured_at as string,
    weightLb: (row.weight_lb as number | null) ?? null,
    weightOz: (row.weight_oz as number | null) ?? null,
    lengthIn: (row.length_in as number | null) ?? null,
    headCircIn: (row.head_circ_in as number | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function registerMeasurementRoutes(app: FastifyInstance) {
  registerCallable(app, 'listMeasurements', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const sinceDays = parseSinceDays(body.sinceDays)
    const rows = getDb()
      .prepare(
        `SELECT * FROM measurements WHERE household_id=? AND measured_at >= ?
         ORDER BY measured_at DESC LIMIT ?`,
      )
      .all(householdId, sinceIso(sinceDays), MAX_LIST_LIMIT) as Record<string, unknown>[]
    return { measurements: rows.map(serialize) }
  })

  registerCallable(
    app,
    'createMeasurement',
    (uid, body) => {
      const householdId = body.householdId as string
      const input = body.input as Parameters<typeof validateMeasurementInput>[0]
      if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const parsed = validateMeasurementInput(input)
      assertBabyExists(householdId, parsed.babyId)
      const id = newId()
      const now = nowIso()
      getDb()
        .prepare(
          `INSERT INTO measurements (id, household_id, baby_id, measured_at, weight_lb, weight_oz,
            length_in, head_circ_in, note, last_actor_uid, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          householdId,
          parsed.babyId,
          parsed.measuredAt,
          parsed.weightLb,
          parsed.weightOz,
          parsed.lengthIn,
          parsed.headCircIn,
          parsed.note,
          uid,
          now,
          now,
        )
      return { measurementId: id }
    },
    { collections: () => ['measurements'] },
  )

  registerCallable(
    app,
    'updateMeasurement',
    (uid, body) => {
      const householdId = body.householdId as string
      const measurementId = body.measurementId as string
      const input = body.input as Parameters<typeof validateMeasurementInput>[0]
      if (!householdId || !measurementId || !input) {
        throw new HttpsError('invalid-argument', 'Missing fields')
      }
      assertHouseholdMember(uid, householdId)
      const parsed = validateMeasurementInput(input)
      assertBabyExists(householdId, parsed.babyId)
      const db = getDb()
      const existing = db
        .prepare('SELECT id FROM measurements WHERE household_id=? AND id=?')
        .get(householdId, measurementId)
      if (!existing) throw new HttpsError('not-found', 'Measurement not found')
      db.prepare(
        `UPDATE measurements SET baby_id=?, measured_at=?, weight_lb=?, weight_oz=?, length_in=?,
          head_circ_in=?, note=?, last_actor_uid=?, updated_at=? WHERE household_id=? AND id=?`,
      ).run(
        parsed.babyId,
        parsed.measuredAt,
        parsed.weightLb,
        parsed.weightOz,
        parsed.lengthIn,
        parsed.headCircIn,
        parsed.note,
        uid,
        nowIso(),
        householdId,
        measurementId,
      )
      return { ok: true }
    },
    { collections: () => ['measurements'] },
  )

  registerCallable(
    app,
    'deleteMeasurement',
    (uid, body) => {
      const householdId = body.householdId as string
      const measurementId = body.measurementId as string
      if (!householdId || !measurementId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      getDb()
        .prepare('DELETE FROM measurements WHERE household_id=? AND id=?')
        .run(householdId, measurementId)
      return { ok: true }
    },
    { collections: () => ['measurements'] },
  )
}
