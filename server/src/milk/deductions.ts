import { getDb, nowIso, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { type MilkDeduction, roundOz } from './validation.js'

type Db = ReturnType<typeof getDb>

type LotRow = {
  id: string
  remaining_oz: number
  volume_oz: number
  storage: string
  stored_at: string
}

export function applyMilkDeductions(
  householdId: string,
  deductions: MilkDeduction[],
  db: Db = getDb(),
) {
  const now = nowIso()
  for (const d of deductions) {
    const lot = db
      .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
      .get(householdId, d.lotId) as LotRow | undefined
    if (!lot) throw new HttpsError('not-found', 'Selected milk bag was not found')
    const available = roundOz(lot.remaining_oz ?? 0)
    if (d.amountOz > available + 0.01) {
      throw new HttpsError(
        'invalid-argument',
        `Not enough milk in that bag (${available} oz remaining)`,
      )
    }
    db.prepare(
      'UPDATE milk_lots SET remaining_oz = ?, updated_at = ? WHERE household_id = ? AND id = ?',
    ).run(roundOz(Math.max(0, available - d.amountOz)), now, householdId, d.lotId)
  }
}

export function deductMilkForBottle(
  householdId: string,
  volumeOz: number,
  db: Db = getDb(),
): MilkDeduction[] {
  let remaining = roundOz(volumeOz)
  if (remaining <= 0) return []

  const lots = db
    .prepare(
      `SELECT id, remaining_oz, volume_oz, storage, stored_at FROM milk_lots
       WHERE household_id = ? AND remaining_oz > 0`,
    )
    .all(householdId) as LotRow[]

  lots.sort((a, b) => {
    if (a.storage === 'fridge' && b.storage === 'frozen') return -1
    if (a.storage === 'frozen' && b.storage === 'fridge') return 1
    const aStored = new Date(a.stored_at).getTime() || 0
    const bStored = new Date(b.stored_at).getTime() || 0
    return aStored - bStored
  })

  const deductions: MilkDeduction[] = []
  const now = nowIso()

  for (const lot of lots) {
    if (remaining <= 0) break
    const available = roundOz(lot.remaining_oz ?? 0)
    if (available <= 0) continue
    const take = roundOz(Math.min(available, remaining))
    if (take <= 0) continue
    db.prepare(
      'UPDATE milk_lots SET remaining_oz = ?, updated_at = ? WHERE household_id = ? AND id = ?',
    ).run(roundOz(available - take), now, householdId, lot.id)
    deductions.push({ lotId: lot.id, amountOz: take })
    remaining = roundOz(remaining - take)
  }

  return deductions
}

export function restoreMilkDeductions(
  householdId: string,
  deductions: MilkDeduction[],
  db: Db = getDb(),
) {
  const now = nowIso()
  for (const d of deductions) {
    const lot = db
      .prepare('SELECT * FROM milk_lots WHERE household_id = ? AND id = ?')
      .get(householdId, d.lotId) as LotRow | undefined
    if (!lot) continue
    const current = roundOz(lot.remaining_oz ?? 0)
    const volume = roundOz(lot.volume_oz ?? current)
    const next = roundOz(Math.min(current + d.amountOz, volume))
    db.prepare(
      'UPDATE milk_lots SET remaining_oz = ?, updated_at = ? WHERE household_id = ? AND id = ?',
    ).run(next, now, householdId, d.lotId)
  }
}

export function deleteMilkLotIfExists(
  householdId: string,
  lotId: string | null,
  db: Db = getDb(),
) {
  if (!lotId) return
  db.prepare('DELETE FROM milk_lots WHERE household_id = ? AND id = ?').run(householdId, lotId)
}

export { newId }
