import { useHouseholdCollection } from './useHouseholdCollection'
import { mapMedicine } from '../lib/firestoreMappers'
import { timestampMs } from '../lib/time'

/** Medicines are not date-windowed — active meds may have started months ago. */
export function useMedicines(householdId: string | null) {
  const { data, loading, error, refresh } = useHouseholdCollection(
    householdId,
    'medicines',
    'createdAt',
    mapMedicine,
    (m) => timestampMs(m.createdAt),
    { sinceDays: null, limit: 200 },
  )
  return {
    medicines: data,
    loading,
    error,
    refresh,
    loadMore: async () => {},
    loadingMore: false,
    hasMore: false,
    daysLoaded: 0,
  }
}
