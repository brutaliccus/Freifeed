import type { FastifyInstance } from 'fastify'
import { getDb, nowIso, parseJson } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { assertHouseholdMember } from '../household.js'
import { MAX_LIST_LIMIT } from '../listQuery.js'
import {
  combineMilkLots,
  redistributeMilkLot,
  transferMilkLotToFreezer,
  transferMilkLotToFridge,
} from '../milk/transfer.js'
import { parseOptionalDate, roundOz } from '../milk/validation.js'
import { registerCallable } from './helpers.js'

function serializeLot(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    pumpedAt: row.pumped_at as string,
    storedAt: row.stored_at as string,
    volumeOz: (row.volume_oz as number) ?? 0,
    remainingOz: (row.remaining_oz as number) ?? 0,
    storage: row.storage,
    feedingId: (row.feeding_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function registerMilkRoutes(app: FastifyInstance) {
  registerCallable(app, 'listMilkLots', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const rows = getDb()
      .prepare(
        `SELECT * FROM milk_lots WHERE household_id = ? AND remaining_oz > 0
         ORDER BY remaining_oz DESC LIMIT ?`,
      )
      .all(householdId, MAX_LIST_LIMIT) as Record<string, unknown>[]
    const lots = rows
      .map(serializeLot)
      .sort((a, b) => new Date(b.storedAt).getTime() - new Date(a.storedAt).getTime())
    return { lots }
  })

  registerCallable(app, 'getMilkSummary', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const rows = getDb()
      .prepare(
        `SELECT remaining_oz, storage FROM milk_lots WHERE household_id = ? AND remaining_oz > 0`,
      )
      .all(householdId) as { remaining_oz: number; storage: string }[]
    let totalRemainingOz = 0
    let fridgeOz = 0
    let frozenOz = 0
    for (const r of rows) {
      const remaining = r.remaining_oz ?? 0
      if (remaining <= 0) continue
      totalRemainingOz += remaining
      if (r.storage === 'frozen') frozenOz += remaining
      else fridgeOz += remaining
    }
    return { summary: { totalRemainingOz, fridgeOz, frozenOz } }
  })

  registerCallable(
    app,
    'deleteMilkLot',
    (uid, body) => {
      const householdId = body.householdId as string
      const lotId = body.lotId as string
      if (!householdId || !lotId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const lot = db
        .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
        .get(householdId, lotId) as { feeding_id: string | null } | undefined
      if (!lot) throw new HttpsError('not-found', 'Lot not found')
      const tx = db.transaction(() => {
        if (lot.feeding_id) {
          db.prepare('DELETE FROM feedings WHERE household_id = ? AND id = ?').run(
            householdId,
            lot.feeding_id,
          )
        }
        db.prepare('DELETE FROM milk_lots WHERE household_id = ? AND id = ?').run(
          householdId,
          lotId,
        )
      })
      tx()
      return { ok: true }
    },
    { collections: () => ['milkLots', 'feedings'] },
  )

  registerCallable(
    app,
    'updateMilkLot',
    (uid, body) => {
      const householdId = body.householdId as string
      const lotId = body.lotId as string
      if (!householdId || !lotId) throw new HttpsError('invalid-argument', 'Missing fields')
      const total = roundOz(Number(body.volumeOz))
      const remaining = roundOz(Number(body.remainingOz))
      if (!Number.isFinite(total) || total <= 0) {
        throw new HttpsError('invalid-argument', 'Bag total must be greater than 0 oz')
      }
      if (!Number.isFinite(remaining) || remaining < 0) {
        throw new HttpsError('invalid-argument', 'Remaining amount must be 0 or more')
      }
      if (remaining > total + 0.001) {
        throw new HttpsError('invalid-argument', 'Remaining cannot exceed bag total')
      }
      assertHouseholdMember(uid, householdId)
      const db = getDb()
      const lot = db
        .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
        .get(householdId, lotId) as { feeding_id: string | null } | undefined
      if (!lot) throw new HttpsError('not-found', 'Milk bag not found')

      const now = nowIso()
      let storedAt: string | null = null
      if (body.storedAt !== undefined) {
        if (body.storedAt != null && typeof body.storedAt !== 'string') {
          throw new HttpsError('invalid-argument', 'storedAt must be an ISO date string')
        }
        storedAt = parseOptionalDate(typeof body.storedAt === 'string' ? body.storedAt : null)
        if (!storedAt) {
          throw new HttpsError('invalid-argument', 'Choose a valid stored date and time')
        }
      }

      const note =
        body.note !== undefined
          ? typeof body.note === 'string'
            ? body.note.trim() || null
            : null
          : undefined

      const tx = db.transaction(() => {
        if (note !== undefined && storedAt) {
          db.prepare(
            `UPDATE milk_lots SET volume_oz=?, remaining_oz=?, note=?, stored_at=?, updated_at=?
             WHERE household_id=? AND id=?`,
          ).run(total, remaining, note, storedAt, now, householdId, lotId)
        } else if (note !== undefined) {
          db.prepare(
            `UPDATE milk_lots SET volume_oz=?, remaining_oz=?, note=?, updated_at=?
             WHERE household_id=? AND id=?`,
          ).run(total, remaining, note, now, householdId, lotId)
        } else if (storedAt) {
          db.prepare(
            `UPDATE milk_lots SET volume_oz=?, remaining_oz=?, stored_at=?, updated_at=?
             WHERE household_id=? AND id=?`,
          ).run(total, remaining, storedAt, now, householdId, lotId)
        } else {
          db.prepare(
            `UPDATE milk_lots SET volume_oz=?, remaining_oz=?, updated_at=?
             WHERE household_id=? AND id=?`,
          ).run(total, remaining, now, householdId, lotId)
        }

        if (lot.feeding_id) {
          const feeding = db
            .prepare('SELECT 1 AS ok FROM feedings WHERE household_id=? AND id=?')
            .get(householdId, lot.feeding_id)
          if (feeding) {
            if (storedAt) {
              db.prepare(
                `UPDATE feedings SET volume_oz=?, stored_at=?, updated_at=? WHERE household_id=? AND id=?`,
              ).run(total, storedAt, now, householdId, lot.feeding_id)
            } else {
              db.prepare(
                `UPDATE feedings SET volume_oz=?, updated_at=? WHERE household_id=? AND id=?`,
              ).run(total, now, householdId, lot.feeding_id)
            }
          }
        }
      })
      tx()
      return { ok: true, volumeOz: total, remainingOz: remaining }
    },
    { collections: () => ['milkLots', 'feedings'] },
  )

  registerCallable(
    app,
    'transferMilkLotToFreezer',
    (uid, body) => {
      assertHouseholdMember(uid, body.householdId as string)
      return transferMilkLotToFreezer(body as Parameters<typeof transferMilkLotToFreezer>[0])
    },
    { collections: () => ['milkLots', 'feedings'] },
  )

  registerCallable(
    app,
    'transferMilkLotToFridge',
    (uid, body) => {
      assertHouseholdMember(uid, body.householdId as string)
      return transferMilkLotToFridge(body as Parameters<typeof transferMilkLotToFridge>[0])
    },
    { collections: () => ['milkLots', 'feedings'] },
  )

  registerCallable(
    app,
    'combineMilkLots',
    (uid, body) => {
      assertHouseholdMember(uid, body.householdId as string)
      return combineMilkLots(body as Parameters<typeof combineMilkLots>[0])
    },
    { collections: () => ['milkLots'] },
  )

  registerCallable(
    app,
    'redistributeMilkLot',
    (uid, body) => {
      assertHouseholdMember(uid, body.householdId as string)
      return redistributeMilkLot(body as Parameters<typeof redistributeMilkLot>[0])
    },
    { collections: () => ['milkLots'] },
  )

  app.get('/api/households/:id/milkLots', async (request, reply) => {
    try {
      const { requireAuth, sendError } = await import('../auth/middleware.js')
      const uid = requireAuth(request)
      const householdId = (request.params as { id: string }).id
      assertHouseholdMember(uid, householdId)
      const rows = getDb()
        .prepare(
          `SELECT * FROM milk_lots WHERE household_id = ? AND remaining_oz > 0 ORDER BY stored_at DESC`,
        )
        .all(householdId) as Record<string, unknown>[]
      return { lots: rows.map(serializeLot) }
    } catch (err) {
      const { sendError } = await import('../auth/middleware.js')
      return sendError(reply, err)
    }
  })
}

void parseJson
