import { normalizeFeedStartIso } from './feedNotifications'

const SNOOZE_MINUTES_KEY = 'freifeed-feed-reminder-snooze-minutes'
const TRACKING_KEY = 'freifeed-feed-reminder-tracking'

type SessionReminderState = {
  alerted?: boolean
  dismissed?: boolean
  snoozeUntilIso?: string | null
}

type TrackingStore = Record<string, SessionReminderState>

export function getFeedReminderSnoozeMinutes(): number {
  try {
    const raw = Number(localStorage.getItem(SNOOZE_MINUTES_KEY) ?? 15)
    if (!Number.isFinite(raw)) return 15
    const stepped = Math.round(raw / 5) * 5
    return Math.min(60, Math.max(5, stepped))
  } catch {
    return 15
  }
}

export function setFeedReminderSnoozeMinutes(minutes: number): void {
  const stepped = Math.round(minutes / 5) * 5
  const clamped = Math.min(60, Math.max(5, stepped))
  localStorage.setItem(SNOOZE_MINUTES_KEY, String(clamped))
  window.dispatchEvent(new Event('freifeed-reminder-state-changed'))
}

/** Shared by web app, service worker, and native sync — must stay in sync with Android lookup. */
export function feedReminderTrackingKey(babyId: string, lastStartIso: string): string {
  return `${babyId}:${normalizeFeedStartIso(lastStartIso)}`
}

function trackingKey(babyId: string, lastStartIso: string): string {
  return feedReminderTrackingKey(babyId, lastStartIso)
}

function loadTracking(): TrackingStore {
  try {
    const raw = localStorage.getItem(TRACKING_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as TrackingStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveTracking(store: TrackingStore): void {
  localStorage.setItem(TRACKING_KEY, JSON.stringify(store))
  window.dispatchEvent(new Event('freifeed-reminder-state-changed'))
}

/** @deprecated Keys are per-session; new feeds get a fresh key automatically. */
export function pruneReminderTracking(_babyId: string, _lastStartIso: string | null): void {
  /* no-op */
}

export function shouldShowFeedReminderAlert(
  babyId: string,
  lastStartIso: string,
  thresholdMs: number,
): boolean {
  const elapsed = Date.now() - new Date(lastStartIso).getTime()
  if (Number.isNaN(elapsed) || elapsed < thresholdMs) return false

  const row = loadTracking()[trackingKey(babyId, lastStartIso)] ?? {}
  if (row.snoozeUntilIso) {
    const snoozeUntil = new Date(row.snoozeUntilIso).getTime()
    if (!Number.isNaN(snoozeUntil) && snoozeUntil > Date.now()) return false
  }
  if (row.dismissed) return false
  if (row.alerted) return false
  return true
}

export function markFeedReminderAlerted(babyId: string, lastStartIso: string): void {
  const key = trackingKey(babyId, lastStartIso)
  const store = loadTracking()
  store[key] = { ...store[key], alerted: true }
  saveTracking(store)
}

export function markFeedReminderDismissed(babyId: string, lastStartIso: string): void {
  const key = trackingKey(babyId, lastStartIso)
  const store = loadTracking()
  store[key] = { ...store[key], dismissed: true, snoozeUntilIso: null }
  saveTracking(store)
}

export function markFeedReminderSnoozed(babyId: string, lastStartIso: string): number {
  const minutes = getFeedReminderSnoozeMinutes()
  const until = new Date(Date.now() + minutes * 60_000).toISOString()
  const key = trackingKey(babyId, lastStartIso)
  const store = loadTracking()
  store[key] = { alerted: false, dismissed: false, snoozeUntilIso: until }
  saveTracking(store)
  return minutes
}

export function getFeedReminderTrackingForSync(): TrackingStore {
  return loadTracking()
}

export function getFeedReminderSnoozeUntil(babyId: string, lastStartIso: string): Date | null {
  const iso = loadTracking()[trackingKey(babyId, lastStartIso)]?.snoozeUntilIso
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}
