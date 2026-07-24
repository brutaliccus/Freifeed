import { useHouseholdCollection } from './useHouseholdCollection'
import { mapDiaper } from '../lib/firestoreMappers'
import { timestampMs } from '../lib/time'

export function useDiapers(householdId: string | null) {
  const { data, loading, error, refresh, loadMore, loadingMore, hasMore, daysLoaded } =
    useHouseholdCollection(householdId, 'diapers', 'changedAt', mapDiaper, (d) =>
      timestampMs(d.changedAt),
    )
  return { diapers: data, loading, error, refresh, loadMore, loadingMore, hasMore, daysLoaded }
}
