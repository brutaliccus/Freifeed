import { Timestamp } from 'firebase/firestore'

const PREFIX = 'freifeed.hc.v2.'
const MAX_BYTES = 4 * 1024 * 1024

interface CacheEnvelope {
  v: 2
  savedAt: number
  items: unknown[]
}

function cacheKey(householdId: string, collectionName: string): string {
  return `${PREFIX}${householdId}.${collectionName}`
}

function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { __ts: value.toMillis() }
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toMillis?: () => number }).toMillis === 'function'
  ) {
    try {
      return { __ts: (value as { toMillis: () => number }).toMillis() }
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    return value.map(serialize)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v)
    }
    return out
  }
  return value
}

function deserialize(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && '__ts' in value) {
    const ms = Number((value as { __ts: unknown }).__ts)
    if (!Number.isFinite(ms)) return null
    try {
      return Timestamp.fromMillis(ms)
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    return value.map(deserialize)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deserialize(v)
    }
    return out
  }
  return value
}

export function readCachedCollection<T>(householdId: string, collectionName: string): T[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(householdId, collectionName))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEnvelope
    if (parsed.v !== 2 || !Array.isArray(parsed.items)) return null
    return parsed.items.map((item) => deserialize(item) as T)
  } catch {
    return null
  }
}

export function writeCachedCollection<T>(
  householdId: string,
  collectionName: string,
  items: T[],
): void {
  try {
    const envelope: CacheEnvelope = {
      v: 2,
      savedAt: Date.now(),
      items: items.map((item) => serialize(item) as unknown),
    }
    const raw = JSON.stringify(envelope)
    if (raw.length > MAX_BYTES) return
    localStorage.setItem(cacheKey(householdId, collectionName), raw)
  } catch {
    /* quota or private mode */
  }
}

export function clearHouseholdCollectionCache(householdId: string): void {
  try {
    const prefixes = [`${PREFIX}${householdId}.`, `freifeed.hc.v1.${householdId}.`]
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (prefixes.some((p) => key.startsWith(p))) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
