import type { FastifyInstance } from 'fastify'
import { getDb, nowIso, parseJson, toJson, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { assertBabyExists, assertHouseholdMember } from '../household.js'
import { MAX_LIST_LIMIT, parseSinceDays, sinceIso } from '../listQuery.js'
import {
  applyMilkDeductions,
  deductMilkForBottle,
  restoreMilkDeductions,
} from '../milk/deductions.js'
import { resolveMilkLotsForPump } from '../milk/pump.js'
import {
  type FeedingInputPayload,
  feedingDocFromInput,
  parseBabyId,
  parseMilkDeductions,
  roundOz,
} from '../milk/validation.js'
import { registerCallable } from './helpers.js'

function serializeFeeding(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    type: (row.type as string) ?? 'nursing',
    babyId: row.baby_id,
    side: row.side ?? null,
    startAt: (row.start_at as string | null) ?? null,
    endAt: (row.end_at as string | null) ?? null,
    volumeOz: (row.volume_oz as number | null) ?? null,
    milkStorage: (row.milk_storage as string | null) ?? null,
    storedAt: (row.stored_at as string | null) ?? null,
    milkLotId: (row.milk_lot_id as string | null) ?? null,
    milkDeductions: parseJson(row.milk_deductions as string, []),
    weightLb: (row.weight_lb as number | null) ?? null,
    weightOz: (row.weight_oz as number | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function registerFeedingRoutes(app: FastifyInstance) {
  registerCallable(app, 'listFeedings', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const sinceDays = parseSinceDays(body.sinceDays)
    const rows = getDb()
      .prepare(
        `SELECT * FROM feedings WHERE household_id = ? AND created_at >= ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(householdId, sinceIso(sinceDays), MAX_LIST_LIMIT) as Record<string, unknown>[]
    return { feedings: rows.map(serializeFeeding) }
  })

  registerCallable(
    app,
    'createFeeding',
    (uid, body) => {
      const householdId = body.householdId as string
      const input = body.input as FeedingInputPayload
      const clientId = body.clientId as string | null | undefined
      const clientLotIds = Array.isArray(body.clientLotIds)
        ? (body.clientLotIds as unknown[]).map((id) => String(id))
        : []
      if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      assertBabyExists(householdId, parseBabyId(input.babyId))
      const doc = feedingDocFromInput(input)
      const db = getDb()
      const now = nowIso()

      let feedingId: string
      if (
        typeof clientId === 'string' &&
        clientId.trim().length >= 8 &&
        clientId.trim().length <= 128
      ) {
        feedingId = clientId.trim()
        const existing = db
          .prepare('SELECT id FROM feedings WHERE household_id = ? AND id = ?')
          .get(householdId, feedingId)
        if (existing) {
          const row = db
            .prepare('SELECT milk_lot_id AS milkLotId FROM feedings WHERE household_id = ? AND id = ?')
            .get(householdId, feedingId) as { milkLotId: string | null } | undefined
          return { feedingId, milkLotId: row?.milkLotId ?? null }
        }
      } else {
        feedingId = newId()
      }

      let createdMilkLotId: string | null = null
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO feedings (id, household_id, type, baby_id, side, start_at, end_at, volume_oz,
            milk_storage, stored_at, milk_lot_id, milk_deductions, weight_lb, weight_oz, note,
            last_actor_uid, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?, ?, ?, ?, ?)`,
        ).run(
          feedingId,
          householdId,
          doc.type,
          doc.babyId,
          doc.side,
          doc.startAt,
          doc.endAt,
          doc.volumeOz,
          doc.milkStorage,
          doc.storedAt,
          doc.weightLb,
          doc.weightOz,
          doc.note,
          uid,
          now,
          now,
        )

        let milkDeductions = parseMilkDeductions([])
        if (doc.type === 'bottle' && doc.volumeOz != null) {
          const explicit = parseMilkDeductions(input.milkDeductions)
          if (explicit.length > 0) {
            const total = roundOz(explicit.reduce((sum, d) => sum + d.amountOz, 0))
            if (Math.abs(total - doc.volumeOz) > 0.01) {
              throw new HttpsError(
                'invalid-argument',
                'Milk taken from bags must match ounces given',
              )
            }
            applyMilkDeductions(householdId, explicit, db)
            milkDeductions = explicit
          } else {
            milkDeductions = deductMilkForBottle(householdId, doc.volumeOz, db)
          }
        }

        createdMilkLotId = resolveMilkLotsForPump(
          householdId,
          feedingId,
          doc,
          null,
          input,
          db,
          clientLotIds,
        )

        if (milkDeductions.length > 0 || createdMilkLotId) {
          db.prepare(
            `UPDATE feedings SET milk_deductions=?, milk_lot_id=?, updated_at=?
             WHERE household_id=? AND id=?`,
          ).run(toJson(milkDeductions), createdMilkLotId, now, householdId, feedingId)
        }
      })
      tx()
      return { feedingId, milkLotId: createdMilkLotId }
    },
    { collections: () => ['feedings', 'milkLots'] },
  )

  registerCallable(
    app,
    'updateFeeding',
    (uid, body) => {
      const householdId = body.householdId as string
      const feedingId = body.feedingId as string
      const input = body.input as FeedingInputPayload
      if (!householdId || !feedingId || !input) {
        throw new HttpsError('invalid-argument', 'Missing fields')
      }
      assertHouseholdMember(uid, householdId)
      assertBabyExists(householdId, parseBabyId(input.babyId))
      const db = getDb()
      const existing = db
        .prepare('SELECT * FROM feedings WHERE household_id = ? AND id = ?')
        .get(householdId, feedingId) as Record<string, unknown> | undefined
      if (!existing) throw new HttpsError('not-found', 'Feeding not found')

      const doc = feedingDocFromInput(input)
      const now = nowIso()

      const tx = db.transaction(() => {
        restoreMilkDeductions(
          householdId,
          parseMilkDeductions(parseJson(existing.milk_deductions as string, [])),
          db,
        )
        const milkLotId = resolveMilkLotsForPump(
          householdId,
          feedingId,
          doc,
          (existing.milk_lot_id as string | null) ?? null,
          input,
          db,
        )

        let milkDeductions = parseMilkDeductions([])
        if (doc.type === 'bottle' && doc.volumeOz != null) {
          const explicit = parseMilkDeductions(input.milkDeductions)
          if (explicit.length > 0) {
            const total = roundOz(explicit.reduce((sum, d) => sum + d.amountOz, 0))
            if (Math.abs(total - doc.volumeOz) > 0.01) {
              throw new HttpsError(
                'invalid-argument',
                'Milk taken from bags must match ounces given',
              )
            }
            applyMilkDeductions(householdId, explicit, db)
            milkDeductions = explicit
          } else {
            milkDeductions = deductMilkForBottle(householdId, doc.volumeOz, db)
          }
        }

        db.prepare(
          `UPDATE feedings SET type=?, baby_id=?, side=?, start_at=?, end_at=?, volume_oz=?,
            milk_storage=?, stored_at=?, milk_lot_id=?, milk_deductions=?, weight_lb=?, weight_oz=?,
            note=?, last_actor_uid=?, updated_at=? WHERE household_id=? AND id=?`,
        ).run(
          doc.type,
          doc.babyId,
          doc.side,
          doc.startAt,
          doc.endAt,
          doc.volumeOz,
          doc.milkStorage,
          doc.storedAt,
          milkLotId ?? null,
          toJson(milkDeductions),
          doc.weightLb,
          doc.weightOz,
          doc.note,
          uid,
          now,
          householdId,
          feedingId,
        )
      })
      tx()
      return { ok: true }
    },
    { collections: () => ['feedings', 'milkLots'] },
  )

  registerCallable(
    app,
    'deleteFeeding',
    (uid, body) => {
      const householdId = body.householdId as string
      const feedingId = body.feedingId as string
      if (!householdId || !feedingId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const existing = db
        .prepare('SELECT * FROM feedings WHERE household_id = ? AND id = ?')
        .get(householdId, feedingId) as Record<string, unknown> | undefined
      const tx = db.transaction(() => {
        if (existing?.type === 'bottle') {
          restoreMilkDeductions(
            householdId,
            parseMilkDeductions(parseJson(existing.milk_deductions as string, [])),
            db,
          )
        }
        const milkLotId = existing?.milk_lot_id as string | null | undefined
        if (milkLotId) {
          db.prepare('DELETE FROM milk_lots WHERE household_id = ? AND id = ?').run(
            householdId,
            milkLotId,
          )
        }
        db.prepare('DELETE FROM feedings WHERE household_id = ? AND id = ?').run(
          householdId,
          feedingId,
        )
      })
      tx()
      return { ok: true }
    },
    { collections: () => ['feedings', 'milkLots'] },
  )
}
