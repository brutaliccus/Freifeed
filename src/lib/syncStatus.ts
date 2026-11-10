import { useCallback, useEffect, useState } from 'react'
import { flushPendingMutations } from './mutationQueue'
import { getFailedQueueCount, getFailedQueueItems, getOfflineQueueCount } from './offlineQueue'
import { useOnlineStatus } from './networkStatus'

export { flushPendingMutations }

function humanizeOpName(name: string): string {
  // transferMilkLotToFreezer → Transfer milk lot to freezer
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
  return spaced
}

function formatFailedSummary(): string | null {
  const failed = getFailedQueueItems()
  if (failed.length === 0) return null
  const first = failed[0]!
  const op = humanizeOpName(first.name)
  const detail = first.lastError?.trim()
  if (failed.length === 1) {
    return detail ? `${op} failed: ${detail}` : `${op} failed to sync — tap Retry`
  }
  const more = failed.length - 1
  const head = detail ? `${op} failed: ${detail}` : `${op} failed`
  return `${head} (+${more} more) — tap Retry`
}

export function useSyncQueue() {
  const online = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(getOfflineQueueCount)
  const [failedCount, setFailedCount] = useState(getFailedQueueCount)
  const [failedSummary, setFailedSummary] = useState<string | null>(formatFailedSummary)

  useEffect(() => {
    const bump = () => {
      setPendingCount(getOfflineQueueCount())
      setFailedCount(getFailedQueueCount())
      setFailedSummary(formatFailedSummary())
    }
    window.addEventListener('freifeed-offline-queue-changed', bump)
    window.addEventListener('freifeed-pending-mutations-changed', bump)
    window.addEventListener('freifeed-mutation-failed', bump)
    return () => {
      window.removeEventListener('freifeed-offline-queue-changed', bump)
      window.removeEventListener('freifeed-pending-mutations-changed', bump)
      window.removeEventListener('freifeed-mutation-failed', bump)
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

  return { online, pendingCount, failedCount, failedSummary, flush: flushPendingMutations }
}

export function useSyncStatus(errors: (string | null | undefined)[]) {
  const { online, pendingCount, failedCount, failedSummary, flush } = useSyncQueue()
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
            ? failedSummary ??
              `${failedCount} change${failedCount === 1 ? '' : 's'} failed to sync — tap Retry`
            : activeErrors[0]
          : null

  const retry = useCallback(async () => {
    await flush()
  }, [flush])

  return { status, message, online, pendingCount, retry }
}
