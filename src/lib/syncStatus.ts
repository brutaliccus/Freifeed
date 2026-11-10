import { useCallback, useEffect, useState } from 'react'
import { flushPendingMutations } from './mutationQueue'
import {
  describeQueuedMutation,
  discardFailedMutations,
  getFailedQueueCount,
  getFailedQueueItems,
  getOfflineQueueCount,
  requeueFailedMutations,
  type QueuedMutation,
} from './offlineQueue'
import { useOnlineStatus } from './networkStatus'

export { flushPendingMutations }

export type FailedSyncItem = {
  id: string
  name: string
  description: string
  lastError?: string
}

export function describeFailedItems(items: QueuedMutation[] = getFailedQueueItems()): FailedSyncItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    description: describeQueuedMutation(item),
    lastError: item.lastError,
  }))
}

function formatFailedSummary(): string | null {
  const failed = getFailedQueueItems()
  if (failed.length === 0) return null
  const descriptions = failed.map((item) => describeQueuedMutation(item))
  const head = descriptions[0] ?? 'A change'
  const detail = failed[0]?.lastError?.trim()
  const more = failed.length - 1
  const base = detail ? `${head} failed: ${detail}` : `${head} failed`
  if (more === 0) {
    return `${base}. Retry to send it again, or dismiss if it already looks right.`
  }
  return `${base} (+${more} more: ${descriptions.slice(1).join(', ')}). Retry to send them again, or dismiss if inventory already looks right.`
}

export function useSyncQueue() {
  const online = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(getOfflineQueueCount)
  const [failedCount, setFailedCount] = useState(getFailedQueueCount)
  const [failedSummary, setFailedSummary] = useState<string | null>(formatFailedSummary)
  const [failedItems, setFailedItems] = useState(describeFailedItems)

  useEffect(() => {
    const bump = () => {
      setPendingCount(getOfflineQueueCount())
      setFailedCount(getFailedQueueCount())
      setFailedSummary(formatFailedSummary())
      setFailedItems(describeFailedItems())
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

  return { online, pendingCount, failedCount, failedSummary, failedItems, flush: flushPendingMutations }
}

export function useSyncStatus(errors: (string | null | undefined)[]) {
  const { online, pendingCount, failedCount, failedSummary, failedItems, flush } = useSyncQueue()
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
    requeueFailedMutations()
    await flush()
  }, [flush])

  const discardFailed = useCallback(() => {
    discardFailedMutations()
  }, [])

  return { status, message, online, pendingCount, retry, discardFailed, failedItems }
}
