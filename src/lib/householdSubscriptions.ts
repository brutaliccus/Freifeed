import {
  collection,
  getDocs,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore'
import { db } from '../firebase'
import { DEFAULT_SINCE_DAYS, MAX_LIST_LIMIT, sinceDate } from './listQueryClient'

/**
 * Shared, reference-counted Firestore subscription registry.
 *
 * Timeline collections (feedings, diapers, …) use a recent date window.
 * Inventory collections (milkLots) load the full active set and stay synced
 * via onSnapshot — older empty lots are excluded with remainingOz > 0.
 */

type DataListener = (snap: QuerySnapshot<DocumentData>) => void
type ErrorListener = (err: Error) => void

interface Entry {
  unsub: () => void
  latest: QuerySnapshot<DocumentData> | null
  lastSig: string
  dataListeners: Set<DataListener>
  errorListeners: Set<ErrorListener>
}

function docRevision(data: DocumentData, orderField: string): string {
  const parts = [
    orderFieldMs(data, orderField),
    orderFieldMs(data, 'updatedAt'),
    orderFieldMs(data, 'startAt'),
    data.endAt == null ? -1 : orderFieldMs(data, 'endAt'),
    orderFieldMs(data, 'scheduledAt'),
    orderFieldMs(data, 'changedAt'),
    orderFieldMs(data, 'storedAt'),
  ]
  return parts.join(':')
}

function snapshotSig(snap: QuerySnapshot<DocumentData>, orderField: string): string {
  return snap.docs
    .map((d) => `${d.id}:${docRevision(d.data(), orderField)}`)
    .join('|')
}

/** Revision string for mapped client items — keeps listener dedupe in sync with snapshots. */
export function mappedItemRevision(
  item: unknown,
  getSortMs: (item: never) => number,
): string {
  const base = getSortMs(item as never)
  if (!item || typeof item !== 'object') return String(base)
  const o = item as Record<string, unknown>
  const ts = (k: string) => {
    const v = o[k] as { toMillis?: () => number } | null | undefined
    return v && typeof v.toMillis === 'function' ? v.toMillis() : -1
  }
  return [
    base,
    ts('updatedAt'),
    ts('startAt'),
    ts('endAt'),
    ts('scheduledAt'),
    ts('changedAt'),
    ts('storedAt'),
  ].join(':')
}

const entries = new Map<string, Entry>()

/** Pin the since boundary for this session so midnight does not invalidate queries. */
const pinnedSinceMs = new Map<string, number>()

function pinnedSinceBoundary(householdId: string, sinceDays: number): number {
  const key = `${householdId}::${sinceDays}`
  let ms = pinnedSinceMs.get(key)
  if (ms == null) {
    ms = sinceDate(sinceDays).getTime()
    pinnedSinceMs.set(key, ms)
  }
  return ms
}

export function clearPinnedSinceBoundaries(householdId?: string): void {
  if (!householdId) {
    pinnedSinceMs.clear()
    return
  }
  const prefix = `${householdId}::`
  for (const key of pinnedSinceMs.keys()) {
    if (key.startsWith(prefix)) pinnedSinceMs.delete(key)
  }
}

/** Drop all Firestore listeners for a household (call on sign-out). */
export function destroyHouseholdSubscriptions(householdId?: string): void {
  for (const [key, entry] of entries) {
    if (!householdId || key.startsWith(`${householdId}::`)) {
      entry.unsub()
      entries.delete(key)
    }
  }
  if (householdId) clearPinnedSinceBoundaries(householdId)
  else clearPinnedSinceBoundaries()
}

function keyFor(
  householdId: string,
  collectionName: string,
  orderByField: string,
  sinceMs: number | null,
  limitCount: number,
  remainingOzAbove: number | null = null,
): string {
  return `${householdId}::${collectionName}::${orderByField}::${sinceMs ?? 'all'}::${limitCount}::rem>${remainingOzAbove ?? 'any'}`
}

function buildQuery(
  householdId: string,
  collectionName: string,
  orderByField: string,
  sinceMs: number | null,
  limitCount: number,
  remainingOzAbove: number | null = null,
  extra: QueryConstraint[] = [],
) {
  const col = collection(db, `households/${householdId}/${collectionName}`)
  const constraints: QueryConstraint[] = [...extra]
  if (remainingOzAbove != null) {
    // Active inventory only. Order by remainingOz (required for the inequality);
    // the client re-sorts by storedAt. Avoids needing a composite index.
    constraints.push(where('remainingOz', '>', remainingOzAbove))
    constraints.push(orderBy('remainingOz', 'desc'))
  } else {
    if (sinceMs != null) {
      constraints.push(where(orderByField, '>=', Timestamp.fromMillis(sinceMs)))
    }
    constraints.push(orderBy(orderByField, 'desc'))
  }
  constraints.push(fbLimit(limitCount))
  return query(col, ...constraints)
}

export function subscribeHouseholdCollection(
  householdId: string,
  collectionName: string,
  orderByField: string,
  limitCount: number,
  onData: DataListener,
  onError?: ErrorListener,
  sinceDays: number | null = DEFAULT_SINCE_DAYS,
  remainingOzAbove: number | null = null,
): () => void {
  // remainingOz filter cannot combine with a date inequality on another field.
  const sinceMs =
    remainingOzAbove != null
      ? null
      : sinceDays != null
        ? pinnedSinceBoundary(householdId, sinceDays)
        : null
  const key = keyFor(
    householdId,
    collectionName,
    orderByField,
    sinceMs,
    limitCount,
    remainingOzAbove,
  )
  let entry = entries.get(key)

  if (!entry) {
    const created: Entry = {
      unsub: () => {},
      latest: null,
      lastSig: '',
      dataListeners: new Set(),
      errorListeners: new Set(),
    }
    const q = buildQuery(
      householdId,
      collectionName,
      orderByField,
      sinceMs,
      limitCount,
      remainingOzAbove,
    )
    created.unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        const sig = snapshotSig(snap, orderByField)
        if (sig === created.lastSig) return
        created.lastSig = sig
        created.latest = snap
        for (const listener of created.dataListeners) listener(snap)
      },
      (err) => {
        for (const listener of created.errorListeners) listener(err)
      },
    )
    entries.set(key, created)
    entry = created
  }

  const activeEntry = entry
  activeEntry.dataListeners.add(onData)
  if (onError) activeEntry.errorListeners.add(onError)
  if (activeEntry.latest) onData(activeEntry.latest)

  return () => {
    const current = entries.get(key)
    if (!current) return
    current.dataListeners.delete(onData)
    if (onError) current.errorListeners.delete(onError)
    // Keep the Firestore listener alive — re-attaching causes billed server reads.
  }
}

/** Fetch documents in `(afterMs, beforeMs)` ordered newest-first. */
export async function fetchOlderHouseholdBatch(
  householdId: string,
  collectionName: string,
  orderByField: string,
  beforeMs: number,
  daysBack: number,
  limitCount = MAX_LIST_LIMIT,
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const afterDate = new Date(beforeMs)
  afterDate.setDate(afterDate.getDate() - daysBack)
  afterDate.setHours(0, 0, 0, 0)
  const afterMs = afterDate.getTime()

  const col = collection(db, `households/${householdId}/${collectionName}`)
  const q = query(
    col,
    where(orderByField, '>=', Timestamp.fromMillis(afterMs)),
    where(orderByField, '<', Timestamp.fromMillis(beforeMs)),
    orderBy(orderByField, 'desc'),
    fbLimit(limitCount),
  )
  const snap = await getDocs(q)
  return snap.docs
}

export function orderFieldMs(data: DocumentData, field: string): number {
  const raw = data[field]
  if (raw == null) return 0
  try {
    if (raw instanceof Timestamp) return raw.toMillis()
    if (typeof (raw as { toMillis?: () => number }).toMillis === 'function') {
      const ms = (raw as { toMillis: () => number }).toMillis()
      return Number.isFinite(ms) ? ms : 0
    }
    if (typeof raw === 'object' && '__ts' in (raw as object)) {
      const ms = Number((raw as { __ts: unknown }).__ts)
      return Number.isFinite(ms) ? ms : 0
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  } catch {
    return 0
  }
  return 0
}
