import { useCallback, useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import {
  flushOfflineQueue,
  getOfflineQueueCount,
  enqueueMutation,
  isLikelyOfflineError,
} from './offlineQueue'
import { useOnlineStatus } from './networkStatus'

let flushInFlight = false

async function executeCallable(name: string, payload: unknown): Promise<unknown> {
  const fn = httpsCallable(functions, name)
  const res = await fn(payload as Record<string, unknown>)
  return res.data
}

export async function flushPendingMutations(): Promise<void> {
  if (flushInFlight || typeof navigator === 'undefined' || !navigator.onLine) return
  flushInFlight = true
  try {
    await flushOfflineQueue(executeCallable)
  } finally {
    flushInFlight = false
    window.dispatchEvent(new CustomEvent('freifeed-offline-queue-changed'))
  }
}

export function useSyncQueue() {
  const online = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(getOfflineQueueCount)

  useEffect(() => {
    const bump = () => setPendingCount(getOfflineQueueCount())
    window.addEventListener('freifeed-offline-queue-changed', bump)
    return () => window.removeEventListener('freifeed-offline-queue-changed', bump)
  }, [])

  useEffect(() => {
    if (online && pendingCount > 0) void flushPendingMutations()
  }, [online, pendingCount])

  return { online, pendingCount, flush: flushPendingMutations }
}

export function wrapCallable<TReq, TRes>(
  name: string,
  invoke: (payload: TReq) => Promise<TRes>,
  options?: { queueOnFailure?: boolean },
): (payload: TReq) => Promise<TRes> {
  const queueOnFailure = options?.queueOnFailure !== false
  return async (payload: TReq) => {
    try {
      return await invoke(payload)
    } catch (err) {
      if (queueOnFailure && isLikelyOfflineError(err)) {
        enqueueMutation(name, payload)
      }
      throw err
    }
  }
}

export function useSyncStatus(errors: (string | null | undefined)[]) {
  const { online, pendingCount, flush } = useSyncQueue()
  const activeErrors = errors.filter(Boolean) as string[]

  const status: 'ok' | 'offline' | 'pending' | 'error' =
    !online
      ? 'offline'
      : pendingCount > 0
        ? 'pending'
        : activeErrors.length > 0
          ? 'error'
          : 'ok'

  const message =
    status === 'offline'
      ? 'Offline — changes will sync when you reconnect'
      : status === 'pending'
        ? `Syncing ${pendingCount} pending change${pendingCount === 1 ? '' : 's'}…`
        : status === 'error'
          ? activeErrors[0]
          : null

  const retry = useCallback(async () => {
    await flush()
  }, [flush])

  return { status, message, online, pendingCount, retry }
}
