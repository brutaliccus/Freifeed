const QUEUE_KEY = 'freifeed_offline_queue_v1'

export interface QueuedMutation {
  id: string
  name: string
  payload: unknown
  createdAt: number
  retries: number
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
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
}

export function getOfflineQueue(): QueuedMutation[] {
  return readQueue()
}

export function getOfflineQueueCount(): number {
  return readQueue().length
}

export function enqueueMutation(name: string, payload: unknown): QueuedMutation {
  const item: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    payload,
    createdAt: Date.now(),
    retries: 0,
  }
  writeQueue([...readQueue(), item])
  window.dispatchEvent(new CustomEvent('freifeed-offline-queue-changed'))
  return item
}

export function removeFromQueue(id: string): void {
  writeQueue(readQueue().filter((q) => q.id !== id))
  window.dispatchEvent(new CustomEvent('freifeed-offline-queue-changed'))
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
    code === 'unavailable' ||
    code === 'deadline-exceeded'
  )
}

export type CallableExecutor = (name: string, payload: unknown) => Promise<unknown>

export async function flushOfflineQueue(execute: CallableExecutor): Promise<{
  flushed: number
  failed: number
}> {
  let flushed = 0
  let failed = 0
  const queue = readQueue()
  for (const item of queue) {
    try {
      await execute(item.name, item.payload)
      removeFromQueue(item.id)
      flushed++
    } catch (err) {
      failed++
      const next = readQueue().map((q) =>
        q.id === item.id ? { ...q, retries: q.retries + 1 } : q,
      )
      writeQueue(next)
      if (!isLikelyOfflineError(err)) break
    }
  }
  return { flushed, failed }
}
