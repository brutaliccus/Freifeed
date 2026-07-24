import { useCallback, useEffect, useRef, useState } from 'react'
import { mapFeeding } from '../lib/firestoreMappers'
import {
  applyPartnerFeedStarted,
  getInProgressFeedings,
  markFeedingsEndedByPartner,
  mergeFetchedFeedings,
  prunePartnerEndMarkers,
  type PartnerEndMarker,
} from '../lib/feedingProgress'
import type { BabyId, Feeding } from '../types'
import { timestampMs } from '../lib/time'
import { useHouseholdCollection } from './useHouseholdCollection'

export function useFeedings(householdId: string | null) {
  const {
    data: serverFeedings,
    loading,
    error,
    loadMore,
    loadingMore,
    hasMore,
    daysLoaded,
    refresh,
  } = useHouseholdCollection(householdId, 'feedings', 'createdAt', mapFeeding, (f) =>
    timestampMs(f.createdAt),
  )

  const [feedings, setFeedings] = useState<Feeding[]>([])
  const partnerEndMarkersRef = useRef<PartnerEndMarker[]>([])

  useEffect(() => {
    setFeedings((prev) => {
      partnerEndMarkersRef.current = prunePartnerEndMarkers(
        serverFeedings,
        partnerEndMarkersRef.current,
      )
      return mergeFetchedFeedings(serverFeedings, prev, partnerEndMarkersRef.current)
    })
  }, [serverFeedings])

  const markPartnerFeedEnded = useCallback((babyId: BabyId, feedingId?: string) => {
    partnerEndMarkersRef.current = [
      ...partnerEndMarkersRef.current,
      { babyId, feedingId, endedAt: Date.now() },
    ]
    setFeedings((prev) => markFeedingsEndedByPartner(prev, babyId, feedingId))
  }, [])

  const markPartnerFeedStarted = useCallback(
    (opts: { babyId: BabyId; feedingId: string; startAtMs: number; side?: string | null }) => {
      setFeedings((prev) => applyPartnerFeedStarted(prev, opts))
    },
    [],
  )

  const inProgressFeedings = getInProgressFeedings(feedings)

  return {
    feedings,
    loading,
    error,
    refresh,
    loadMore,
    loadingMore,
    hasMore,
    daysLoaded,
    markPartnerFeedEnded,
    markPartnerFeedStarted,
    inProgressFeedings,
  }
}
