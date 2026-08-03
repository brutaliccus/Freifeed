import { isAndroidNative } from './platform'
import { isSessionInProgress, sessionElapsedSeconds, type ActiveFeedDraft } from './activeFeedSession'
import { normalizeFeedStartIso } from './feedNotifications'
import { isFeedingOwnedByThisDevice } from './feedOwnership'
import {
  getNursingSessionReminderEnabled,
  getNursingSessionReminderThresholdMs,
} from './nursingSessionReminderSettings'
import { hasNursingSessionReminderBeenAlerted } from './nursingSessionReminderState'
import {
  getInProgressFeedings,
  isFeedingInProgress,
} from './feedingProgress'
import { timestampToDate } from './time'
import type { Baby, Feeding } from '../types'
import { resolveBaby } from '../types'

export type NursingSessionReminderItem = {
  sessionKey: string
  babyId: string
  babyName: string
  startAtIso: string
  side: string | null
}

export type NursingSessionReminderSyncPayload = {
  enabled: boolean
  thresholdMs: number
  sessions: NursingSessionReminderItem[]
  alertedKeys: string[]
}

function nursingOnlyInProgress(feedings: Feeding[]): Feeding[] {
  return getInProgressFeedings(feedings).filter((f) => (f.type ?? 'nursing') === 'nursing')
}

export function buildNursingSessionReminderPayload(
  feedings: Feeding[],
  babies: Baby[],
  localSessions: ActiveFeedDraft[],
  /**
   * On Android, partner sessions are armed natively via FCM/FeedWatch.
   * Web sync should only track this device's sessions so a brief empty list
   * cannot cancel partner alarms.
   */
  opts: { ownedOnly?: boolean } = {},
): NursingSessionReminderSyncPayload {
  const enabled = getNursingSessionReminderEnabled()
  const thresholdMs = getNursingSessionReminderThresholdMs()
  const items: NursingSessionReminderItem[] = []
  const seen = new Set<string>()
  const ownedOnly = opts.ownedOnly === true

  for (const f of nursingOnlyInProgress(feedings)) {
    if (ownedOnly && !isFeedingOwnedByThisDevice(f.id)) continue
    const start = timestampToDate(f.startAt)
    if (!start) continue
    const baby = resolveBaby(babies, f.babyId)
    const name = typeof baby === 'string' ? 'Baby' : baby.name
    const startAtIso = normalizeFeedStartIso(start.toISOString())
    const sessionKey = `${f.babyId}:${startAtIso}`
    items.push({
      sessionKey,
      babyId: f.babyId,
      babyName: name,
      startAtIso,
      side: f.side === 'left' ? 'Left' : f.side === 'right' ? 'Right' : null,
    })
    seen.add(f.id)
  }

  for (const s of localSessions) {
    if (s.kind !== 'nursing' || !isSessionInProgress(s)) continue
    if (!s.timerStartedAt) continue
    if (s.feedingId && seen.has(s.feedingId)) continue
    const baby = resolveBaby(babies, s.babyId)
    const name = typeof baby === 'string' ? 'Baby' : baby.name
    const startAtIso = normalizeFeedStartIso(s.timerStartedAt)
    items.push({
      sessionKey: `${s.babyId}:${startAtIso}`,
      babyId: s.babyId,
      babyName: name,
      startAtIso,
      side: s.side === 'left' ? 'Left' : s.side === 'right' ? 'Right' : null,
    })
  }

  return {
    enabled,
    thresholdMs,
    sessions: items,
    alertedKeys: items
      .map((s) => s.sessionKey)
      .filter((key) => hasNursingSessionReminderBeenAlerted(key)),
  }
}

export function sessionElapsedMs(startAtIso: string): number {
  const ms = new Date(startAtIso).getTime()
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Date.now() - ms)
}

export function localSessionElapsedMs(session: ActiveFeedDraft): number {
  return sessionElapsedSeconds(session) * 1000
}

export function feedingSessionStartIso(feeding: Feeding): string | null {
  const start = timestampToDate(feeding.startAt)
  if (!start || !isFeedingInProgress(feeding)) return null
  if ((feeding.type ?? 'nursing') !== 'nursing') return null
  return normalizeFeedStartIso(start.toISOString())
}

export async function syncNursingSessionRemindersToServiceWorker(
  payload: NursingSessionReminderSyncPayload | null,
): Promise<void> {
  if (isAndroidNative() || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const msg =
      payload && payload.enabled
        ? ({ type: 'SYNC_NURSING_SESSION_REMINDERS' as const, ...payload })
        : ({ type: 'CLEAR_NURSING_SESSION_REMINDERS' as const })
    const target = navigator.serviceWorker.controller ?? reg.active
    target?.postMessage(msg)
  } catch {
    /* SW not registered yet */
  }
}
