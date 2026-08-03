const QUEUE_KEY = 'freifeed_offline_queue_v1'
const MAX_RETRIES = 12

export interface QueuedMutation {
  id: string
  name: string
  payload: unknown
  createdAt: number
  retries: number
  /** When set, a newer enqueue with the same key replaces this item. */
  coalesceKey?: string
  lastError?: string
}

function readQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueuedMutation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(items: QueuedMutation[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch {
    /* quota — best effort */
  }
  window.dispatchEvent(new CustomEvent('freifeed-offline-queue-changed'))
}

export function getOfflineQueue(): QueuedMutation[] {
  return readQueue()
}

export function getOfflineQueueCount(): number {
  return readQueue().filter((q) => q.retries < MAX_RETRIES).length
}

export function getFailedQueueCount(): number {
  return readQueue().filter((q) => q.retries >= MAX_RETRIES).length
}

export function enqueueMutation(
  name: string,
  payload: unknown,
  options?: { coalesceKey?: string },
): QueuedMutation {
  const coalesceKey = options?.coalesceKey
  let queue = readQueue()
  if (coalesceKey) {
    queue = queue.filter((q) => q.coalesceKey !== coalesceKey)
  }
  const item: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    payload,
    createdAt: Date.now(),
    retries: 0,
    coalesceKey,
  }
  writeQueue([...queue, item])
  return item
}

export function removeFromQueue(id: string): void {
  writeQueue(readQueue().filter((q) => q.id !== id))
}

export function hasPendingForCoalesceKey(coalesceKey: string): boolean {
  return readQueue().some((q) => q.coalesceKey === coalesceKey && q.retries < MAX_RETRIES)
}

export function pendingCoalesceKeys(): Set<string> {
  return new Set(
    readQueue()
      .filter((q) => q.coalesceKey && q.retries < MAX_RETRIES)
      .map((q) => q.coalesceKey!),
  )
}

export function isLikelyOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: string }).code)
      : ''
  return (
    code === 'functions/unavailable' ||
    code === 'functions/deadline-exceeded' ||
    code === 'functions/internal' ||
    code === 'functions/cancelled' ||
    code === 'functions/resource-exhausted' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded'
  )
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message)
  }
  return 'Sync failed'
}

export type CallableExecutor = (name: string, payload: unknown) => Promise<unknown>

export async function flushOfflineQueue(execute: CallableExecutor): Promise<{
  flushed: number
  failed: number
}> {
  let flushed = 0
  let failed = 0
  const queue = readQueue().filter((q) => q.retries < MAX_RETRIES)
  for (const item of queue) {
    // Re-read in case a coalesced replace removed this id.
    if (!readQueue().some((q) => q.id === item.id)) continue
    try {
      await execute(item.name, item.payload)
      removeFromQueue(item.id)
      flushed++
    } catch (err) {
      failed++
      const nextRetries = item.retries + 1
      const next = readQueue().map((q) =>
        q.id === item.id
          ? { ...q, retries: nextRetries, lastError: errorMessage(err) }
          : q,
      )
      writeQueue(next)
      // Offline / transient: stop this flush pass (likely more will fail).
      if (isLikelyOfflineError(err)) break
      // Permanent error: keep going so other mutations can sync.
    }
  }
  return { flushed, failed }
}

export const OFFLINE_QUEUE_MAX_RETRIES = MAX_RETRIES
