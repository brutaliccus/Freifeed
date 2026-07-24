import { useMemo } from 'react'
import { useHouseholdCollection } from './useHouseholdCollection'
import { computeMilkSummary } from '../lib/milkLots'
import { mapMilkLot } from '../lib/firestoreMappers'
import { MAX_LIST_LIMIT } from '../lib/listQueryClient'
import { timestampMs } from '../lib/time'

/**
 * Full milk inventory — not a 30-day timeline.
 * Listens to every bag with remainingOz > 0, caches locally, then only
 * receives incremental onSnapshot updates (no load-more window).
 */
export function useMilkInventory(householdId: string | null) {
  const { data, loading, error, refresh } = useHouseholdCollection(
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
  const summary = useMemo(() => computeMilkSummary(data), [data])
  return {
    lots: data,
    summary,
    loading,
    error,
    refresh,
    loadMore: async () => {},
    loadingMore: false,
    hasMore: false,
    daysLoaded: 0,
  }
}
