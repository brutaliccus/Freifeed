import { useCallback, useEffect, useState } from 'react'
import { flushPendingMutations } from './mutationQueue'
import { getFailedQueueCount, getOfflineQueueCount } from './offlineQueue'
import { useOnlineStatus } from './networkStatus'

export { flushPendingMutations }

export function useSyncQueue() {
  const online = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(getOfflineQueueCount)
  const [failedCount, setFailedCount] = useState(getFailedQueueCount)

  useEffect(() => {
    const bump = () => {
      setPendingCount(getOfflineQueueCount())
      setFailedCount(getFailedQueueCount())
    }
    window.addEventListener('freifeed-offline-queue-changed', bump)
    window.addEventListener('freifeed-pending-mutations-changed', bump)
    return () => {
      window.removeEventListener('freifeed-offline-queue-changed', bump)
      window.removeEventListener('freifeed-pending-mutations-changed', bump)
    }
  }, [])

  useEffect(() => {
    if (online && pendingCount > 0) void flushPendingMutations()
  }, [online, pendingCount])

  // Periodic flush while there are pending items (covers missed online events).
  useEffect(() => {
    if (!online || pendingCount <= 0) return
    const interval = window.setInterval(() => void flushPendingMutations(), 15_000)
    return () => window.clearInterval(interval)
  }, [online, pendingCount])

  return { online, pendingCount, failedCount, flush: flushPendingMutations }
}

export function useSyncStatus(errors: (string | null | undefined)[]) {
  const { online, pendingCount, failedCount, flush } = useSyncQueue()
  const activeErrors = errors.filter(Boolean) as string[]

  const status: 'ok' | 'offline' | 'pending' | 'error' =
    !online
      ? 'offline'
      : pendingCount > 0
        ? 'pending'
        : failedCount > 0 || activeErrors.length > 0
          ? 'error'
          : 'ok'

  const message =
    status === 'offline'
      ? 'Offline — changes will sync when you reconnect'
      : status === 'pending'
        ? `Syncing ${pendingCount} pending change${pendingCount === 1 ? '' : 's'}…`
        : status === 'error'
          ? failedCount > 0
            ? `${failedCount} change${failedCount === 1 ? '' : 's'} failed to sync — tap Retry`
            : activeErrors[0]
          : null

  const retry = useCallback(async () => {
    await flush()
  }, [flush])

  return { status, message, online, pendingCount, retry }
}
