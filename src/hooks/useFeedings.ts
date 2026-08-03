import { useCallback, useEffect, useRef, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { mapFeeding } from '../lib/firestoreMappers'
import {
  applyPartnerFeedStarted,
  getInProgressFeedings,
  markFeedingsEndedByPartner,
  mergeFetchedFeedings,
  prunePartnerEndMarkers,
  type PartnerEndMarker,
} from '../lib/feedingProgress'
import { feedingFromInput, isFeedingMutationPending } from '../lib/feedingMutations'
import type { FeedingInput } from '../lib/api'
import type { BabyId, Feeding } from '../types'
import { timestampMs } from '../lib/time'
import { useHouseholdCollection } from './useHouseholdCollection'
import { subscribePendingMutations } from '../lib/mutationQueue'

function mergeWithOptimistic(
  server: Feeding[],
  optimistic: Map<string, Feeding | 'deleted'>,
): Feeding[] {
  const byId = new Map(server.map((f) => [f.id, f]))
  for (const [id, patch] of optimistic) {
    if (patch === 'deleted') {
      byId.delete(id)
      continue
    }
    // Keep optimistic version while a mutation is still pending for this id.
    if (isFeedingMutationPending(id) || !byId.has(id)) {
      byId.set(id, patch)
    } else {
      // Server caught up — drop optimistic overlay for this id.
      optimistic.delete(id)
    }
  }
  return [...byId.values()]
}

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
  const optimisticRef = useRef(new Map<string, Feeding | 'deleted'>())

  const recompute = useCallback((server: Feeding[]) => {
    partnerEndMarkersRef.current = prunePartnerEndMarkers(
      server,
      partnerEndMarkersRef.current,
    )
    const merged = mergeFetchedFeedings(server, [], partnerEndMarkersRef.current)
    // Prune optimistic entries confirmed by server (and not pending).
    for (const [id, patch] of [...optimisticRef.current]) {
      if (patch === 'deleted') {
        if (!merged.some((f) => f.id === id) && !isFeedingMutationPending(id)) {
          optimisticRef.current.delete(id)
        }
        continue
      }
      const serverHit = merged.find((f) => f.id === id)
      if (serverHit && !isFeedingMutationPending(id)) {
        optimisticRef.current.delete(id)
      }
    }
    setFeedings(mergeWithOptimistic(merged, optimisticRef.current))
  }, [])

  useEffect(() => {
    recompute(serverFeedings)
  }, [serverFeedings, recompute])

  useEffect(() => {
    return subscribePendingMutations(() => {
      recompute(serverFeedings)
    })
  }, [serverFeedings, recompute])

  const upsertOptimisticFeeding = useCallback((feeding: Feeding) => {
    optimisticRef.current.set(feeding.id, feeding)
    setFeedings((prev) => {
      const without = prev.filter((f) => f.id !== feeding.id)
      return [feeding, ...without]
    })
  }, [])

  const patchOptimisticFeeding = useCallback((feedingId: string, input: FeedingInput) => {
    setFeedings((prev) => {
      const existing = prev.find((f) => f.id === feedingId)
      const next = existing
        ? {
            ...existing,
            type: input.type,
            babyId: input.babyId,
            side: input.side,
            startAt: input.startAt ? Timestamp.fromDate(input.startAt) : existing.startAt,
            endAt: input.endAt ? Timestamp.fromDate(input.endAt) : null,
            volumeOz: input.volumeOz,
            milkStorage: input.milkStorage,
            storedAt: input.storedAt ? Timestamp.fromDate(input.storedAt) : existing.storedAt,
            milkDeductions: input.milkDeductions ?? existing.milkDeductions,
            weightLb: input.weightLb,
            weightOz: input.weightOz,
            note: input.note,
            updatedAt: Timestamp.now(),
          }
        : feedingFromInput(feedingId, '', input)
      optimisticRef.current.set(feedingId, next)
      return prev.some((f) => f.id === feedingId)
        ? prev.map((f) => (f.id === feedingId ? next : f))
        : [next, ...prev]
    })
  }, [])

  const removeOptimisticFeeding = useCallback((feedingId: string) => {
    optimisticRef.current.set(feedingId, 'deleted')
    setFeedings((prev) => prev.filter((f) => f.id !== feedingId))
  }, [])

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
    upsertOptimisticFeeding,
    patchOptimisticFeeding,
    removeOptimisticFeeding,
  }
}
