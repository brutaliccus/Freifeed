import { getDb, nowIso, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { type MilkStorage, parseBagVolumes, roundOz } from './validation.js'

type LotRow = {
  id: string
  remaining_oz: number
  storage: string
  pumped_at: string
  stored_at: string
  feeding_id: string | null
  note: string | null
}

function resolveLotIds(lotId?: string, lotIds?: string[]): string[] {
  if (Array.isArray(lotIds) && lotIds.length > 0) return lotIds.map(String)
  if (lotId) return [String(lotId)]
  return []
}

function transferLots(opts: {
  householdId: string
  ids: string[]
  bags: unknown
  fromStorage: MilkStorage
  toStorage: MilkStorage
  fromError: string
}) {
  const { householdId, ids, bags, fromStorage, toStorage, fromError } = opts
  if (!householdId || ids.length === 0 || !Array.isArray(bags) || bags.length === 0) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  const bagVolumes = parseBagVolumes(bags)
  const db = getDb()

  let totalRemainingOz = 0
  let earliestPumped: string | null = null
  let feedingId: string | null = null
  const notes: string[] = []

  for (const id of ids) {
    const lot = db
      .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
      .get(householdId, id) as LotRow | undefined
    if (!lot) throw new HttpsError('not-found', 'Milk bag not found')
    if (lot.storage !== fromStorage) {
      throw new HttpsError('invalid-argument', fromError)
    }
    const remaining = roundOz(lot.remaining_oz ?? 0)
    if (remaining <= 0) {
      throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
    }
    totalRemainingOz = roundOz(totalRemainingOz + remaining)
    if (!earliestPumped || new Date(lot.pumped_at).getTime() < new Date(earliestPumped).getTime()) {
      earliestPumped = lot.pumped_at
    }
    if (!feedingId && lot.feeding_id) feedingId = lot.feeding_id
    if (lot.note) notes.push(String(lot.note))
  }

  if (totalRemainingOz <= 0) {
    throw new HttpsError('invalid-argument', 'No milk to transfer')
  }

  const totalBags = roundOz(bagVolumes.reduce((sum, v) => sum + v, 0))
  if (Math.abs(totalBags - totalRemainingOz) > 0.01) {
    throw new HttpsError(
      'invalid-argument',
      `Bag volumes must total ${totalRemainingOz} oz (got ${totalBags} oz)`,
    )
  }

  const transferAt = nowIso()
  const note = notes.length > 0 ? notes[0] : null
  const newIds: string[] = []

  const tx = db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM milk_lots WHERE household_id = ? AND id = ?').run(householdId, id)
    }
    for (let i = 0; i < bagVolumes.length; i++) {
      const vol = bagVolumes[i]!
      const newLotId = newId()
      newIds.push(newLotId)
      db.prepare(
        `INSERT INTO milk_lots (id, household_id, pumped_at, stored_at, volume_oz, remaining_oz, storage,
          feeding_id, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newLotId,
        householdId,
        earliestPumped ?? transferAt,
        transferAt,
        vol,
        vol,
        toStorage,
        i === 0 ? feedingId : null,
        note,
        transferAt,
        transferAt,
      )
    }
    if (feedingId) {
      const feeding = db
        .prepare('SELECT 1 AS ok FROM feedings WHERE household_id = ? AND id = ?')
        .get(householdId, feedingId)
      if (feeding) {
        db.prepare(
          `UPDATE feedings SET milk_storage=?, stored_at=?, milk_lot_id=NULL, updated_at=?
           WHERE household_id=? AND id=?`,
        ).run(toStorage, transferAt, transferAt, householdId, feedingId)
      }
    }
  })
  tx()

  return {
    ok: true as const,
    bagCount: bagVolumes.length,
    lotCount: ids.length,
    newLotIds: newIds,
    transferAt,
  }
}

export function transferMilkLotToFreezer(data: {
  householdId: string
  lotId?: string
  lotIds?: string[]
  bags: unknown
}) {
  return transferLots({
    householdId: data.householdId,
    ids: resolveLotIds(data.lotId, data.lotIds),
    bags: data.bags,
    fromStorage: 'fridge',
    toStorage: 'frozen',
    fromError: 'Only refrigerated milk can be transferred',
  })
}

export function transferMilkLotToFridge(data: {
  householdId: string
  lotId?: string
  lotIds?: string[]
  bags: unknown
}) {
  return transferLots({
    householdId: data.householdId,
    ids: resolveLotIds(data.lotId, data.lotIds),
    bags: data.bags,
    fromStorage: 'frozen',
    toStorage: 'fridge',
    fromError: 'Only frozen milk can be transferred to the fridge',
  })
}

export function combineMilkLots(data: {
  householdId?: string
  lotIds?: string[]
  addOz?: number | string | null
}) {
  const householdId = data.householdId
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  const ids = Array.isArray(data.lotIds) ? data.lotIds.map(String).filter(Boolean) : []
  const extraOz =
    data.addOz == null || data.addOz === '' ? 0 : roundOz(Number(data.addOz))

  if (ids.length === 0 && extraOz <= 0) {
    throw new HttpsError('invalid-argument', 'Select at least one bag or enter milk to add')
  }
  if (ids.length === 0 && extraOz > 0) {
    throw new HttpsError('invalid-argument', 'Choose a bag to add fresh milk into')
  }
  if (!Number.isFinite(extraOz) || extraOz < 0) {
    throw new HttpsError('invalid-argument', 'Invalid amount to add')
  }

  const db = getDb()
  const rows: LotRow[] = []
  const missing: string[] = []
  for (const id of ids) {
    const lot = db
      .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
      .get(householdId, id) as LotRow | undefined
    if (!lot) {
      missing.push(id)
      continue
    }
    const remaining = roundOz(lot.remaining_oz ?? 0)
    if (remaining <= 0) throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
    if (lot.storage !== 'fridge' && lot.storage !== 'frozen') {
      throw new HttpsError('invalid-argument', 'Invalid storage on milk bag')
    }
    rows.push(lot)
  }
  if (missing.length > 0) {
    if (missing.length === ids.length) {
      throw new HttpsError(
        'not-found',
        'Milk bags no longer exist — they may have already been combined or deleted',
      )
    }
    throw new HttpsError(
      'not-found',
      `Milk bag not found (${missing.join(', ')}). Other selected bags are still in inventory.`,
    )
  }

  const storageSet = new Set(rows.map((r) => r.storage))
  if (storageSet.size > 1) {
    throw new HttpsError(
      'invalid-argument',
      'Combine bags from the same storage (all fridge or all frozen)',
    )
  }
  const storage = (rows[0]?.storage ?? 'fridge') as MilkStorage

  rows.sort((a, b) => new Date(a.stored_at).getTime() - new Date(b.stored_at).getTime())
  const survivor = rows[0]!
  const mergeOthers = rows.slice(1)

  const totalRemaining = roundOz(
    rows.reduce((sum, r) => sum + roundOz(r.remaining_oz), 0) + extraOz,
  )
  if (totalRemaining <= 0) throw new HttpsError('invalid-argument', 'No milk to combine')

  let earliestPumped = survivor.pumped_at
  let earliestStored = survivor.stored_at
  for (const r of rows) {
    if (new Date(r.pumped_at).getTime() < new Date(earliestPumped).getTime()) {
      earliestPumped = r.pumped_at
    }
    if (new Date(r.stored_at).getTime() < new Date(earliestStored).getTime()) {
      earliestStored = r.stored_at
    }
  }

  const note = rows.find((r) => r.note)?.note ?? null
  const now = nowIso()

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE milk_lots SET pumped_at=?, stored_at=?, volume_oz=?, remaining_oz=?, storage=?,
       feeding_id=?, note=?, updated_at=? WHERE household_id=? AND id=?`,
    ).run(
      earliestPumped,
      earliestStored,
      totalRemaining,
      totalRemaining,
      storage,
      survivor.feeding_id,
      note,
      now,
      householdId,
      survivor.id,
    )
    for (const other of mergeOthers) {
      db.prepare('DELETE FROM milk_lots WHERE household_id = ? AND id = ?').run(
        householdId,
        other.id,
      )
    }
  })
  tx()

  return { ok: true as const, lotId: survivor.id, totalOz: totalRemaining }
}

export function redistributeMilkLot(data: {
  householdId?: string
  lotId?: string
  lotIds?: unknown
  bags?: unknown
}) {
  const householdId = data.householdId
  const ids = Array.isArray(data.lotIds)
    ? data.lotIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : data.lotId
      ? [data.lotId]
      : []

  if (!householdId || ids.length === 0) {
    throw new HttpsError('invalid-argument', 'householdId and at least one lotId required')
  }

  const db = getDb()
  const rows: LotRow[] = []
  for (const id of ids) {
    const lot = db
      .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
      .get(householdId, id) as LotRow | undefined
    if (!lot) throw new HttpsError('not-found', 'Milk bag not found')
    const remaining = roundOz(lot.remaining_oz ?? 0)
    if (remaining <= 0) throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
    if (lot.storage !== 'fridge' && lot.storage !== 'frozen') {
      throw new HttpsError('invalid-argument', 'Invalid storage on milk bag')
    }
    rows.push(lot)
  }

  const storageSet = new Set(rows.map((r) => r.storage))
  if (storageSet.size > 1) {
    throw new HttpsError(
      'invalid-argument',
      'Redistribute bags from the same storage (all fridge or all frozen)',
    )
  }

  const remaining = roundOz(rows.reduce((sum, r) => sum + roundOz(r.remaining_oz), 0))
  const bagVolumes = parseBagVolumes(data.bags)
  if (bagVolumes.length < 1) {
    throw new HttpsError('invalid-argument', 'Enter at least one bag')
  }
  const totalBags = roundOz(bagVolumes.reduce((sum, v) => sum + v, 0))
  if (Math.abs(totalBags - remaining) > 0.01) {
    throw new HttpsError(
      'invalid-argument',
      `Bag volumes must total ${remaining} oz (got ${totalBags} oz)`,
    )
  }

  rows.sort((a, b) => new Date(a.stored_at).getTime() - new Date(b.stored_at).getTime())
  const survivor = rows[0]!
  const storage = survivor.storage as MilkStorage

  let earliestPumped = survivor.pumped_at
  let earliestStored = survivor.stored_at
  for (const row of rows) {
    if (new Date(row.pumped_at).getTime() < new Date(earliestPumped).getTime()) {
      earliestPumped = row.pumped_at
    }
    if (new Date(row.stored_at).getTime() < new Date(earliestStored).getTime()) {
      earliestStored = row.stored_at
    }
  }

  const note = rows.find((r) => r.note)?.note ?? null
  const now = nowIso()
  const newIds: string[] = []

  const tx = db.transaction(() => {
    for (const row of rows) {
      db.prepare('DELETE FROM milk_lots WHERE household_id = ? AND id = ?').run(
        householdId,
        row.id,
      )
    }
    for (let i = 0; i < bagVolumes.length; i++) {
      const vol = bagVolumes[i]!
      const newLotId = newId()
      newIds.push(newLotId)
      db.prepare(
        `INSERT INTO milk_lots (id, household_id, pumped_at, stored_at, volume_oz, remaining_oz, storage,
          feeding_id, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newLotId,
        householdId,
        earliestPumped,
        earliestStored,
        vol,
        vol,
        storage,
        i === 0 ? survivor.feeding_id : null,
        note,
        now,
        now,
      )
    }
  })
  tx()

  return { ok: true as const, bagCount: bagVolumes.length, newLotIds: newIds }
}
