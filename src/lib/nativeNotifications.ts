import { LocalNotifications } from '@capacitor/local-notifications'
import {
  buildFeedNotificationPayload,
  type FeedNotificationItem,
} from './feedNotifications'
import type { FeedReminderSyncPayload } from './feedReminders'
import {
  getFeedReminderSnoozeMinutes,
  markFeedReminderAlerted,
  markFeedReminderDismissed,
  markFeedReminderSnoozed,
} from './feedReminderState'
import { FeedProgressNative } from './feedProgressNative'
import {
  feedSessionAlertKey,
  getFeedSessionAlertsForSync,
  hasFeedSessionBeenAlerted,
  markFeedSessionAlerted,
  pruneFeedSessionAlerts,
} from './feedAlertState'
import { isFeedingOwnedByThisDevice } from './feedOwnership'
import { FeedWatchNative } from './feedWatchNative'
import { registerNativePartnerPushToken } from './partnerPushRegistration'
import {
  MedicineAlertNative,
  MEDICINE_ALERT_ID_BASE,
  MEDICINE_ALERT_ID_SPAN,
  type MedicineAlertScheduleItem,
} from './medicineAlertNative'
import {
  applyMedicineAlertFiredFromSync,
  clearMedicineAlertFired,
  getMedicineAlertFiredForSync,
  markMedicineAlertFired,
  pruneMedicineAlertFired,
  shouldAlertMedicineDue,
} from './medicineAlertState'
import {
  buildMedicineOverdueFollowups,
  formatMedicineNotificationSubtitle,
  formatMedicineNotificationTitle,
  isDoseDue,
  isMedicineActiveNow,
  mostRecentDueAtMs,
} from './medicineSchedule'
import { areMedicineOverdueFollowupsEnabled } from './medicineNotifications'
import { buildMedicineNotifyPayload, type MedicineNotifyPayload } from './medicineNotifications'
import type { Medicine, MilkLot } from '../types'
import { isAndroidNative } from './platform'
import { timestampToDate } from './time'
import { buildMilkExpirationAlarms, MILK_EXPIRY_FIRE_STALE_MS } from './milkExpiration'
import { FeedReminderNative } from './feedReminderNative'
import type { BabyId } from '../types'
import type { NursingSessionReminderSyncPayload } from './nursingSessionReminders'
import { NursingSessionReminderNative } from './nursingSessionReminderNative'
import { markNursingSessionReminderAlerted } from './nursingSessionReminderState'

const REMINDER_CHANNEL = 'freifeed_feed_reminder_v1'

const MED_ID_BASE = MEDICINE_ALERT_ID_BASE
const MED_OVERDUE_ID_BASE = 36_000
const MED_OVERDUE_ID_SPAN = 8_000
const MILK_EXPIRY_ID_BASE = 28_000
const MILK_EXPIRY_ID_SPAN = 8_000
const FEED_ID_BASE = 31_000
const REMINDER_ID_BASE = 32_000
const NURSING_LONG_ID_BASE = 34_000
const NURSING_LONG_ID_SPAN = 100
/** Legacy Capacitor LocalNotifications span (cancelled on sync). */
const NURSING_LONG_LEGACY_SPAN = 8_000

let channelsReady = false
let medicineActionsReady = false
let lastRegisteredSnoozeMinutes = -1
/** Ids last scheduled via MedicineAlert (appointment-style), so we can cancel precisely. */
let lastNursingScheduledIds: number[] = []

function stableId(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 8_000
}

function nursingAlertKey(sessionKey: string): string {
  return `nursing:${sessionKey}`
}

function nursingNotifId(sessionKey: string): number {
  let h = 0
  for (let i = 0; i < sessionKey.length; i++) {
    h = (h * 31 + sessionKey.charCodeAt(i)) | 0
  }
  return NURSING_LONG_ID_BASE + (Math.abs(h) % NURSING_LONG_ID_SPAN)
}

async function ensureNativeNotificationSetup(): Promise<void> {
  if (!isAndroidNative()) return
  if (!channelsReady) {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL,
      name: 'Feed reminders',
      description: 'Reminds you when it may be time for the next feed',
      importance: 4,
      vibration: true,
      visibility: 1,
    })
    channelsReady = true
  }
  const snoozeMinutes = getFeedReminderSnoozeMinutes()
  if (!medicineActionsReady || lastRegisteredSnoozeMinutes !== snoozeMinutes) {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'FEED_REMINDER',
          actions: [
            { id: 'dismiss', title: 'Dismiss' },
            { id: 'snooze', title: `Remind in ${snoozeMinutes} min` },
          ],
        },
      ],
    })
    medicineActionsReady = true
    lastRegisteredSnoozeMinutes = snoozeMinutes
  }
  await syncNativeMedicineAlertFiredState()
}

async function syncNativeMedicineAlertFiredState(): Promise<void> {
  try {
    const { json } = await MedicineAlertNative.getAlertFiredJson()
    applyMedicineAlertFiredFromSync(JSON.parse(json) as Record<string, number>)
    await MedicineAlertNative.syncAlertFiredFromWeb({
      json: JSON.stringify(getMedicineAlertFiredForSync()),
    })
  } catch {
    /* plugin unavailable outside native build */
  }
}

async function cancelLegacyMedicineLocalNotifications(): Promise<void> {
  const pending = await LocalNotifications.getPending()
  const medIds =
    pending.notifications
      ?.filter((n) => n.id != null && n.id >= MED_ID_BASE && n.id < FEED_ID_BASE)
      .map((n) => ({ id: n.id! })) ?? []
  if (medIds.length > 0) {
    await LocalNotifications.cancel({ notifications: medIds })
  }
  try {
    const delivered = await LocalNotifications.getDeliveredNotifications()
    const shown =
      delivered.notifications?.filter((n) => n.id != null && n.id >= MED_ID_BASE && n.id < FEED_ID_BASE) ??
      []
    if (shown.length > 0) {
      await LocalNotifications.removeDeliveredNotifications({ notifications: shown })
    }
  } catch {
    /* ignore */
  }
}

async function cancelNativeReminderNotification(babyId: string): Promise<void> {
  const id = reminderNotifId(babyId)
  await LocalNotifications.cancel({ notifications: [{ id }] })
  try {
    const delivered = await LocalNotifications.getDeliveredNotifications()
    const match = delivered.notifications?.filter((n) => n.id === id) ?? []
    if (match.length > 0) {
      await LocalNotifications.removeDeliveredNotifications({ notifications: match })
    }
  } catch {
    /* ignore */
  }
}

export async function ensureNativeNotificationPermission(): Promise<boolean> {
  if (!isAndroidNative()) return false
  const { ensureNotificationPermission } = await import('./feedNotifications')
  const perm = await ensureNotificationPermission()
  return perm === 'granted'
}

function dateAtSlot(base: Date, slot: string, dayOffset: number): Date | null {
  const [hStr, mStr] = slot.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}

function upcomingMedicineTimes(med: MedicineNotifyPayload, now: Date, horizonHours = 36): Date[] {
  if (med.category === 'as_needed') return []
  const horizon = now.getTime() + horizonHours * 60 * 60 * 1000
  const out: Date[] = []

  if (med.type === 'periodic') {
    const intervalMs = (med.intervalHours ?? 0) * 60 * 60 * 1000
    if (intervalMs <= 0) return out
    let next: number
    if (med.lastTakenAtIso) {
      const last = new Date(med.lastTakenAtIso).getTime()
      if (Number.isNaN(last)) return out
      next = last + intervalMs
      while (next <= now.getTime()) next += intervalMs
    } else if (med.startedAtIso) {
      const start = new Date(med.startedAtIso).getTime()
      if (Number.isNaN(start)) return out
      next = start <= now.getTime() ? start + intervalMs : start
    } else {
      return out
    }
    while (next < horizon) {
      if (next > now.getTime()) out.push(new Date(next))
      next += intervalMs
    }
    return out
  }

  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    for (const slot of med.times) {
      const at = dateAtSlot(now, slot, dayOffset)
      if (at && at.getTime() > now.getTime() && at.getTime() < horizon) {
        out.push(at)
      }
    }
  }
  return out
}

function medicineNotifId(medicineId: string, at: Date): number {
  return MED_ID_BASE + (stableId(`${medicineId}:${at.toISOString()}`) % 8_000)
}

function medicineOverdueNotifId(medicineId: string, slotDueMs: number, kind: string): number {
  return MED_OVERDUE_ID_BASE + (stableId(`${medicineId}:${slotDueMs}:${kind}`) % MED_OVERDUE_ID_SPAN)
}

export function feedNotifId(babyId: string): number {
  return FEED_ID_BASE + (stableId(babyId) % 100)
}

export async function dismissNativeFeedForBaby(babyId: string): Promise<void> {
  if (!isAndroidNative()) return
  lastFeedBodies.delete(babyId)
  try {
    await FeedProgressNative.dismiss({ id: feedNotifId(babyId) })
  } catch {
    /* plugin unavailable */
  }
}

function reminderNotifId(babyId: string): number {
  return REMINDER_ID_BASE + (stableId(babyId) % 100)
}

async function fireNativeMedicineDueAlert(medicine: Medicine, dueMs: number): Promise<void> {
  const id = medicineNotifId(medicine.id, new Date(dueMs))
  const title = formatMedicineNotificationTitle(medicine.name, medicine.category)
  const body = formatMedicineNotificationSubtitle(
    medicine.totalPills,
    medicine.dosage,
    medicine.category,
  )
  try {
    await MedicineAlertNative.show({
      id,
      title,
      body,
      alert: true,
      medicineId: medicine.id,
      dueMs,
    })
  } catch {
    /* plugin unavailable */
  }
  markMedicineAlertFired(medicine.id, dueMs)
}

/**
 * Immediate due-now alerts for doses that have not been notified yet.
 * Must NOT use shouldShowInAppDueBanner — required meds stay "due" until taken,
 * which re-fired a push on every cold open.
 */
export async function syncMedicineDueAlerts(medicines: Medicine[]): Promise<void> {
  if (!isAndroidNative()) return
  if (!(await ensureNativeNotificationPermission())) return
  await ensureNativeNotificationSetup()

  const now = new Date()
  for (const medicine of medicines) {
    if (!isMedicineActiveNow(medicine, now) || !isDoseDue(medicine, now)) continue
    const dueMs = mostRecentDueAtMs(medicine, now)
    if (dueMs == null) continue
    if (!shouldAlertMedicineDue(medicine.id, dueMs)) continue
    await fireNativeMedicineDueAlert(medicine, dueMs)
  }
}

export async function syncNativeMedicineNotifications(medicines: Medicine[]): Promise<void> {
  if (!isAndroidNative()) return
  if (!(await ensureNativeNotificationPermission())) return
  await ensureNativeNotificationSetup()

  if (medicines.length > 0) {
    pruneMedicineAlertFired(new Set(medicines.map((m) => m.id)))
  }

  await cancelLegacyMedicineLocalNotifications()
  try {
    await MedicineAlertNative.cancelScheduledInRange({
      baseId: MEDICINE_ALERT_ID_BASE,
      count: MEDICINE_ALERT_ID_SPAN,
    })
    await MedicineAlertNative.cancelScheduledInRange({
      baseId: MED_OVERDUE_ID_BASE,
      count: MED_OVERDUE_ID_SPAN,
    })
  } catch {
    /* plugin unavailable */
  }

  const now = new Date()
  const toSchedule: MedicineAlertScheduleItem[] = []

  const payloads = buildMedicineNotifyPayload(medicines)
  for (const med of payloads) {
    if (med.category === 'as_needed') continue
    const lastTaken = med.lastTakenAtIso ? new Date(med.lastTakenAtIso).getTime() : 0
    for (const at of upcomingMedicineTimes(med, now)) {
      if (lastTaken >= at.getTime()) continue
      const dueMs = at.getTime()
      const id = medicineNotifId(med.id, at)
      toSchedule.push({
        id,
        atMs: at.getTime(),
        title: formatMedicineNotificationTitle(med.name, med.category),
        body: formatMedicineNotificationSubtitle(med.totalPills, med.dosage, med.category),
        medicineId: med.id,
        dueMs,
      })
    }
  }

  if (areMedicineOverdueFollowupsEnabled()) {
    for (const medicine of medicines) {
      if (medicine.category === 'as_needed') continue
      const lastTakenMs = timestampToDate(medicine.lastTakenAt)?.getTime() ?? 0
      for (const alarm of buildMedicineOverdueFollowups(medicine, now)) {
        if (lastTakenMs >= alarm.slotDueMs || lastTakenMs >= alarm.atMs) continue
        const id = medicineOverdueNotifId(medicine.id, alarm.slotDueMs, alarm.kind)
        toSchedule.push({
          id,
          atMs: alarm.atMs,
          title: alarm.title,
          body: alarm.body,
          medicineId: medicine.id,
          dueMs: alarm.atMs,
        })
      }
    }
  }

  if (toSchedule.length > 0) {
    try {
      await MedicineAlertNative.scheduleAlarms({ items: toSchedule })
    } catch {
      /* plugin unavailable */
    }
  }
}

export async function clearNativeMedicineNotifications(): Promise<void> {
  if (!isAndroidNative()) return
  await cancelLegacyMedicineLocalNotifications()
  try {
    await MedicineAlertNative.cancelScheduledInRange({
      baseId: MEDICINE_ALERT_ID_BASE,
      count: MEDICINE_ALERT_ID_SPAN,
    })
    await MedicineAlertNative.cancelScheduledInRange({
      baseId: MED_OVERDUE_ID_BASE,
      count: MED_OVERDUE_ID_SPAN,
    })
    await MedicineAlertNative.dismissDeliveredInRange({
      baseId: MEDICINE_ALERT_ID_BASE,
      count: MEDICINE_ALERT_ID_SPAN,
    })
    await MedicineAlertNative.dismissDeliveredInRange({
      baseId: MED_OVERDUE_ID_BASE,
      count: MED_OVERDUE_ID_SPAN,
    })
  } catch {
    /* plugin unavailable */
  }
}

function milkExpiryNotifId(lotId: string, kind: string): number {
  return MILK_EXPIRY_ID_BASE + (stableId(`${lotId}:${kind}`) % MILK_EXPIRY_ID_SPAN)
}

const nativeMilkExpiryFired = new Set<string>()

function milkExpiryAlertKey(lotId: string, kind: string): string {
  return `milk:${lotId}:${kind}`
}

function pruneNativeMilkExpiryFired(alarms: ReturnType<typeof buildMilkExpirationAlarms>): void {
  const activeKeys = new Set(alarms.map((a) => milkExpiryAlertKey(a.lotId, a.kind)))
  for (const key of [...nativeMilkExpiryFired]) {
    if (!activeKeys.has(key)) nativeMilkExpiryFired.delete(key)
  }
}

/** Schedule future milk expiry alarms via AlarmManager (resync when lots change). */
export async function syncNativeMilkExpirationSchedule(lots: MilkLot[]): Promise<void> {
  if (!isAndroidNative()) return
  if (!(await ensureNativeNotificationPermission())) return
  await ensureNativeNotificationSetup()

  try {
    await MedicineAlertNative.cancelScheduledInRange({
      baseId: MILK_EXPIRY_ID_BASE,
      count: MILK_EXPIRY_ID_SPAN,
    })
  } catch {
    /* plugin unavailable */
  }

  const alarms = buildMilkExpirationAlarms(lots)
  pruneNativeMilkExpiryFired(alarms)

  const nowMs = Date.now()
  const toSchedule: MedicineAlertScheduleItem[] = []

  for (const a of alarms) {
    if (a.atMs <= nowMs) continue
    toSchedule.push({
      id: milkExpiryNotifId(a.lotId, a.kind),
      atMs: a.atMs,
      title: a.title,
      body: a.body,
      medicineId: milkExpiryAlertKey(a.lotId, a.kind),
      dueMs: a.atMs,
    })
  }

  if (toSchedule.length > 0) {
    try {
      await MedicineAlertNative.scheduleAlarms({ items: toSchedule })
    } catch {
      /* plugin unavailable */
    }
  }
}

/** Show due-now milk expiry alerts (runs periodically while the app is open). */
export async function fireNativeMilkExpirationDueAlerts(lots: MilkLot[]): Promise<void> {
  if (!isAndroidNative()) return
  if (!(await ensureNativeNotificationPermission())) return
  await ensureNativeNotificationSetup()

  const alarms = buildMilkExpirationAlarms(lots)
  pruneNativeMilkExpiryFired(alarms)

  const nowMs = Date.now()

  for (const a of alarms) {
    if (a.atMs > nowMs) continue

    const key = milkExpiryAlertKey(a.lotId, a.kind)
    if (nativeMilkExpiryFired.has(key)) continue

    const isSoon =
      a.kind === 'fridge-soon' || a.kind === 'frozen-day' || a.kind === 'frozen-week'
    if (!isSoon && nowMs - a.atMs > MILK_EXPIRY_FIRE_STALE_MS) continue

    try {
      await MedicineAlertNative.show({
        id: milkExpiryNotifId(a.lotId, a.kind),
        title: a.title,
        body: a.body,
        alert: true,
        medicineId: key,
        dueMs: a.atMs,
      })
      nativeMilkExpiryFired.add(key)
    } catch {
      /* plugin unavailable */
    }
  }
}

export async function syncNativeMilkExpirationNotifications(lots: MilkLot[]): Promise<void> {
  await syncNativeMilkExpirationSchedule(lots)
  await fireNativeMilkExpirationDueAlerts(lots)
}

export async function clearNativeMilkExpirationNotifications(): Promise<void> {
  if (!isAndroidNative()) return
  nativeMilkExpiryFired.clear()
  try {
    await MedicineAlertNative.cancelScheduledInRange({
      baseId: MILK_EXPIRY_ID_BASE,
      count: MILK_EXPIRY_ID_SPAN,
    })
    await MedicineAlertNative.dismissDeliveredInRange({
      baseId: MILK_EXPIRY_ID_BASE,
      count: MILK_EXPIRY_ID_SPAN,
    })
  } catch {
    /* plugin unavailable */
  }
}

function feedSessionKey(feed: FeedNotificationItem): string {
  return feedSessionAlertKey(feed.babyId, feed.startAtIso)
}

function feedDetail(feed: FeedNotificationItem): string {
  return feed.side ?? 'Feeding'
}

function feedStartedAtMs(feed: FeedNotificationItem): number {
  const ms = Date.parse(feed.startAtIso)
  if (!Number.isNaN(ms) && ms > 0) return ms
  console.warn('feed notification missing valid startAtIso', feed.startAtIso, feed.id)
  return Date.now()
}

function feedShowOptions(
  feed: FeedNotificationItem,
  opts: {
    id: number
    title: string
    body: string
    alert: boolean
    feedingId: string
  },
) {
  const startedAtMs = feedStartedAtMs(feed)
  return {
    ...opts,
    babyId: feed.babyId,
    startedAtMs,
    startedAtMsText: String(startedAtMs),
  }
}

const lastFeedBodies = new Map<string, string>()

export async function syncNativeFeedNotifications(feeds: FeedNotificationItem[]): Promise<void> {
  if (!isAndroidNative()) return
  if (!(await ensureNativeNotificationPermission())) return

  const activeBabyIds = new Set(feeds.map((f) => f.babyId))
  const activeSessions = new Set(feeds.map(feedSessionKey))
  pruneFeedSessionAlerts(activeSessions)

  for (const [babyId] of [...lastFeedBodies]) {
    if (!activeBabyIds.has(babyId)) lastFeedBodies.delete(babyId)
  }

  if (feeds.length === 0) {
    await clearNativeFeedNotifications()
    return
  }

  for (const feed of feeds) {
    const id = feedNotifId(feed.babyId)
    const session = feedSessionKey(feed)
    const detail = feedDetail(feed)
    const stateKey = `${session}:${detail}`
    const alreadyAlerted = hasFeedSessionBeenAlerted(session)
    const owned = isFeedingOwnedByThisDevice(feed.id)
    const playAlert = !alreadyAlerted && !owned

    const title = `${feed.babyName} — nursing`

    if (lastFeedBodies.get(feed.babyId) === stateKey && alreadyAlerted) {
      await FeedProgressNative.show(
        feedShowOptions(feed, {
          id,
          title,
          body: detail,
          alert: false,
          feedingId: feed.id,
        }),
      )
      continue
    }

    await FeedProgressNative.show(
      feedShowOptions(feed, {
        id,
        title,
        body: detail,
        alert: playAlert,
        feedingId: feed.id,
      }),
    )
    lastFeedBodies.set(feed.babyId, stateKey)
    if (playAlert) markFeedSessionAlerted(session)
  }
}

/** Register FCM + background poller when partner feed alerts are enabled. */
export async function bootstrapNativePartnerFeedWatch(
  householdId: string,
  feedings: import('../types').Feeding[],
  babies: import('../types').Baby[],
  localSessions: import('./activeFeedSession').ActiveFeedDraft[],
): Promise<void> {
  if (!isAndroidNative()) return
  if (!(await ensureNativeNotificationPermission())) return
  const payload = buildFeedNotificationPayload(feedings, babies, localSessions)
  await syncNativeFeedWatch(householdId, payload, true)
}

export async function syncNativeFeedWatch(
  householdId: string,
  feeds: FeedNotificationItem[],
  enabled: boolean,
): Promise<void> {
  if (!isAndroidNative()) return
  try {
    await FeedWatchNative.syncAlertSessionsFromWeb({
      json: JSON.stringify(getFeedSessionAlertsForSync()),
    })
  } catch {
    /* plugin unavailable */
  }

  if (!enabled || !(await ensureNativeNotificationPermission())) {
    try {
      await FeedWatchNative.setWatchConfig({
        enabled: false,
        householdId,
        idToken: '',
        ownedFeedingIds: [],
      })
    } catch {
      /* ignore */
    }
    return
  }

  try {
    const { auth } = await import('../firebase')
    if (!auth.currentUser) return
    const idToken = await auth.currentUser.getIdToken(true)
    if (!idToken) return

    const ownedFeedingIds = feeds
      .filter((f) => isFeedingOwnedByThisDevice(f.id))
      .map((f) => f.id)

    await FeedWatchNative.setWatchConfig({
      enabled: true,
      householdId,
      idToken,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
      ownedFeedingIds,
    })
    await registerNativePartnerPushToken()
  } catch {
    /* plugin unavailable */
  }
}

export async function clearNativeFeedNotifications(): Promise<void> {
  if (!isAndroidNative()) return
  lastFeedBodies.clear()
  try {
    await FeedProgressNative.dismissAll()
  } catch {
    /* plugin unavailable in web build */
  }
  // Clear any legacy LocalNotifications feed alarms from older builds.
  const pending = await LocalNotifications.getPending()
  const ids =
    pending.notifications
      ?.filter((n) => n.id != null && n.id >= FEED_ID_BASE && n.id < REMINDER_ID_BASE)
      .map((n) => ({ id: n.id! })) ?? []
  if (ids.length > 0) {
    await LocalNotifications.cancel({ notifications: ids })
  }
}

export async function syncNativeFeedReminders(state: FeedReminderSyncPayload | null): Promise<void> {
  if (!isAndroidNative()) return
  if (!(await ensureNativeNotificationPermission())) return

  try {
    if (!state?.enabled) {
      await FeedReminderNative.cancelAll()
      return
    }
    await FeedReminderNative.syncReminders({ json: JSON.stringify(state) })
  } catch {
    /* plugin unavailable */
  }
}

export type NativeNotificationHandlers = {
  onMedicineTaken: (medicineId: string) => void
  onEndFeed: (payload: { babyId: BabyId; feedingId?: string | null }) => void
}

/** Wire notification actions (medicine taken, end feed) and tap-to-open URLs. */
export function registerNativeNotificationListeners(handlers: NativeNotificationHandlers): () => void {
  if (!isAndroidNative()) return () => {}

  void ensureNativeNotificationSetup()

  const unsub: Array<() => void> = []

  void FeedReminderNative.addListener('feedReminderShown', (event) => {
    const { babyId, lastStartIso, kind } = event
    if (!babyId || !lastStartIso) return
    if (kind === 'feed-reminder-snooze') {
      window.dispatchEvent(new Event('freifeed-reminder-state-changed'))
      return
    }
    if (kind === 'feed-reminder' || kind === 'feed-reminder-scheduled') {
      markFeedReminderAlerted(babyId, lastStartIso)
    }
  }).then((h) => {
    unsub.push(() => h.remove())
  })

  void FeedReminderNative.addListener('feedReminderDismiss', (event) => {
    const { babyId, lastStartIso } = event
    if (!babyId || !lastStartIso) return
    markFeedReminderDismissed(babyId, lastStartIso)
    void cancelNativeReminderNotification(babyId)
    window.dispatchEvent(new Event('freifeed-reminder-state-changed'))
  }).then((h) => {
    unsub.push(() => h.remove())
  })

  void FeedReminderNative.addListener('feedReminderSnooze', (event) => {
    const { babyId, lastStartIso } = event
    if (!babyId || !lastStartIso) return
    markFeedReminderSnoozed(babyId, lastStartIso)
    void cancelNativeReminderNotification(babyId)
    window.dispatchEvent(new Event('freifeed-reminder-state-changed'))
  }).then((h) => {
    unsub.push(() => h.remove())
  })

  void NursingSessionReminderNative.addListener('nursingSessionReminderShown', (event) => {
    if (!event.sessionKey) return
    markNursingSessionReminderAlerted(event.sessionKey)
  }).then((h) => {
    unsub.push(() => h.remove())
  })

  void NursingSessionReminderNative.addListener('nursingSessionReminderDismiss', (event) => {
    if (!event.sessionKey) return
    markNursingSessionReminderAlerted(event.sessionKey)
  }).then((h) => {
    unsub.push(() => h.remove())
  })

  void MedicineAlertNative.addListener('medicineAlertShown', (event) => {
    if (!event.medicineId || !Number.isFinite(event.dueMs)) return
    if (event.medicineId.startsWith('milk:')) {
      nativeMilkExpiryFired.add(event.medicineId)
      return
    }
    if (event.medicineId.startsWith('apt:')) return
    if (event.medicineId.startsWith('nursing:')) {
      markNursingSessionReminderAlerted(event.medicineId.slice('nursing:'.length))
      return
    }
    markMedicineAlertFired(event.medicineId, event.dueMs)
  }).then((h) => {
    unsub.push(() => h.remove())
  })

  void MedicineAlertNative.addListener('medicineAlertActionPerformed', (event) => {
    if (
      !event.medicineId ||
      event.medicineId.startsWith('milk:') ||
      event.medicineId.startsWith('apt:') ||
      event.medicineId.startsWith('nursing:')
    ) {
      return
    }
    clearMedicineAlertFired(event.medicineId)
    handlers.onMedicineTaken(event.medicineId)
  }).then((h) => {
    unsub.push(() => h.remove())
  })

  void FeedProgressNative.addListener('feedProgressActionPerformed', (event) => {
    if (event.actionId === 'end-session' && event.babyId) {
      handlers.onEndFeed({ babyId: event.babyId as BabyId, feedingId: event.feedingId ?? null })
    }
  }).then((h) => {
    unsub.push(() => h.remove())
  })

  return () => {
    for (const off of unsub) off()
  }
}

/** Cancel leftover Capacitor LocalNotifications from older builds. */
async function cancelLegacyNursingLocalNotifications(): Promise<void> {
  try {
    const pending = await LocalNotifications.getPending()
    const toCancel =
      pending.notifications
        ?.filter(
          (n) =>
            n.id != null &&
            n.id >= NURSING_LONG_ID_BASE &&
            n.id < NURSING_LONG_ID_BASE + NURSING_LONG_LEGACY_SPAN,
        )
        .map((n) => ({ id: n.id! })) ?? []
    if (toCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancel })
    }
  } catch {
    /* ignore */
  }
}

/**
 * Schedule nursing-timer-still-running reminders the same way as appointments:
 * JS computes atMs → MedicineAlertNative.scheduleAlarms → AlarmManager fires
 * with the app closed. Config is also synced for partner FCM/poller.
 */
export async function syncNativeNursingSessionReminders(
  payload: NursingSessionReminderSyncPayload | null,
): Promise<void> {
  if (!isAndroidNative()) return
  await cancelLegacyNursingLocalNotifications()

  const cancelPrevious = async () => {
    if (lastNursingScheduledIds.length > 0) {
      try {
        await MedicineAlertNative.cancelScheduledIds({ ids: lastNursingScheduledIds })
      } catch {
        /* plugin unavailable */
      }
      lastNursingScheduledIds = []
    }
    try {
      await MedicineAlertNative.cancelScheduledInRange({
        baseId: NURSING_LONG_ID_BASE,
        count: NURSING_LONG_ID_SPAN,
      })
      await MedicineAlertNative.dismissDeliveredInRange({
        baseId: NURSING_LONG_ID_BASE,
        count: NURSING_LONG_ID_SPAN,
      })
    } catch {
      /* ignore */
    }
    try {
      await NursingSessionReminderNative.cancelAll()
    } catch {
      /* older APK / unavailable */
    }
  }

  if (!payload?.enabled) {
    await cancelPrevious()
    try {
      await NursingSessionReminderNative.syncReminders({ json: 'null' })
    } catch {
      /* ignore */
    }
    return
  }

  if (!(await ensureNativeNotificationPermission())) return

  // Persist enabled + threshold for partner FCM/poller (app may be closed).
  try {
    await NursingSessionReminderNative.syncReminders({
      json: JSON.stringify({
        enabled: true,
        thresholdMs: payload.thresholdMs,
        sessions: [],
        alertedKeys: payload.alertedKeys,
      }),
    })
  } catch {
    /* plugin unavailable — MedicineAlert path below still works for this device's sessions */
  }

  // Cancel only alarms this web session previously scheduled (appointment pattern).
  // Do NOT cancel the whole nursing id range — partner FCM/poller alarms share it.
  if (lastNursingScheduledIds.length > 0) {
    try {
      await MedicineAlertNative.cancelScheduledIds({ ids: lastNursingScheduledIds })
    } catch {
      /* ignore */
    }
  }

  const now = Date.now()
  const toSchedule: MedicineAlertScheduleItem[] = []

  for (const session of payload.sessions) {
    if (payload.alertedKeys.includes(session.sessionKey)) continue
    const startMs = new Date(session.startAtIso).getTime()
    if (Number.isNaN(startMs)) continue
    let fireAt = startMs + payload.thresholdMs
    // Same as feed reminders: schedule a near-term alarm if already overdue.
    if (fireAt <= now) fireAt = now + 500
    const side = session.side ? ` · ${session.side}` : ''
    toSchedule.push({
      id: nursingNotifId(session.sessionKey),
      atMs: fireAt,
      title: `${session.babyName} — still nursing?`,
      body: `Nursing timer is still running${side}. Open Freifeed to stop the session.`,
      medicineId: nursingAlertKey(session.sessionKey),
      dueMs: fireAt,
    })
  }

  lastNursingScheduledIds = toSchedule.map((item) => item.id)

  if (toSchedule.length > 0) {
    try {
      await MedicineAlertNative.scheduleAlarms({ items: toSchedule })
    } catch (err) {
      console.warn('MedicineAlert scheduleAlarms failed for nursing reminders', err)
      lastNursingScheduledIds = []
    }
  }
}
