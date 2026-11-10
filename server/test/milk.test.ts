import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setDbForTests, getDb, nowIso, newId, toJson } from '../src/db/db.js'
import { openMemoryDb } from '../src/db/db.js'
import {
  transferMilkLotToFreezer,
  transferMilkLotToFridge,
  combineMilkLots,
  redistributeMilkLot,
} from '../src/milk/transfer.js'
import { deductMilkForBottle, restoreMilkDeductions } from '../src/milk/deductions.js'
import { HttpsError } from '../src/errors.js'
import { assertHouseholdMember } from '../src/household.js'

function seed() {
  const db = openMemoryDb()
  setDbForTests(db)
  const memberUid = 'user-member'
  const outsiderUid = 'user-outsider'
  const householdId = 'hh-test'
  const babyId = 'baby1'
  const now = nowIso()

  db.prepare(
    `INSERT INTO users (uid, email, display_name, household_id, skipped_baby_onboarding,
      skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
     VALUES (?, 'm@t.com', 'M', ?, 0, 0, '{}', '[]', ?, ?)`,
  ).run(memberUid, householdId, now, now)
  db.prepare(
    `INSERT INTO users (uid, email, display_name, household_id, skipped_baby_onboarding,
      skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
     VALUES (?, 'o@t.com', 'O', NULL, 0, 0, '{}', '[]', ?, ?)`,
  ).run(outsiderUid, now, now)
  db.prepare(
    `INSERT INTO households (id, invite_code, members, owner_uid, member_roles, person_nicknames,
      member_show_on_home, created_at, invite_rotated_at)
     VALUES (?, 'ABC123', ?, ?, ?, '{}', '{}', ?, ?)`,
  ).run(householdId, toJson([memberUid]), memberUid, toJson({ [memberUid]: 'owner' }), now, now)
  db.prepare(
    `INSERT INTO babies (id, household_id, name, show_on_home) VALUES (?, ?, 'Baby', 1)`,
  ).run(babyId, householdId)

  return { db, householdId, babyId, memberUid, outsiderUid }
}

function insertLot(
  householdId: string,
  opts: {
    id?: string
    remainingOz?: number
    volumeOz?: number
    storage?: 'fridge' | 'frozen'
    storedAt?: string
    pumpedAt?: string
  } = {},
) {
  const id = opts.id ?? newId()
  const now = nowIso()
  const volume = opts.volumeOz ?? opts.remainingOz ?? 4
  getDb()
    .prepare(
      `INSERT INTO milk_lots (id, household_id, pumped_at, stored_at, volume_oz, remaining_oz, storage,
        feeding_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .run(
      id,
      householdId,
      opts.pumpedAt ?? '2026-01-01T10:00:00.000Z',
      opts.storedAt ?? '2026-01-01T10:00:00.000Z',
      volume,
      opts.remainingOz ?? volume,
      opts.storage ?? 'fridge',
      now,
      now,
    )
  return id
}

describe('milk freeze/thaw', () => {
  afterEach(() => setDbForTests(null))

  it('replaces lot IDs and resets storedAt on freeze', () => {
    const { householdId } = seed()
    const oldId = insertLot(householdId, {
      remainingOz: 6,
      storage: 'fridge',
      storedAt: '2026-01-01T10:00:00.000Z',
      pumpedAt: '2026-01-01T08:00:00.000Z',
    })
    const before = Date.now()
    const result = transferMilkLotToFreezer({
      householdId,
      lotIds: [oldId],
      bags: [3, 3],
    })
    assert.equal(result.bagCount, 2)
    assert.ok(!result.newLotIds.includes(oldId))
    const gone = getDb()
      .prepare('SELECT 1 AS ok FROM milk_lots WHERE id = ?')
      .get(oldId)
    assert.equal(gone, undefined)

    const lots = getDb()
      .prepare('SELECT * FROM milk_lots WHERE household_id = ?')
      .all(householdId) as { id: string; storage: string; stored_at: string; remaining_oz: number }[]
    assert.equal(lots.length, 2)
    for (const lot of lots) {
      assert.equal(lot.storage, 'frozen')
      assert.ok(new Date(lot.stored_at).getTime() >= before - 1000)
      assert.notEqual(lot.stored_at, '2026-01-01T10:00:00.000Z')
      assert.equal(lot.remaining_oz, 3)
    }
  })

  it('replaces lot IDs and resets storedAt on thaw', () => {
    const { householdId } = seed()
    const oldId = insertLot(householdId, {
      remainingOz: 5,
      storage: 'frozen',
      storedAt: '2026-01-01T10:00:00.000Z',
    })
    const before = Date.now()
    const result = transferMilkLotToFridge({
      householdId,
      lotIds: [oldId],
      bags: [5],
    })
    assert.equal(result.newLotIds.length, 1)
    assert.notEqual(result.newLotIds[0], oldId)
    const lot = getDb()
      .prepare('SELECT * FROM milk_lots WHERE id = ?')
      .get(result.newLotIds[0]!) as { storage: string; stored_at: string }
    assert.equal(lot.storage, 'fridge')
    assert.ok(new Date(lot.stored_at).getTime() >= before - 1000)
  })
})

describe('combine / redistribute volume checks', () => {
  afterEach(() => setDbForTests(null))

  it('combines and rejects mismatched redistribute totals', () => {
    const { householdId } = seed()
    const a = insertLot(householdId, { remainingOz: 2, storedAt: '2026-01-01T08:00:00.000Z' })
    const b = insertLot(householdId, { remainingOz: 3, storedAt: '2026-01-01T09:00:00.000Z' })
    const combined = combineMilkLots({ householdId, lotIds: [a, b] })
    assert.equal(combined.totalOz, 5)
    assert.equal(combined.lotId, a)

    assert.throws(
      () => redistributeMilkLot({ householdId, lotIds: [a], bags: [1, 1] }),
      (err: unknown) => err instanceof HttpsError && err.code === 'invalid-argument',
    )

    const ok = redistributeMilkLot({ householdId, lotIds: [a], bags: [2, 3] })
    assert.equal(ok.bagCount, 2)
    const count = (
      getDb()
        .prepare('SELECT COUNT(*) AS c FROM milk_lots WHERE household_id = ?')
        .get(householdId) as { c: number }
    ).c
    assert.equal(count, 2)
  })
})

describe('bottle deductions', () => {
  afterEach(() => setDbForTests(null))

  it('deducts fridge-first FIFO and restores on undo', () => {
    const { householdId } = seed()
    const fridge = insertLot(householdId, {
      remainingOz: 2,
      storage: 'fridge',
      storedAt: '2026-01-01T08:00:00.000Z',
    })
    const frozen = insertLot(householdId, {
      remainingOz: 4,
      storage: 'frozen',
      storedAt: '2026-01-01T07:00:00.000Z',
    })
    const deductions = deductMilkForBottle(householdId, 3)
    assert.equal(deductions.length, 2)
    assert.equal(deductions[0]!.lotId, fridge)
    assert.equal(deductions[0]!.amountOz, 2)
    assert.equal(deductions[1]!.lotId, frozen)
    assert.equal(deductions[1]!.amountOz, 1)

    const fridgeLeft = (
      getDb().prepare('SELECT remaining_oz AS r FROM milk_lots WHERE id=?').get(fridge) as {
        r: number
      }
    ).r
    const frozenLeft = (
      getDb().prepare('SELECT remaining_oz AS r FROM milk_lots WHERE id=?').get(frozen) as {
        r: number
      }
    ).r
    assert.equal(fridgeLeft, 0)
    assert.equal(frozenLeft, 3)

    restoreMilkDeductions(householdId, deductions)
    const fridgeRestored = (
      getDb().prepare('SELECT remaining_oz AS r FROM milk_lots WHERE id=?').get(fridge) as {
        r: number
      }
    ).r
    assert.equal(fridgeRestored, 2)
  })
})

describe('authz', () => {
  afterEach(() => setDbForTests(null))

  it('denies non-members', () => {
    const { householdId, outsiderUid } = seed()
    assert.throws(
      () => assertHouseholdMember(outsiderUid, householdId),
      (err: unknown) => err instanceof HttpsError && err.code === 'permission-denied',
    )
  })
})
