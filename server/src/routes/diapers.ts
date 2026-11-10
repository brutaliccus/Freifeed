import type { FastifyInstance } from 'fastify'
import { getDb, nowIso, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { assertBabyExists, assertHouseholdMember } from '../household.js'
import { MAX_LIST_LIMIT, parseSinceDays, sinceIso } from '../listQuery.js'
import { registerCallable } from './helpers.js'

type DiaperKind = 'wet' | 'poop' | 'both'
const KINDS: DiaperKind[] = ['wet', 'poop', 'both']

function validateDiaperInput(input: {
  babyId?: string
  kind?: DiaperKind
  changedAt?: string | null
  note?: string | null
}) {
  const babyId = typeof input.babyId === 'string' ? input.babyId.trim() : ''
  if (!babyId) throw new HttpsError('invalid-argument', 'babyId required')
  const kind = input.kind
  if (!kind || !KINDS.includes(kind)) throw new HttpsError('invalid-argument', 'Invalid diaper type')
  const changedAt = input.changedAt ? new Date(input.changedAt) : new Date()
  if (Number.isNaN(changedAt.getTime())) throw new HttpsError('invalid-argument', 'Invalid date')
  const note =
    input.note == null || input.note === ''
      ? null
      : String(input.note).trim().slice(0, 500) || null
  return { babyId, kind, changedAt: changedAt.toISOString(), note }
}

function serialize(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    babyId: row.baby_id,
    kind: row.kind,
    changedAt: row.changed_at as string,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function registerDiaperRoutes(app: FastifyInstance) {
  registerCallable(app, 'listDiapers', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const sinceDays = parseSinceDays(body.sinceDays)
    const rows = getDb()
      .prepare(
        `SELECT * FROM diapers WHERE household_id=? AND changed_at >= ?
         ORDER BY changed_at DESC LIMIT ?`,
      )
      .all(householdId, sinceIso(sinceDays), MAX_LIST_LIMIT) as Record<string, unknown>[]
    return { diapers: rows.map(serialize) }
  })

  registerCallable(
    app,
    'createDiaper',
    (uid, body) => {
      const householdId = body.householdId as string
      const input = body.input as Parameters<typeof validateDiaperInput>[0]
      if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const parsed = validateDiaperInput(input)
      assertBabyExists(householdId, parsed.babyId)
      const id = newId()
      const now = nowIso()
      getDb()
        .prepare(
          `INSERT INTO diapers (id, household_id, baby_id, kind, changed_at, note, last_actor_uid, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, householdId, parsed.babyId, parsed.kind, parsed.changedAt, parsed.note, uid, now, now)
      return { diaperId: id }
    },
    { collections: () => ['diapers'] },
  )

  registerCallable(
    app,
    'updateDiaper',
    (uid, body) => {
      const householdId = body.householdId as string
      const diaperId = body.diaperId as string
      const input = body.input as Parameters<typeof validateDiaperInput>[0]
      if (!householdId || !diaperId || !input) {
        throw new HttpsError('invalid-argument', 'Missing fields')
      }
      assertHouseholdMember(uid, householdId)
      const parsed = validateDiaperInput(input)
      assertBabyExists(householdId, parsed.babyId)
      const db = getDb()
      const existing = db
        .prepare('SELECT id FROM diapers WHERE household_id=? AND id=?')
        .get(householdId, diaperId)
      if (!existing) throw new HttpsError('not-found', 'Diaper not found')
      db.prepare(
        `UPDATE diapers SET baby_id=?, kind=?, changed_at=?, note=?, last_actor_uid=?, updated_at=?
         WHERE household_id=? AND id=?`,
      ).run(
        parsed.babyId,
        parsed.kind,
        parsed.changedAt,
        parsed.note,
        uid,
        nowIso(),
        householdId,
        diaperId,
      )
      return { ok: true }
    },
    { collections: () => ['diapers'] },
  )

  registerCallable(
    app,
    'deleteDiaper',
    (uid, body) => {
      const householdId = body.householdId as string
      const diaperId = body.diaperId as string
      if (!householdId || !diaperId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      getDb()
        .prepare('DELETE FROM diapers WHERE household_id=? AND id=?')
        .run(householdId, diaperId)
      return { ok: true }
    },
    { collections: () => ['diapers'] },
  )
}
