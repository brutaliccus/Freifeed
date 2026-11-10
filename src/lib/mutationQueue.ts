import { invokeBackend } from './apiTransport'
import { isPermanentCallableError, isTransientCallableError } from './callableRetry'
import {
  enqueueMutation,
  enqueueFailedMutation,
  flushOfflineQueue,
  isLikelyOfflineError,
  pendingCoalesceKeys,
  rewriteQueuedLotIds,
} from './offlineQueue'

export type MutationResult = { ok: true; queued: boolean }

export type RunMutationOptions = {
  /** Firebase callable / API route name. */
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

const lotIdAliases = new Map<string, string>()
let execChain: Promise<void> = Promise.resolve()

export function resolveLotIdAlias(id: string): string {
  let current = id
  const seen = new Set<string>()
  while (lotIdAliases.has(current) && !seen.has(current)) {
    seen.add(current)
    current = lotIdAliases.get(current)!
  }
  return current
}

export function rememberLotIdAlias(from: string, to: string): void {
  if (!from || !to || from === to) return
  lotIdAliases.set(from, to)
  rewriteQueuedLotIds(from, to)
}

function remapMutationPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map(remapMutationPayload)
  if (!payload || typeof payload !== 'object') return payload
  const src = payload as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(src)) {
    if ((key === 'lotId' || key === 'addToLotId') && typeof value === 'string') {
      out[key] = resolveLotIdAlias(value)
    } else if (key === 'lotIds' && Array.isArray(value)) {
      out[key] = value.map((id) => (typeof id === 'string' ? resolveLotIdAlias(id) : id))
    } else if (key === 'clientLotIds' && Array.isArray(value)) {
      out[key] = value.map((id) => (typeof id === 'string' ? resolveLotIdAlias(id) : id))
    } else if (key === 'milkDeductions' && Array.isArray(value)) {
      out[key] = value.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry
        const row = entry as Record<string, unknown>
        if (typeof row.lotId !== 'string') return entry
        return { ...row, lotId: resolveLotIdAlias(row.lotId) }
      })
    } else {
      out[key] = remapMutationPayload(value)
    }
  }
  return out
}

function enqueueSerial<T>(fn: () => Promise<T>): Promise<T> {
  const run = execChain.then(fn, fn)
  execChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export type MutationFailureReconciler = (name: string, payload: unknown) => Promise<void>
let failureReconciler: MutationFailureReconciler | null = null

export function registerMutationFailureReconciler(
  next: MutationFailureReconciler | null,
): void {
  failureReconciler = next
}

const MILK_MUTATION_NAMES = new Set([
  'createFeeding',
  'updateFeeding',
  'deleteFeeding',
  'combineMilkLots',
  'deleteMilkLot',
  'updateMilkLot',
  'transferMilkLotToFreezer',
  'transferMilkLotToFridge',
  'redistributeMilkLot',
])

function reconcileIfNeeded(name: string, payload: unknown): void {
  if (!failureReconciler || !MILK_MUTATION_NAMES.has(name)) return
  void failureReconciler(name, payload)
}


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
  const mapped = remapMutationPayload(payload)
  const res = await invokeBackend<unknown, unknown>(name, mapped)
  const data = res.data as { milkLotId?: string } | null
  if (name === 'createFeeding' && data && typeof data === 'object') {
    const sent = mapped as { clientLotIds?: string[] }
    const clientLotId = sent.clientLotIds?.[0]
    if (clientLotId && data.milkLotId) rememberLotIdAlias(clientLotId, data.milkLotId)
  }
  return data
}

export async function flushPendingMutations(): Promise<void> {
  if (flushInFlight || typeof navigator === 'undefined' || !navigator.onLine) return
  await enqueueSerial(async () => {
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
  })
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

function failureDetail(name: string, coalesceKey: string | undefined, err: unknown) {
  return {
    name,
    coalesceKey,
    message:
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: string }).message)
        : 'Sync failed',
  }
}

function recordPermanentFailure(
  name: string,
  payload: unknown,
  coalesceKey: string | undefined,
  err: unknown,
): void {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : 'Sync failed'
  enqueueFailedMutation(name, payload, message, { coalesceKey })
  reconcileIfNeeded(name, payload)
  window.dispatchEvent(
    new CustomEvent('freifeed-mutation-failed', {
      detail: failureDetail(name, coalesceKey, err),
    }),
  )
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

  const dispatch = (): Promise<MutationResult> => enqueueSerial(async () => {
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
      // Permanent: surface once in failed queue — do not retry 12 times.
      if (isPermanentCallableError(err)) {
        recordPermanentFailure(name, payload, coalesceKey, err)
      } else {
        // Unknown errors: one queued attempt via normal enqueue (flush will classify).
        enqueueMutation(name, payload, { coalesceKey })
        window.dispatchEvent(
          new CustomEvent('freifeed-mutation-failed', {
            detail: failureDetail(name, coalesceKey, err),
          }),
        )
      }
      return finishOk(true)
    } finally {
      if (coalesceKey) inFlightKeys.delete(coalesceKey)
    }
  })

  if (background) {
    void dispatch().then(() => {
      if (isOnline()) void flushPendingMutations()
    })
    return { ok: true, queued: !isOnline() }
  }

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
    if (isPermanentCallableError(err)) {
      recordPermanentFailure(name, payload, coalesceKey, err)
    } else {
      enqueueMutation(name, payload, { coalesceKey })
    }
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
