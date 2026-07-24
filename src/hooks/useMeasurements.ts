import { useHouseholdCollection } from './useHouseholdCollection'
import { mapMeasurement } from '../lib/firestoreMappers'
import { timestampMs } from '../lib/time'

export function useMeasurements(householdId: string | null) {
  const { data, loading, error, refresh, loadMore, loadingMore, hasMore, daysLoaded } =
    useHouseholdCollection(
      householdId,
      'measurements',
      'measuredAt',
      mapMeasurement,
      (m) => timestampMs(m.measuredAt),
    )
  return { measurements: data, loading, error, refresh, loadMore, loadingMore, hasMore, daysLoaded }
}
