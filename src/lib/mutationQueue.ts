import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { withCallableRetry, isTransientCallableError } from './callableRetry'
import {
  enqueueMutation,
  flushOfflineQueue,
  isLikelyOfflineError,
  pendingCoalesceKeys,
} from './offlineQueue'

export type MutationResult = { ok: true; queued: boolean }

export type RunMutationOptions = {
  /** Firebase callable name. */
  name: string
  payload: unknown
  /** Replace any prior queued item with this key. */
  coalesceKey?: string
  /** Apply local state before returning to the UI (sync). */
  optimistic?: () => void
  /**
   * When true (default), do not await the network call — fire in background.
   * Callers get `{ ok: true, queued }` immediately after optimistic apply.
   */
  background?: boolean
}

let flushInFlight = false
const inFlightKeys = new Set<string>()

/** Entity keys with a local optimistic write not yet confirmed by server/queue flush. */
const pendingMeta = new Map<string, number>()

function bumpPending(coalesceKey: string | undefined) {
  if (!coalesceKey) return
  pendingMeta.set(coalesceKey, Date.now())
  window.dispatchEvent(new CustomEvent('freifeed-pending-mutations-changed'))
}

function clearPending(coalesceKey: string | undefined) {
  if (!coalesceKey) return
  pendingMeta.delete(coalesceKey)
  window.dispatchEvent(new CustomEvent('freifeed-pending-mutations-changed'))
}

export function isMutationPending(coalesceKey: string): boolean {
  if (pendingMeta.has(coalesceKey)) return true
  if (inFlightKeys.has(coalesceKey)) return true
  return pendingCoalesceKeys().has(coalesceKey)
}

export function getPendingMutationKeys(): Set<string> {
  const keys = pendingCoalesceKeys()
  for (const k of pendingMeta.keys()) keys.add(k)
  for (const k of inFlightKeys) keys.add(k)
  return keys
}

export function subscribePendingMutations(listener: () => void): () => void {
  const handler = () => listener()
  window.addEventListener('freifeed-pending-mutations-changed', handler)
  window.addEventListener('freifeed-offline-queue-changed', handler)
  return () => {
    window.removeEventListener('freifeed-pending-mutations-changed', handler)
    window.removeEventListener('freifeed-offline-queue-changed', handler)
  }
}

async function executeCallable(name: string, payload: unknown): Promise<unknown> {
  return withCallableRetry(async () => {
    const fn = httpsCallable(functions, name)
    const res = await fn(payload as Record<string, unknown>)
    return res.data
  })
}

export async function flushPendingMutations(): Promise<void> {
  if (flushInFlight || typeof navigator === 'undefined' || !navigator.onLine) return
  flushInFlight = true
  try {
    await flushOfflineQueue(executeCallable)
  } finally {
    flushInFlight = false
    // Drop pending meta for keys no longer queued/in-flight.
    const live = getPendingMutationKeys()
    for (const key of [...pendingMeta.keys()]) {
      if (!live.has(key) && !pendingCoalesceKeys().has(key) && !inFlightKeys.has(key)) {
        pendingMeta.delete(key)
      }
    }
    window.dispatchEvent(new CustomEvent('freifeed-offline-queue-changed'))
    window.dispatchEvent(new CustomEvent('freifeed-pending-mutations-changed'))
  }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

/**
 * Apply optimistic local state, then sync in the background (or enqueue if offline).
 * Resolves as soon as local work is done — callers should not await the network.
 */
export function runMutation(options: RunMutationOptions): MutationResult {
  const { name, payload, coalesceKey, optimistic, background = true } = options

  try {
    optimistic?.()
  } catch (err) {
    console.warn('Optimistic apply failed', err)
    throw err
  }

  bumpPending(coalesceKey)

  const finishOk = (queued: boolean): MutationResult => {
    if (!queued) clearPending(coalesceKey)
    return { ok: true, queued }
  }

  const dispatch = async (): Promise<MutationResult> => {
    if (!isOnline()) {
      enqueueMutation(name, payload, { coalesceKey })
      return finishOk(true)
    }

    if (coalesceKey) inFlightKeys.add(coalesceKey)
    try {
      await executeCallable(name, payload)
      clearPending(coalesceKey)
      return { ok: true, queued: false }
    } catch (err) {
      if (isLikelyOfflineError(err) || isTransientCallableError(err)) {
        enqueueMutation(name, payload, { coalesceKey })
        return finishOk(true)
      }
      clearPending(coalesceKey)
      console.warn(`Mutation ${name} failed permanently`, err)
      window.dispatchEvent(
        new CustomEvent('freifeed-mutation-failed', {
          detail: {
            name,
            coalesceKey,
            message:
              err && typeof err === 'object' && 'message' in err
                ? String((err as { message: string }).message)
                : 'Sync failed',
          },
        }),
      )
      // Still resolve ok for UI — local optimistic state stays; user can retry via banner.
      enqueueMutation(name, payload, { coalesceKey })
      return finishOk(true)
    } finally {
      if (coalesceKey) inFlightKeys.delete(coalesceKey)
    }
  }

  if (background) {
    void dispatch().then(() => {
      if (isOnline()) void flushPendingMutations()
    })
    return { ok: true, queued: !isOnline() }
  }

  // Synchronous path (rare): still returns a promise-shaped result via blocking — not used by UI.
  void dispatch()
  return { ok: true, queued: !isOnline() }
}

/** Awaitable variant when a caller truly needs to know queue vs ack (tests / rare paths). */
export async function runMutationAsync(options: RunMutationOptions): Promise<MutationResult> {
  const { name, payload, coalesceKey, optimistic } = options
  try {
    optimistic?.()
  } catch (err) {
    throw err
  }
  bumpPending(coalesceKey)

  if (!isOnline()) {
    enqueueMutation(name, payload, { coalesceKey })
    return { ok: true, queued: true }
  }

  if (coalesceKey) inFlightKeys.add(coalesceKey)
  try {
    await executeCallable(name, payload)
    clearPending(coalesceKey)
    return { ok: true, queued: false }
  } catch (err) {
    if (isLikelyOfflineError(err) || isTransientCallableError(err)) {
      enqueueMutation(name, payload, { coalesceKey })
      return { ok: true, queued: true }
    }
    enqueueMutation(name, payload, { coalesceKey })
    return { ok: true, queued: true }
  } finally {
    if (coalesceKey) inFlightKeys.delete(coalesceKey)
  }
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
