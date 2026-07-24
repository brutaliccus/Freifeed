import { isAndroidNative, isNativeCapacitor } from './platform'
import { isSessionInProgress, type ActiveFeedDraft } from './activeFeedSession'
import { getInProgressFeedings } from './feedingProgress'
import { timestampToDate } from './time'
import type { Baby, Feeding } from '../types'
import { resolveBaby } from '../types'

const ENABLED_KEY = 'freifeed-notifications-enabled'

export type FeedNotificationItem = {
  id: string
  babyId: string
  babyName: string
  side: string | null
  startAtIso: string
}

/** Floor to whole seconds so local vs Firestore timestamps share one session key. */
export function normalizeFeedStartIso(iso: string): string {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return iso
  return new Date(Math.floor(ms / 1000) * 1000).toISOString()
}

export function areFeedNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setFeedNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false')
  if (!enabled) {
    void import('./notificationPlatform').then((m) => m.clearFeedTimersWhenDisabled())
  }
}

export function buildFeedNotificationPayload(
  feedings: Feeding[],
  babies: Baby[],
  localSessions: ActiveFeedDraft[],
): FeedNotificationItem[] {
  const items: FeedNotificationItem[] = []
  const seen = new Set<string>()

  for (const f of getInProgressFeedings(feedings)) {
    const start = timestampToDate(f.startAt)
    if (!start) continue
    const baby = resolveBaby(babies, f.babyId)
    const name = typeof baby === 'string' ? 'Baby' : baby.name
    items.push({
      id: f.id,
      babyId: f.babyId,
      babyName: name,
      side: f.side === 'left' ? 'Left' : f.side === 'right' ? 'Right' : null,
      startAtIso: normalizeFeedStartIso(start.toISOString()),
    })
    seen.add(f.id)
  }

  for (const s of localSessions) {
    if (!isSessionInProgress(s) || !s.timerStartedAt) continue
    if (s.feedingId && seen.has(s.feedingId)) continue
    const baby = resolveBaby(babies, s.babyId)
    const name = typeof baby === 'string' ? 'Baby' : baby.name
    items.push({
      id: s.feedingId ?? `local-${s.sessionId}`,
      babyId: s.babyId,
      babyName: name,
      side: s.side === 'left' ? 'Left' : s.side === 'right' ? 'Right' : null,
      startAtIso: normalizeFeedStartIso(s.timerStartedAt),
    })
  }

  return items
}

export function notificationsSupported(): boolean {
  if (isAndroidNative()) return true
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

function mapNativeDisplayPermission(
  display: string | undefined,
): NotificationPermission | 'unsupported' {
  if (display === 'granted') return 'granted'
  if (display === 'denied') return 'denied'
  if (display === 'prompt' || display === 'prompt-with-rationale') return 'default'
  return 'unsupported'
}

/** Current permission only (does not show the system prompt). */
export async function getNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (isAndroidNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const status = await LocalNotifications.checkPermissions()
      return mapNativeDisplayPermission(status.display)
    } catch {
      return 'unsupported'
    }
  }
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (isAndroidNative()) {
    const current = await getNotificationPermission()
    if (current === 'granted' || current === 'denied') return current
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const req = await LocalNotifications.requestPermissions()
      return mapNativeDisplayPermission(req.display)
    } catch {
      return 'unsupported'
    }
  }
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

export async function syncFeedNotificationsToServiceWorker(feeds: FeedNotificationItem[]): Promise<void> {
  if (isNativeCapacitor() || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const msg = feeds.length > 0 ? { type: 'SYNC_FEEDS' as const, feeds } : { type: 'CLEAR_FEEDS' as const }
    const target = navigator.serviceWorker.controller ?? reg.active
    target?.postMessage(msg)
  } catch {
    /* SW not registered yet */
  }
}

/** Nudge the SW to refresh in-progress notification timers (SW sleeps on mobile without this). */
export async function pingFeedNotificationTick(): Promise<void> {
  if (isNativeCapacitor() || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const target = navigator.serviceWorker.controller ?? reg.active
    target?.postMessage({ type: 'TICK_FEEDS' as const })
  } catch {
    /* SW not registered yet */
  }
}
