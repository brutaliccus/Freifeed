import type { DocumentData, QuerySnapshot } from 'firebase/firestore'
import { getApiBase } from './apiMode'
import { authHeaders, clearSession } from './sessionAuth'
import { invokeBackend } from './apiTransport'

type DataListener = (snap: QuerySnapshot<DocumentData>) => void
type ErrorListener = (err: Error) => void

interface ApiEntry {
  unsub: () => void
  latest: QuerySnapshot<DocumentData> | null
  lastSig: string
  dataListeners: Set<DataListener>
  errorListeners: Set<ErrorListener>
  refresh: () => Promise<void>
}

const entries = new Map<string, ApiEntry>()
let sse: EventSource | null = null
let sseHouseholdId: string | null = null
const sseRefCount = new Map<string, number>()

function fakeSnap(
  docs: { id: string; data: DocumentData }[],
): QuerySnapshot<DocumentData> {
  const mapped = docs.map((d) => ({
    id: d.id,
    data: () => d.data,
    exists: () => true,
  }))
  return {
    docs: mapped,
    empty: mapped.length === 0,
    size: mapped.length,
  } as unknown as QuerySnapshot<DocumentData>
}

function collectionToCallable(collectionName: string): string {
  switch (collectionName) {
    case 'feedings':
      return 'listFeedings'
    case 'milkLots':
      return 'listMilkLots'
    case 'diapers':
      return 'listDiapers'
    case 'medicines':
      return 'listMedicines'
    case 'measurements':
      return 'listMeasurements'
    case 'notes':
      return 'listNotes'
    case 'babies':
      return 'getBabies'
    default:
      return `list${collectionName.charAt(0).toUpperCase()}${collectionName.slice(1)}`
  }
}

function extractDocs(
  collectionName: string,
  data: Record<string, unknown>,
): { id: string; data: DocumentData }[] {
  const key =
    collectionName === 'milkLots'
      ? 'lots'
      : collectionName === 'babies'
        ? 'babies'
        : collectionName
  const raw = data[key]
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const row = item as Record<string, unknown>
    const id = String(row.id ?? '')
    const { id: _id, ...rest } = row
    return { id, data: rest as DocumentData }
  })
}

async function fetchCollection(
  householdId: string,
  collectionName: string,
  sinceDays: number | null,
): Promise<QuerySnapshot<DocumentData>> {
  const name = collectionToCallable(collectionName)
  const payload: Record<string, unknown> = { householdId }
  if (sinceDays != null) payload.sinceDays = sinceDays
  const res = await invokeBackend<typeof payload, Record<string, unknown>>(name, payload)
  return fakeSnap(extractDocs(collectionName, res.data))
}

function ensureSse(householdId: string) {
  const base = getApiBase()
  if (!base) return
  const n = (sseRefCount.get(householdId) ?? 0) + 1
  sseRefCount.set(householdId, n)
  if (sse && sseHouseholdId === householdId) return

  if (sse) {
    sse.close()
    sse = null
  }
  sseHouseholdId = householdId
  const token = authHeaders().Authorization?.replace(/^Bearer\s+/i, '') ?? ''
  // EventSource cannot set Authorization headers — pass token as query param.
  const url = `${base}/api/events?householdId=${encodeURIComponent(householdId)}&access_token=${encodeURIComponent(token)}`
  const es = new EventSource(url)
  sse = es

  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as {
        householdId?: string
        collections?: string[]
      }
      if (!msg.householdId) return
      const cols = msg.collections ?? []
      for (const [key, entry] of entries) {
        if (!key.startsWith(`${msg.householdId}::`)) continue
        const col = key.split('::')[1]
        if (cols.length === 0 || (col && cols.includes(col))) {
          void entry.refresh()
        }
      }
    } catch {
      /* ignore malformed */
    }
  }
  es.onerror = () => {
    // Browser will reconnect; 401s need re-login.
    if (es.readyState === EventSource.CLOSED) {
      clearSession()
    }
  }
}

function releaseSse(householdId: string) {
  const n = (sseRefCount.get(householdId) ?? 1) - 1
  if (n <= 0) {
    sseRefCount.delete(householdId)
    if (sseHouseholdId === householdId && sse) {
      sse.close()
      sse = null
      sseHouseholdId = null
    }
  } else {
    sseRefCount.set(householdId, n)
  }
}

function docRevision(data: DocumentData, orderField: string): string {
  const ts = (field: string) => {
    const raw = data[field]
    if (raw == null) return -1
    if (typeof raw === 'string') {
      const ms = Date.parse(raw)
      return Number.isFinite(ms) ? ms : -1
    }
    if (typeof raw === 'number') return raw
    if (typeof (raw as { toMillis?: () => number }).toMillis === 'function') {
      try {
        return (raw as { toMillis: () => number }).toMillis()
      } catch {
        return -1
      }
    }
    return -1
  }
  return [
    ts(orderField),
    ts('updatedAt'),
    ts('startAt'),
    data.endAt == null ? -1 : ts('endAt'),
    ts('scheduledAt'),
    ts('changedAt'),
    ts('storedAt'),
    data.remainingOz ?? '',
    data.storage ?? '',
    data.volumeOz ?? '',
    data.note ?? '',
  ].join(':')
}

function snapshotSig(snap: QuerySnapshot<DocumentData>, orderField: string): string {
  return snap.docs.map((d) => `${d.id}:${docRevision(d.data(), orderField)}`).join('|')
}

export function subscribeApiHouseholdCollection(
  householdId: string,
  collectionName: string,
  orderByField: string,
  _limitCount: number,
  onData: DataListener,
  onError?: ErrorListener,
  sinceDays: number | null = 30,
  _remainingOzAbove: number | null = null,
): () => void {
  const key = `${householdId}::${collectionName}::${orderByField}::${sinceDays ?? 'all'}`
  let entry = entries.get(key)

  if (!entry) {
    const created: ApiEntry = {
      unsub: () => {},
      latest: null,
      lastSig: '',
      dataListeners: new Set(),
      errorListeners: new Set(),
      refresh: async () => {},
    }
    created.refresh = async () => {
      try {
        const snap = await fetchCollection(householdId, collectionName, sinceDays)
        const sig = snapshotSig(snap, orderByField)
        if (sig === created.lastSig) return
        created.lastSig = sig
        created.latest = snap
        for (const listener of created.dataListeners) listener(snap)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        for (const listener of created.errorListeners) listener(error)
      }
    }
    created.unsub = () => {
      entries.delete(key)
      releaseSse(householdId)
    }
    entries.set(key, created)
    entry = created
    ensureSse(householdId)
    void created.refresh()
  }

  entry.dataListeners.add(onData)
  if (onError) entry.errorListeners.add(onError)
  if (entry.latest) onData(entry.latest)

  return () => {
    const current = entries.get(key)
    if (!current) return
    current.dataListeners.delete(onData)
    if (onError) current.errorListeners.delete(onError)
    if (current.dataListeners.size === 0 && current.errorListeners.size === 0) {
      current.unsub()
    }
  }
}

export function destroyApiHouseholdSubscriptions(householdId?: string): void {
  for (const [key, entry] of entries) {
    if (!householdId || key.startsWith(`${householdId}::`)) {
      entry.unsub()
    }
  }
}
