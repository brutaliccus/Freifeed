import { addDays, addMonths } from 'date-fns'
import { formatVolumeOz } from './feedingTypes'
import { timestampToDate } from './time'
import type { MilkLot, MilkStorage } from '../types'

/** Refrigerated breast milk: safe storage window from bagged/stored time. */
export const FRIDGE_STORAGE_DAYS = 4
/** Frozen breast milk: safe storage window from frozen/stored time. */
export const FROZEN_STORAGE_MONTHS = 6

const MS_HOUR = 60 * 60 * 1000
const MS_DAY = 24 * MS_HOUR
const MS_WEEK = 7 * MS_DAY

/** SW / native may still fire an alarm this long after its scheduled time. */
export const MILK_EXPIRY_FIRE_STALE_MS = 10 * 60 * 1000

export type MilkExpirationTone = 'ok' | 'warning' | 'critical'

export type MilkExpirationAlarmKind =
  | 'fridge-soon'
  | 'fridge-expired'
  | 'frozen-week'
  | 'frozen-day'
  | 'frozen-expired'

export interface MilkExpirationState {
  expiresAt: Date
  remainingMs: number
  tone: MilkExpirationTone
  label: string
}

export interface MilkExpirationAlarm {
  lotId: string
  kind: MilkExpirationAlarmKind
  atMs: number
  title: string
  body: string
}

export function milkStorageAnchor(lot: MilkLot): Date {
  return timestampToDate(lot.storedAt) ?? new Date()
}

export function milkExpiresAt(lot: MilkLot): Date {
  const stored = milkStorageAnchor(lot)
  if (lot.storage === 'fridge') return addDays(stored, FRIDGE_STORAGE_DAYS)
  return addMonths(stored, FROZEN_STORAGE_MONTHS)
}

export function getMilkExpirationState(lot: MilkLot, now = new Date()): MilkExpirationState {
  const expiresAt = milkExpiresAt(lot)
  const remainingMs = expiresAt.getTime() - now.getTime()
  const tone = milkExpirationTone(lot.storage, remainingMs)
  const label = formatMilkTimeRemaining(remainingMs)
  return { expiresAt, remainingMs, tone, label }
}

export function milkExpirationTone(storage: MilkStorage, remainingMs: number): MilkExpirationTone {
  if (remainingMs <= 0) return 'critical'
  if (storage === 'fridge') {
    if (remainingMs < MS_DAY) return 'warning'
    return 'ok'
  }
  if (remainingMs < MS_DAY) return 'critical'
  if (remainingMs < MS_WEEK) return 'warning'
  return 'ok'
}

/** Days when ≥24h left; hours when under 24h; "Expired" at or past deadline. */
export function formatMilkTimeRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return 'Expired'
  if (remainingMs >= MS_DAY) {
    const days = Math.floor(remainingMs / MS_DAY)
    return days === 1 ? '1 day left' : `${days} days left`
  }
  const hours = Math.max(1, Math.ceil(remainingMs / MS_HOUR))
  return hours === 1 ? '1 hour left' : `${hours} hours left`
}

function alarmCopy(
  lot: MilkLot,
  kind: MilkExpirationAlarmKind,
): { title: string; body: string } {
  const vol = formatVolumeOz(lot.remainingOz)
  const where = lot.storage === 'fridge' ? 'refrigerated' : 'frozen'
  switch (kind) {
    case 'fridge-soon':
      return {
        title: 'Milk expires soon',
        body: `${vol} oz ${where} milk expires in about 24 hours.`,
      }
    case 'fridge-expired':
      return {
        title: 'Milk expired',
        body: `${vol} oz ${where} milk has expired — discard or use with caution.`,
      }
    case 'frozen-week':
      return {
        title: 'Frozen milk expires in 1 week',
        body: `${vol} oz frozen milk reaches its storage limit in about 7 days.`,
      }
    case 'frozen-day':
      return {
        title: 'Frozen milk expires soon',
        body: `${vol} oz frozen milk expires in about 24 hours.`,
      }
    case 'frozen-expired':
      return {
        title: 'Frozen milk expired',
        body: `${vol} oz frozen milk has expired — discard or use with caution.`,
      }
  }
}

export function shouldIncludeMilkExpirationAlarm(
  kind: MilkExpirationAlarmKind,
  atMs: number,
  expiresMs: number,
  nowMs: number,
): boolean {
  if (atMs > nowMs) return true
  if (kind === 'fridge-soon' || kind === 'frozen-day') {
    return nowMs < expiresMs
  }
  if (kind === 'frozen-week') {
    return nowMs < expiresMs - MS_DAY
  }
  return nowMs - atMs <= MILK_EXPIRY_FIRE_STALE_MS
}

export function buildMilkExpirationAlarms(lots: MilkLot[], now = new Date()): MilkExpirationAlarm[] {
  const out: MilkExpirationAlarm[] = []
  const nowMs = now.getTime()

  for (const lot of lots) {
    if (lot.remainingOz <= 0) continue
    const expiresAt = milkExpiresAt(lot)
    const expiresMs = expiresAt.getTime()

    const push = (kind: MilkExpirationAlarmKind, atMs: number) => {
      if (!shouldIncludeMilkExpirationAlarm(kind, atMs, expiresMs, nowMs)) return
      const { title, body } = alarmCopy(lot, kind)
      out.push({ lotId: lot.id, kind, atMs, title, body })
    }

    if (lot.storage === 'fridge') {
      push('fridge-soon', expiresMs - MS_DAY)
      push('fridge-expired', expiresMs)
    } else {
      push('frozen-week', expiresMs - MS_WEEK)
      push('frozen-day', expiresMs - MS_DAY)
      push('frozen-expired', expiresMs)
    }
  }

  return out.sort((a, b) => a.atMs - b.atMs)
}
