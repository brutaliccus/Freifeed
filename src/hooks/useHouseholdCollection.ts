import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DocumentData } from 'firebase/firestore'
import {
  readCachedCollection,
  writeCachedCollection,
} from '../lib/householdCollectionCache'
import {
  fetchOlderHouseholdBatch,
  mappedItemRevision,
  orderFieldMs,
  subscribeHouseholdCollection,
} from '../lib/householdSubscriptions'
import {
  DEFAULT_SINCE_DAYS,
  LOAD_MORE_DAYS,
  MAX_HISTORY_DAYS,
  LIVE_LIST_LIMIT,
} from '../lib/listQueryClient'

export interface HouseholdCollectionOptions {
  enabled?: boolean
  /** When null, no date filter (e.g. medicines, milk inventory). */
  sinceDays?: number | null
  loadMoreDays?: number
  limit?: number
  /**
   * When set (e.g. 0 for milk), only docs with remainingOz > value are listened.
   * Cannot combine with a date window — date filter is ignored when this is set.
   */
  remainingOzAbove?: number | null
}

export interface HouseholdCollectionResult<T> {
  data: T[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  daysLoaded: number
  error: string | null
  loadMore: () => Promise<void>
  refresh: () => void
}

function mergeById<T extends { id: string }>(live: T[], older: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of older) map.set(item.id, item)
  for (const item of live) map.set(item.id, item)
  return [...map.values()]
}

function safeSortMs<T>(getSortMs: (item: T) => number, item: T): number {
  try {
    const ms = getSortMs(item)
    return Number.isFinite(ms) ? ms : 0
  } catch {
    return 0
  }
}

/**
 * Real-time household subcollection listener with optional date window + load more.
 * Seeds from localStorage on open; Firestore IndexedDB cache handles warm sync.
 * After the first full snapshot, only document deltas are billed.
 */
export function useHouseholdCollection<T extends { id: string }>(
  householdId: string | null,
  collectionName: string,
  orderByField: string,
  mapDoc: (id: string, data: DocumentData) => T,
  getSortMs: (item: T) => number,
  options: HouseholdCollectionOptions = {},
): HouseholdCollectionResult<T> {
  const {
    enabled = true,
    sinceDays = DEFAULT_SINCE_DAYS,
    loadMoreDays = LOAD_MORE_DAYS,
    limit = LIVE_LIST_LIMIT,
    remainingOzAbove = null,
  } = options

  // Date window is incompatible with remainingOz inequality on another field.
  const effectiveSinceDays = remainingOzAbove != null ? null : sinceDays

  const [liveData, setLiveData] = useState<T[]>([])
  const [olderData, setOlderData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(
    effectiveSinceDays != null && effectiveSinceDays < MAX_HISTORY_DAYS,
  )
  const [daysLoaded, setDaysLoaded] = useState(effectiveSinceDays ?? 0)
  const [error, setError] = useState<string | null>(null)

  const mapRef = useRef(mapDoc)
  mapRef.current = mapDoc
  const getSortMsRef = useRef(getSortMs)
  getSortMsRef.current = getSortMs
  const liveRef = useRef(liveData)
  liveRef.current = liveData
  const olderRef = useRef(olderData)
  olderRef.current = olderData
  const oldestExtraMsRef = useRef<number | null>(null)
  const loadingMoreRef = useRef(false)
  const cacheWriteTimerRef = useRef<number | null>(null)
  const lastCacheSigRef = useRef('')
  const activeHouseholdRef = useRef<string | null>(null)
  const hasServerSnapshotRef = useRef(false)

  const scheduleCacheWrite = useCallback(
    (household: string, items: T[]) => {
      const sig = items
        .map((item) => `${item.id}:${mappedItemRevision(item, getSortMsRef.current)}`)
        .join('|')
      if (sig === lastCacheSigRef.current) return

      const flush = () => {
        cacheWriteTimerRef.current = null
        lastCacheSigRef.current = sig
        writeCachedCollection(household, collectionName, items)
      }

      if (cacheWriteTimerRef.current != null) {
        window.clearTimeout(cacheWriteTimerRef.current)
      }
      cacheWriteTimerRef.current = window.setTimeout(flush, 5_000)
    },
    [collectionName],
  )

  useEffect(() => {
    if (!householdId || !enabled) {
      setLoading(false)
      return
    }

    const householdChanged = activeHouseholdRef.current !== householdId
    activeHouseholdRef.current = householdId

    if (householdChanged) {
      hasServerSnapshotRef.current = false
      const cached = readCachedCollection<T>(householdId, collectionName)
      if (cached && cached.length > 0) {
        setLiveData(cached)
        setLoading(false)
        lastCacheSigRef.current = cached
          .map((item) => `${item.id}:${mappedItemRevision(item, getSortMsRef.current)}`)
          .join('|')
      } else {
        setLiveData([])
        setLoading(true)
        lastCacheSigRef.current = ''
      }
      setOlderData([])
      setHasMore(effectiveSinceDays != null && effectiveSinceDays < MAX_HISTORY_DAYS)
      setDaysLoaded(effectiveSinceDays ?? 0)
      oldestExtraMsRef.current = null
      setError(null)
    }

    return subscribeHouseholdCollection(
      householdId,
      collectionName,
      orderByField,
      limit,
      (snap) => {
        let next: T[]
        try {
          next = snap.docs.map((d) => mapRef.current(d.id, d.data()))
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to map documents')
          setLoading(false)
          return
        }
        hasServerSnapshotRef.current = true
        setLiveData((prev) => {
          if (
            prev.length === next.length &&
            prev.every((p, i) => {
              const n = next[i]
              return (
                n &&
                p.id === n.id &&
                mappedItemRevision(p, getSortMsRef.current) ===
                  mappedItemRevision(n, getSortMsRef.current)
              )
            })
          ) {
            return prev
          }
          scheduleCacheWrite(householdId, next)
          return next
        })
        setError(null)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
      effectiveSinceDays,
      remainingOzAbove,
    )
  }, [
    householdId,
    collectionName,
    orderByField,
    limit,
    enabled,
    effectiveSinceDays,
    remainingOzAbove,
    scheduleCacheWrite,
  ])

  useEffect(() => {
    return () => {
      if (cacheWriteTimerRef.current != null) {
        window.clearTimeout(cacheWriteTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!householdId || !enabled) return
    const flushOnHide = () => {
      if (document.visibilityState !== 'hidden') return
      // Allow writing [] once we have a real snapshot so emptied inventory
      // doesn't leave a stale non-empty localStorage cache.
      if (!hasServerSnapshotRef.current && liveRef.current.length === 0) return
      writeCachedCollection(householdId, collectionName, liveRef.current)
    }
    document.addEventListener('visibilitychange', flushOnHide)
    return () => document.removeEventListener('visibilitychange', flushOnHide)
  }, [householdId, enabled, collectionName])

  const loadMore = useCallback(async () => {
    if (
      !householdId ||
      !enabled ||
      effectiveSinceDays == null ||
      remainingOzAbove != null ||
      loadingMoreRef.current
    ) {
      return
    }
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const allCurrent = mergeById(liveRef.current, olderRef.current)
      let beforeMs = oldestExtraMsRef.current
      if (beforeMs == null) {
        if (allCurrent.length === 0) {
          beforeMs = Date.now()
        } else {
          beforeMs = Math.min(
            ...allCurrent.map((item) => safeSortMs(getSortMsRef.current, item)),
          )
        }
      }

      const docs = await fetchOlderHouseholdBatch(
        householdId,
        collectionName,
        orderByField,
        beforeMs,
        loadMoreDays,
        limit,
      )
      const mapped = docs.map((d) => mapRef.current(d.id, d.data()))
      if (mapped.length === 0) {
        setHasMore(false)
        return
      }

      setOlderData((prev) => mergeById(mapped, prev))
      oldestExtraMsRef.current = Math.min(
        ...docs.map((d) => orderFieldMs(d.data(), orderByField)),
      )
      setDaysLoaded((prev) => {
        const nextDays = prev + loadMoreDays
        setHasMore(nextDays < MAX_HISTORY_DAYS)
        return nextDays
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [
    householdId,
    enabled,
    effectiveSinceDays,
    remainingOzAbove,
    loadMoreDays,
    limit,
    collectionName,
    orderByField,
  ])

  const refresh = useCallback(() => {}, [])
  const data = useMemo(() => {
    const merged = mergeById(liveData, olderData)
    return merged.sort(
      (a, b) =>
        safeSortMs(getSortMsRef.current, b) - safeSortMs(getSortMsRef.current, a),
    )
  }, [liveData, olderData])

  return { data, loading, loadingMore, hasMore, daysLoaded, error, loadMore, refresh }
}
