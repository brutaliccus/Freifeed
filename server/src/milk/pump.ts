import { getDb, nowIso, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { deleteMilkLotIfExists } from './deductions.js'
import {
  type FeedingInputPayload,
  type MilkStorage,
  feedingDocFromInput,
  parseMilkBagVolumes,
  roundOz,
} from './validation.js'

type Db = ReturnType<typeof getDb>
type FeedingDoc = ReturnType<typeof feedingDocFromInput>

function pickClientLotId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  if (id.length < 8 || id.length > 128) return null
  return id
}

export function upsertMilkLotForPump(
  householdId: string,
  feedingId: string,
  feedingData: FeedingDoc,
  existingLotId: string | null,
  db: Db = getDb(),
  clientLotIds: string[] = [],
): string | null {
  if (feedingData.type !== 'pump' || feedingData.volumeOz == null || !feedingData.endAt) {
    if (existingLotId) deleteMilkLotIfExists(householdId, existingLotId, db)
    return null
  }

  const pumpedAt = feedingData.startAt ?? feedingData.endAt
  const storedAt = feedingData.storedAt ?? pumpedAt
  if (!pumpedAt || !storedAt) return existingLotId

  const now = nowIso()
  if (existingLotId) {
    const lot = db
      .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
      .get(householdId, existingLotId) as
      | { volume_oz: number; remaining_oz: number }
      | undefined
    const prevVolume = lot?.volume_oz ?? feedingData.volumeOz
    const prevRemaining = lot?.remaining_oz ?? feedingData.volumeOz
    const consumed = Math.max(0, prevVolume - prevRemaining)
    const nextRemaining = Math.max(0, feedingData.volumeOz - consumed)
    db.prepare(
      `UPDATE milk_lots SET pumped_at=?, stored_at=?, volume_oz=?, remaining_oz=?, storage=?,
       feeding_id=?, note=?, updated_at=? WHERE household_id=? AND id=?`,
    ).run(
      pumpedAt,
      storedAt,
      feedingData.volumeOz,
      nextRemaining,
      feedingData.milkStorage,
      feedingId,
      feedingData.note,
      now,
      householdId,
      existingLotId,
    )
    return existingLotId
  }

  const lotId = pickClientLotId(clientLotIds?.[0]) ?? newId()
  db.prepare(
    `INSERT INTO milk_lots (id, household_id, pumped_at, stored_at, volume_oz, remaining_oz, storage,
      feeding_id, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    lotId,
    householdId,
    pumpedAt,
    storedAt,
    feedingData.volumeOz,
    feedingData.volumeOz,
    feedingData.milkStorage,
    feedingId,
    feedingData.note,
    now,
    now,
  )
  return lotId
}

export function addOzToExistingLot(
  householdId: string,
  lotId: string,
  addOz: number,
  feedingData: FeedingDoc,
  db: Db = getDb(),
): string {
  const lot = db
    .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
    .get(householdId, lotId) as
    | { remaining_oz: number; volume_oz: number; storage: string }
    | undefined
  if (!lot) throw new HttpsError('not-found', 'Milk bag not found')
  const remaining = roundOz(lot.remaining_oz ?? 0)
  const volume = roundOz(lot.volume_oz ?? 0)
  const storage = feedingData.milkStorage as MilkStorage
  if (lot.storage !== storage) {
    throw new HttpsError('invalid-argument', 'Storage must match the bag you are adding to')
  }
  if (remaining <= 0) {
    throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
  }
  const now = nowIso()
  db.prepare(
    'UPDATE milk_lots SET volume_oz=?, remaining_oz=?, updated_at=? WHERE household_id=? AND id=?',
  ).run(roundOz(volume + addOz), roundOz(remaining + addOz), now, householdId, lotId)
  return lotId
}

export function createMilkLotsFromVolumes(
  householdId: string,
  feedingId: string,
  feedingData: FeedingDoc,
  bagVolumes: number[],
  db: Db = getDb(),
  clientLotIds: string[] = [],
): string | null {
  const pumpedAt = feedingData.startAt ?? feedingData.endAt
  const storedAt = feedingData.storedAt ?? pumpedAt
  if (!pumpedAt || !storedAt) return null

  const now = nowIso()
  let firstId: string | null = null
  for (let i = 0; i < bagVolumes.length; i++) {
    const vol = bagVolumes[i]!
    const lotId = pickClientLotId(clientLotIds[i]) ?? newId()
    db.prepare(
      `INSERT INTO milk_lots (id, household_id, pumped_at, stored_at, volume_oz, remaining_oz, storage,
        feeding_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      lotId,
      householdId,
      pumpedAt,
      storedAt,
      vol,
      vol,
      feedingData.milkStorage,
      i === 0 ? feedingId : null,
      feedingData.note,
      now,
      now,
    )
    if (i === 0) firstId = lotId
  }
  return firstId
}

export function resolveMilkLotsForPump(
  householdId: string,
  feedingId: string,
  feedingData: FeedingDoc,
  existingLotId: string | null,
  input: FeedingInputPayload,
  db: Db = getDb(),
  clientLotIds: string[] = [],
): string | null {
  if (feedingData.type !== 'pump' || feedingData.volumeOz == null || !feedingData.endAt) {
    deleteMilkLotIfExists(householdId, existingLotId, db)
    return null
  }

  const addToLotId = typeof input.addToLotId === 'string' ? input.addToLotId.trim() : ''
  const bagVolumes = parseMilkBagVolumes(input.milkBagVolumes)

  if (addToLotId) {
    deleteMilkLotIfExists(householdId, existingLotId, db)
    return addOzToExistingLot(householdId, addToLotId, feedingData.volumeOz, feedingData, db)
  }

  if (bagVolumes.length > 0) {
    const total = roundOz(bagVolumes.reduce((sum, v) => sum + v, 0))
    if (Math.abs(total - feedingData.volumeOz) > 0.01) {
      throw new HttpsError(
        'invalid-argument',
        `Bag volumes must total ${feedingData.volumeOz} oz (got ${total} oz)`,
      )
    }
    deleteMilkLotIfExists(householdId, existingLotId, db)
    return createMilkLotsFromVolumes(householdId, feedingId, feedingData, bagVolumes, db, clientLotIds)
  }

  return upsertMilkLotForPump(householdId, feedingId, feedingData, existingLotId, db, clientLotIds)
}
