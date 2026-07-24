import { format } from 'date-fns'
import { formatVolumeOz } from './feedingTypes'
import { timestampToDate } from './time'
import type { MilkLot } from '../types'

/** MM/DD, or MM/DD/YY when the stored year is not the current year. */
export function formatMilkBagDate(storedAt: Date | null, now = new Date()): string {
  if (!storedAt) return '—'
  const base = format(storedAt, 'MM/dd')
  if (storedAt.getFullYear() !== now.getFullYear()) {
    return `${base}/${format(storedAt, 'yy')}`
  }
  return base
}

/** Hour only, e.g. 8am */
export function formatMilkBagHour(at: Date | null): string {
  if (!at) return '—'
  return format(at, 'h a')
    .toLowerCase()
    .replace(/\s/g, '')
}

export function milkBagDisplay(lot: MilkLot, now = new Date()) {
  const stored = timestampToDate(lot.storedAt)
  const pumped = timestampToDate(lot.pumpedAt)
  const dateSource = stored ?? pumped
  const timeSource = pumped ?? stored
  return {
    date: formatMilkBagDate(dateSource, now),
    time: formatMilkBagHour(timeSource),
    oz: formatVolumeOz(lot.remainingOz) || String(lot.remainingOz),
  }
}
