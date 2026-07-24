import { milkLotsForBottleDeduction } from './milkLotLabels'
import type { MilkDeduction, MilkLot } from '../types'

function roundOz(n: number): number {
  return Math.round(n * 100) / 100
}

/** Split `volumeOz` across selected bags (fridge first, oldest stored first). */
export function allocateBottleDeductions(
  lots: MilkLot[],
  selectedLotIds: string[],
  volumeOz: number,
): MilkDeduction[] {
  const target = roundOz(volumeOz)
  if (target <= 0 || selectedLotIds.length === 0) return []

  const selected = new Set(selectedLotIds)
  const ordered = milkLotsForBottleDeduction(lots).filter((l) => selected.has(l.id))
  let remaining = target
  const out: MilkDeduction[] = []

  for (const lot of ordered) {
    if (remaining <= 0.001) break
    const available = roundOz(lot.remainingOz)
    if (available <= 0) continue
    const take = roundOz(Math.min(available, remaining))
    if (take <= 0) continue
    out.push({ lotId: lot.id, amountOz: take })
    remaining = roundOz(remaining - take)
  }

  return out
}

export function totalDeductionOz(deductions: MilkDeduction[]): number {
  return roundOz(deductions.reduce((sum, d) => sum + d.amountOz, 0))
}

export function deductionsMatchVolume(deductions: MilkDeduction[], volumeOz: number): boolean {
  return Math.abs(totalDeductionOz(deductions) - roundOz(volumeOz)) <= 0.01
}

export function maxAvailableFromLots(lots: MilkLot[], selectedLotIds: string[]): number {
  const selected = new Set(selectedLotIds)
  return roundOz(
    lots.filter((l) => selected.has(l.id)).reduce((sum, l) => sum + Math.max(0, l.remainingOz), 0),
  )
}

/** Smallest set of bags (FIFO) that can cover `volumeOz`, or [] if storage is insufficient. */
export function suggestBottleBagIds(lots: MilkLot[], volumeOz: number): string[] {
  const target = roundOz(volumeOz)
  if (target <= 0) return []

  const ordered = milkLotsForBottleDeduction(lots)
  const ids: string[] = []
  let need = target

  for (const lot of ordered) {
    if (need <= 0.001) break
    const available = roundOz(lot.remainingOz)
    if (available <= 0) continue
    ids.push(lot.id)
    need = roundOz(need - available)
  }

  const alloc = allocateBottleDeductions(lots, ids, volumeOz)
  return deductionsMatchVolume(alloc, volumeOz) ? ids : []
}

export function formatDeductionSummary(
  deductions: MilkDeduction[],
  lots: MilkLot[],
  formatLot: (lot: MilkLot) => string,
): string {
  const byId = new Map(lots.map((l) => [l.id, l]))
  return deductions
    .map((d) => {
      const lot = byId.get(d.lotId)
      if (!lot) return null
      return `${formatLot(lot)} (${d.amountOz} oz)`
    })
    .filter(Boolean)
    .join('; ')
}
