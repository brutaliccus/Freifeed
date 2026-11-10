import { useEffect, useMemo, useRef } from 'react'
import { useHouseholdCollection } from './useHouseholdCollection'
import { computeMilkSummary } from '../lib/milkLots'
import { mapMilkLot } from '../lib/firestoreMappers'
import { MAX_LIST_LIMIT } from '../lib/listQueryClient'
import { timestampMs } from '../lib/time'
import { registerMilkInventoryApplier, replaceLocalMilkLots } from '../lib/milkInventoryLocal'
import { registerMutationFailureReconciler } from '../lib/mutationQueue'
import { apiListMilkLots } from '../lib/api'
import type { MilkLot } from '../types'

/**
 * Full milk inventory — not a 30-day timeline.
 * Listens to every bag with remainingOz > 0, caches locally, then only
 * receives incremental onSnapshot / SSE updates (no load-more window).
 */
export function useMilkInventory(householdId: string | null) {
  const { data, loading, error, refresh, applyLocal } = useHouseholdCollection(
    householdId,
    'milkLots',
    'storedAt',
    mapMilkLot,
    (l) => timestampMs(l.storedAt),
    {
      sinceDays: null,
      remainingOzAbove: 0,
      limit: MAX_LIST_LIMIT,
    },
  )
  const lotsRef = useRef(data)
  lotsRef.current = data
  const applyRef = useRef(applyLocal)
  applyRef.current = applyLocal

  useEffect(() => {
    if (!householdId) {
      registerMilkInventoryApplier(null)
      return
    }
    registerMilkInventoryApplier({
      householdId,
      apply: (updater) => applyRef.current(updater as (prev: MilkLot[]) => MilkLot[]),
      getLots: () => lotsRef.current,
    })
    registerMutationFailureReconciler(async (name, payload) => {
      const hid =
        payload && typeof payload === 'object' && 'householdId' in payload
          ? String((payload as { householdId?: string }).householdId ?? '')
          : ''
      if (!hid || hid !== householdId) return
      try {
        const lots = await apiListMilkLots(hid)
        replaceLocalMilkLots(hid, lots)
      } catch (err) {
        console.warn(`Failed to reconcile milk inventory after ${name}`, err)
      }
    })
    return () => {
      registerMilkInventoryApplier(null)
      registerMutationFailureReconciler(null)
    }
  }, [householdId])

  const summary = useMemo(() => computeMilkSummary(data), [data])
  return {
    lots: data,
    summary,
    loading,
    error,
    refresh,
    applyLocal,
    loadMore: async () => {},
    loadingMore: false,
    hasMore: false,
    daysLoaded: 0,
  }
}
