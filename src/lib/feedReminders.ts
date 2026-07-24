import { isAndroidNative } from './platform'
import { isSessionInProgress, type ActiveFeedDraft } from './activeFeedSession'
import { getInProgressFeedings } from './feedingProgress'
import {
  getFeedReminderSnoozeMinutes,
  getFeedReminderTrackingForSync,
  markFeedReminderDismissed,
  markFeedReminderAlerted,
  markFeedReminderSnoozed,
} from './feedReminderState'
import { combineDateAndTime, parseDayLocal, timestampToDate } from './time'
import type { Baby, BabyId, Feeding } from '../types'

const ENABLED_KEY = 'freifeed-feed-reminder-enabled'
const HOURS_KEY = 'freifeed-feed-reminder-hours'
const MINUTES_KEY = 'freifeed-feed-reminder-minutes'

export type FeedReminderSettings = {
  enabled: boolean
  hours: number
  minutes: number
}

export type BabyReminderState = {
  id: string
  name: string
  lastStartIso: string | null
}

export type FeedReminderSyncPayload = {
  enabled: boolean
  thresholdMs: number
  snoozeMinutes: number
  babies: BabyReminderState[]
  /** Babies with a nursing/bottle session in progress — suppress "hasn't fed" reminders. */
  feedingInProgressBabyIds: BabyId[]
  tracking: Record<string, { alerted?: boolean; dismissed?: boolean; snoozeUntilIso?: string | null }>
}

export function getFeedReminderSettings(): FeedReminderSettings {
  try {
    const enabled = localStorage.getItem(ENABLED_KEY) === 'true'
    const hours = clampHours(Number(localStorage.getItem(HOURS_KEY) ?? 2))
    const minutes = clampMinutes(Number(localStorage.getItem(MINUTES_KEY) ?? 0))
    return { enabled, hours, minutes }
  } catch {
    return { enabled: false, hours: 2, minutes: 0 }
  }
}

export function feedReminderThresholdMs(settings: FeedReminderSettings): number {
  return (settings.hours * 60 + settings.minutes) * 60_000
}

export function setFeedReminderEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false')
  if (!enabled) void syncFeedRemindersToServiceWorker(null)
}

export function setFeedReminderInterval(hours: number, minutes: number): void {
  localStorage.setItem(HOURS_KEY, String(clampHours(hours)))
  localStorage.setItem(MINUTES_KEY, String(clampMinutes(minutes)))
}

function clampHours(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(48, Math.floor(value))
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(59, Math.floor(value))
}

export function isFeedReminderIntervalValid(settings: FeedReminderSettings): boolean {
  return settings.hours * 60 + settings.minutes > 0
}

function feedingStartTime(feeding: Feeding): Date | null {
  return (
    timestampToDate(feeding.startAt) ??
    timestampToDate(feeding.endAt) ??
    timestampToDate(feeding.createdAt)
  )
}

const REMINDER_FEED_TYPES = new Set<Feeding['type']>(['nursing', 'bottle'])

function countsForFeedReminder(type: Feeding['type'] | undefined): boolean {
  return REMINDER_FEED_TYPES.has(type ?? 'nursing')
}

/** Most recent nursing or bottle feed start for a baby. */
function lastFeedStartForBaby(
  feedings: Feeding[],
  babyId: BabyId,
  localSessions: ActiveFeedDraft[],
): Date | null {
  let latest: Date | null = null

  const consider = (date: Date | null | undefined) => {
    if (date && !Number.isNaN(date.getTime()) && (!latest || date > latest)) {
      latest = date
    }
  }

  for (const session of localSessions) {
    if (session.babyId !== babyId || !isSessionInProgress(session)) continue
    if (session.kind === 'bottle') {
      if (session.startTime) {
        consider(combineDateAndTime(parseDayLocal(session.defaultDate), session.startTime))
      }
      continue
    }
    if (session.kind !== 'nursing') continue
    if (session.timerStartedAt) {
      consider(new Date(session.timerStartedAt))
      continue
    }
    if (session.startTime) {
      consider(combineDateAndTime(parseDayLocal(session.defaultDate), session.startTime))
    }
  }

  for (const feeding of feedings) {
    if (feeding.babyId !== babyId) continue
    if (!countsForFeedReminder(feeding.type)) continue
    consider(feedingStartTime(feeding))
  }

  return latest
}

export function buildFeedReminderPayload(
  feedings: Feeding[],
  babies: Baby[],
  localSessions: ActiveFeedDraft[],
): FeedReminderSyncPayload {
  const settings = getFeedReminderSettings()
  const thresholdMs = feedReminderThresholdMs(settings)
  const enabled = settings.enabled && isFeedReminderIntervalValid(settings)

  const babyStates: BabyReminderState[] = babies.map((baby) => {
    const id = baby.id
    const name = baby.name || 'Baby'
    const lastStart = lastFeedStartForBaby(feedings, id, localSessions)
    const lastStartIso = lastStart?.toISOString() ?? null
    return {
      id,
      name,
      lastStartIso,
    }
  })

  const feedingInProgressBabyIds = new Set<BabyId>()
  for (const f of getInProgressFeedings(feedings)) {
    feedingInProgressBabyIds.add(f.babyId)
  }
  for (const session of localSessions) {
    if (!isSessionInProgress(session)) continue
    if (session.kind === 'nursing' || session.kind === 'bottle') {
      feedingInProgressBabyIds.add(session.babyId)
    }
  }

  return {
    enabled,
    thresholdMs,
    snoozeMinutes: getFeedReminderSnoozeMinutes(),
    babies: babyStates,
    feedingInProgressBabyIds: [...feedingInProgressBabyIds],
    tracking: getFeedReminderTrackingForSync(),
  }
}

export function applyFeedReminderDismiss(babyId: string, lastStartIso: string): void {
  markFeedReminderDismissed(babyId, lastStartIso)
}

export function applyFeedReminderSnooze(babyId: string, lastStartIso: string): void {
  markFeedReminderSnoozed(babyId, lastStartIso)
}

export function applyFeedReminderAlerted(babyId: string, lastStartIso: string): void {
  markFeedReminderAlerted(babyId, lastStartIso)
}

export async function syncFeedRemindersToServiceWorker(
  payload: FeedReminderSyncPayload | null,
): Promise<void> {
  if (isAndroidNative() || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const msg =
      payload && payload.enabled
        ? ({ type: 'SYNC_REMINDERS' as const, ...payload })
        : ({ type: 'CLEAR_REMINDERS' as const })
    const target = navigator.serviceWorker.controller ?? reg.active
    target?.postMessage(msg)
  } catch {
    /* SW not registered yet */
  }
}
