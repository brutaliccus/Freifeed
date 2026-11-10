import { Timestamp } from 'firebase/firestore'
import { newClientId } from './mutationQueue'
import { syncMilkExpirationToServiceWorker } from './milkExpirationNotifications'
import {
  syncNativeMilkExpirationSchedule,
  clearNativeMilkExpirationNotifications,
} from './nativeNotifications'
import { usesNativeNotifications } from './notificationPlatform'
import { areMilkExpirationNotificationsEnabled } from './milkExpirationNotifications'
import type { MilkLot, MilkStorage } from '../types'

type LotsUpdater = (prev: MilkLot[]) => MilkLot[]

type Applier = {
  householdId: string
  apply: (updater: LotsUpdater) => void
  getLots: () => MilkLot[]
}

let applier: Applier | null = null

/** Lot ids removed in the last few seconds — skip stale due-alerts for these. */
const recentlyRemoved = new Map<string, number>()
const REMOVED_TTL_MS = 60_000

export function registerMilkInventoryApplier(next: Applier | null): void {
  applier = next
}

export function wasMilkLotRecentlyRemoved(lotId: string): boolean {
  const at = recentlyRemoved.get(lotId)
  if (at == null) return false
  if (Date.now() - at > REMOVED_TTL_MS) {
    recentlyRemoved.delete(lotId)
    return false
  }
  return true
}

function markRemoved(ids: string[]) {
  const now = Date.now()
  for (const id of ids) recentlyRemoved.set(id, now)
}

function roundOz(n: number): number {
  return Math.round(n * 100) / 100
}

async function resyncExpiration(lots: MilkLot[]) {
  if (!areMilkExpirationNotificationsEnabled()) {
    if (usesNativeNotifications()) void clearNativeMilkExpirationNotifications()
    else void syncMilkExpirationToServiceWorker([])
    return
  }
  const active = lots.filter((l) => l.remainingOz > 0)
  if (usesNativeNotifications()) {
    await syncNativeMilkExpirationSchedule(active)
  } else {
    await syncMilkExpirationToServiceWorker(active)
  }
}

function applyLocal(householdId: string, updater: LotsUpdater, removedIds: string[] = []) {
  if (removedIds.length) markRemoved(removedIds)
  if (applier && applier.householdId === householdId) {
    applier.apply((prev) => {
      const next = updater(prev)
      void resyncExpiration(next)
      return next
    })
    return
  }
  // No registered hook (edge case) — still try to rebuild alarms from updater([]).
  const next = updater([])
  void resyncExpiration(next)
}

function nowTs(): Timestamp {
  return Timestamp.now()
}

function tempLot(
  partial: Omit<MilkLot, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): MilkLot {
  const now = nowTs()
  return {
    id: partial.id ?? newClientId(),
    pumpedAt: partial.pumpedAt,
    storedAt: partial.storedAt,
    volumeOz: partial.volumeOz,
    remainingOz: partial.remainingOz,
    storage: partial.storage,
    feedingId: partial.feedingId,
    note: partial.note,
    createdAt: now,
    updatedAt: now,
  }
}

export function optimisticDeleteMilkLot(householdId: string, lotId: string): void {
  applyLocal(householdId, (prev) => prev.filter((l) => l.id !== lotId), [lotId])
}

export function optimisticUpdateMilkLot(
  householdId: string,
  lotId: string,
  payload: {
    volumeOz: number
    remainingOz: number
    note?: string | null
    storedAt?: Date | null
  },
): void {
  applyLocal(householdId, (prev) =>
    prev.map((l) => {
      if (l.id !== lotId) return l
      return {
        ...l,
        volumeOz: payload.volumeOz,
        remainingOz: payload.remainingOz,
        note: payload.note !== undefined ? payload.note : l.note,
        storedAt: payload.storedAt ? Timestamp.fromDate(payload.storedAt) : l.storedAt,
        updatedAt: nowTs(),
      }
    }),
  )
}

export function optimisticTransferMilkLots(
  householdId: string,
  lotIds: string[],
  bags: number[],
  targetStorage: MilkStorage,
): void {
  applyLocal(
    householdId,
    (prev) => {
      const sources = prev.filter((l) => lotIds.includes(l.id))
      if (sources.length === 0) return prev
      let earliestPumped = sources[0]!.pumpedAt
      for (const s of sources) {
        if (s.pumpedAt.toMillis() < earliestPumped.toMillis()) earliestPumped = s.pumpedAt
      }
      const note = sources.find((s) => s.note)?.note ?? null
      const feedingId = sources.find((s) => s.feedingId)?.feedingId ?? null
      const transferAt = nowTs()
      const without = prev.filter((l) => !lotIds.includes(l.id))
      const created = bags.map((vol, i) =>
        tempLot({
          pumpedAt: earliestPumped,
          storedAt: transferAt,
          volumeOz: vol,
          remainingOz: vol,
          storage: targetStorage,
          feedingId: i === 0 ? feedingId : null,
          note,
        }),
      )
      return [...created, ...without]
    },
    lotIds,
  )
}

export function optimisticCombineMilkLots(
  householdId: string,
  lotIds: string[],
  addOz: number | null | undefined,
): void {
  const extra = addOz == null ? 0 : roundOz(Number(addOz))
  const before = applier?.householdId === householdId ? applier.getLots() : []
  const ranked = before
    .filter((l) => lotIds.includes(l.id))
    .sort((a, b) => a.storedAt.toMillis() - b.storedAt.toMillis())
  const removedIds = ranked.slice(1).map((r) => r.id)

  applyLocal(
    householdId,
    (prev) => {
      const rows = prev
        .filter((l) => lotIds.includes(l.id))
        .sort((a, b) => a.storedAt.toMillis() - b.storedAt.toMillis())
      if (rows.length === 0) return prev
      const survivor = rows[0]!
      const others = new Set(rows.slice(1).map((r) => r.id))
      const total = roundOz(rows.reduce((s, r) => s + r.remainingOz, 0) + extra)
      let earliestPumped = survivor.pumpedAt
      let earliestStored = survivor.storedAt
      for (const r of rows) {
        if (r.pumpedAt.toMillis() < earliestPumped.toMillis()) earliestPumped = r.pumpedAt
        if (r.storedAt.toMillis() < earliestStored.toMillis()) earliestStored = r.storedAt
      }
      const note = rows.find((r) => r.note)?.note ?? null
      return prev
        .filter((l) => !others.has(l.id))
        .map((l) =>
          l.id === survivor.id
            ? {
                ...l,
                pumpedAt: earliestPumped,
                storedAt: earliestStored,
                volumeOz: total,
                remainingOz: total,
                note,
                updatedAt: nowTs(),
              }
            : l,
        )
    },
    removedIds,
  )
}

export function optimisticRedistributeMilkLot(
  householdId: string,
  lotIds: string[],
  bags: number[],
): void {
  applyLocal(
    householdId,
    (prev) => {
      const rows = prev
        .filter((l) => lotIds.includes(l.id))
        .sort((a, b) => a.storedAt.toMillis() - b.storedAt.toMillis())
      if (rows.length === 0) return prev
      const survivor = rows[0]!
      let earliestPumped = survivor.pumpedAt
      let earliestStored = survivor.storedAt
      for (const r of rows) {
        if (r.pumpedAt.toMillis() < earliestPumped.toMillis()) earliestPumped = r.pumpedAt
        if (r.storedAt.toMillis() < earliestStored.toMillis()) earliestStored = r.storedAt
      }
      const note = rows.find((r) => r.note)?.note ?? null
      const without = prev.filter((l) => !lotIds.includes(l.id))
      const created = bags.map((vol, i) =>
        tempLot({
          pumpedAt: earliestPumped,
          storedAt: earliestStored,
          volumeOz: vol,
          remainingOz: vol,
          storage: survivor.storage,
          feedingId: i === 0 ? survivor.feedingId : null,
          note,
        }),
      )
      return [...created, ...without]
    },
    lotIds,
  )
}

/** Apply bottle deductions / pump lot volume changes to local inventory immediately. */
export function optimisticApplyMilkDeductions(
  householdId: string,
  deductions: { lotId: string; amountOz: number }[],
): void {
  if (!deductions.length) return
  const depleted: string[] = []
  applyLocal(householdId, (prev) =>
    prev
      .map((l) => {
        const d = deductions.find((x) => x.lotId === l.id)
        if (!d) return l
        const remaining = roundOz(Math.max(0, l.remainingOz - d.amountOz))
        if (remaining <= 0) depleted.push(l.id)
        return { ...l, remainingOz: remaining, updatedAt: nowTs() }
      })
      .filter((l) => l.remainingOz > 0),
  )
  if (depleted.length) markRemoved(depleted)
}

/** Add pumped ounces into an existing bag (pump → addToLotId). */
export function optimisticAddOzToLot(
  householdId: string,
  lotId: string,
  addOz: number,
): void {
  const amount = roundOz(addOz)
  if (amount <= 0) return
  applyLocal(householdId, (prev) =>
    prev.map((l) => {
      if (l.id !== lotId) return l
      return {
        ...l,
        volumeOz: roundOz(l.volumeOz + amount),
        remainingOz: roundOz(l.remainingOz + amount),
        updatedAt: nowTs(),
      }
    }),
  )
}

export function optimisticUpsertMilkLot(householdId: string, lot: MilkLot): void {
  applyLocal(householdId, (prev) => {
    const idx = prev.findIndex((l) => l.id === lot.id)
    if (idx < 0) return [lot, ...prev]
    const next = [...prev]
    next[idx] = lot
    return next
  })
}

export function optimisticRemoveMilkLotIds(householdId: string, lotIds: string[]): void {
  if (!lotIds.length) return
  applyLocal(
    householdId,
    (prev) => prev.filter((l) => !lotIds.includes(l.id)),
    lotIds,
  )
}
