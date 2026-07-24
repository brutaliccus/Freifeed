import { format } from 'date-fns'
import { formatVolumeOz } from './feedingTypes'
import { timestampToDate } from './time'
import type { MilkLot } from '../types'

export function formatMilkLotOption(lot: MilkLot): string {
  const stored = timestampToDate(lot.storedAt)
  const date = stored ? format(stored, 'MMM d') : '—'
  const loc = lot.storage === 'fridge' ? 'Fridge' : 'Frozen'
  const oz = formatVolumeOz(lot.remainingOz) || String(lot.remainingOz)
  return `${date} · ${loc} · ${oz} oz left`
}

export function milkLotsForBottleDeduction(lots: MilkLot[]): MilkLot[] {
  return lots
    .filter((l) => l.remainingOz > 0)
    .sort((a, b) => {
      if (a.storage !== b.storage) return a.storage === 'fridge' ? -1 : 1
      const sa = timestampToDate(a.storedAt)?.getTime() ?? 0
      const sb = timestampToDate(b.storedAt)?.getTime() ?? 0
      return sa - sb
    })
}

export function fridgeLotsWithMilk(lots: MilkLot[]): MilkLot[] {
  return lots
    .filter((l) => l.storage === 'fridge' && l.remainingOz > 0)
    .sort((a, b) => {
      const sa = timestampToDate(a.storedAt)?.getTime() ?? 0
      const sb = timestampToDate(b.storedAt)?.getTime() ?? 0
      return sa - sb
    })
}

export function frozenLotsWithMilk(lots: MilkLot[]): MilkLot[] {
  return lots
    .filter((l) => l.storage === 'frozen' && l.remainingOz > 0)
    .sort((a, b) => {
      const sa = timestampToDate(a.storedAt)?.getTime() ?? 0
      const sb = timestampToDate(b.storedAt)?.getTime() ?? 0
      return sa - sb
    })
}
