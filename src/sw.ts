/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'
import { feedReminderTrackingKey } from './lib/feedReminderState'
import {
  formatMedicineNotificationSubtitle,
  formatMedicineNotificationTitle,
} from './lib/medicineSchedule'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

precacheAndRoute(self.__WB_MANIFEST)
// Activate the new worker immediately and take over open clients so the data-layer
// rewrite (Firestore listeners instead of polling) reaches phones on next launch
// without waiting for a manual update prompt.
self.skipWaiting()
clientsClaim()

type FeedNotify = {
  id: string
  babyId: string
  babyName: string
  side: string | null
  startAtIso: string
}

type ReminderBaby = {
  id: string
  name: string
  lastStartIso: string | null
}

type ReminderSessionState = {
  alerted?: boolean
  dismissed?: boolean
  snoozeUntilIso?: string | null
}

type ReminderState = {
  enabled: boolean
  thresholdMs: number
  snoozeMinutes: number
  babies: ReminderBaby[]
  feedingInProgressBabyIds: string[]
  tracking: Record<string, ReminderSessionState>
}

type MedicineNotify = {
  id: string
  name: string
  totalPills: number
  dosage: string
  category: 'required' | 'as_needed'
  type: 'daily' | 'twice_daily' | 'three_times_daily' | 'periodic'
  times: string[]
  intervalHours: number | null
  startedAtIso: string | null
  lastTakenAtIso: string | null
}

/** silent + renotify:false — avoids buzz when replacing by tag on Android/Wear. */
type FeedNotificationOptions = NotificationOptions & {
  renotify?: boolean
  vibrate?: number[]
  actions?: { action: string; title: string }[]
}

let activeFeeds: FeedNotify[] = []
let reminderState: ReminderState | null = null
let activeMedicines: MedicineNotify[] = []
type MedicineOverdueSyncAlarm = {
  medicineId: string
  atMs: number
  title: string
  body: string
  slotDueMs: number
  kind: string
}
let activeMedicineOverdueAlarms: MedicineOverdueSyncAlarm[] = []
let medicineOverdueFollowupsEnabled = false
let tickTimer: ReturnType<typeof setInterval> | undefined
let reminderTimer: ReturnType<typeof setInterval> | undefined
let medicineTimer: ReturnType<typeof setInterval> | undefined
let milkExpiryTimer: ReturnType<typeof setInterval> | undefined
let nursingSessionTimer: ReturnType<typeof setInterval> | undefined

type NursingSessionReminderNotify = {
  sessionKey: string
  babyId: string
  babyName: string
  startAtIso: string
  side: string | null
}

type NursingSessionReminderState = {
  enabled: boolean
  thresholdMs: number
  sessions: NursingSessionReminderNotify[]
}

let nursingSessionReminderState: NursingSessionReminderState | null = null
const nursingSessionAlerted = new Set<string>()

/** Track last fired slot per medicine to prevent re-alerting for the same dose. */
const medicineLastFired = new Map<string, number>()

type MilkExpiryAlarm = {
  lotId: string
  kind: string
  atMs: number
  title: string
  body: string
}

let activeMilkAlarms: MilkExpiryAlarm[] = []
const milkExpiryLastFired = new Map<string, number>()

/** Sessions we have already played sound/vibration for (baby + start time). */
const alertedSessions = new Set<string>()
/** Last body posted per notification tag — avoids redundant showNotification calls. */
const lastFeedBodies = new Map<string, string>()
/** Sessions the user explicitly dismissed — don't recreate during the same session. */
const dismissedSessions = new Set<string>()

/** Per baby+session reminder state (synced from app localStorage). */
let reminderTracking: Record<string, ReminderSessionState> = {}
let reminderSnoozeMinutes = 15

function feedTag(babyId: string): string {
  return `feed-progress-${babyId}`
}

function sessionKey(feed: FeedNotify): string {
  const ms = new Date(feed.startAtIso).getTime()
  const normalized = Number.isNaN(ms) ? feed.startAtIso : String(Math.floor(ms / 1000))
  return `${feed.babyId}:${normalized}`
}

function normalizeStartSecond(iso: string): string {
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? iso : String(Math.floor(ms / 1000))
}

function formatElapsed(startIso: string): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000))
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function feedBody(feed: FeedNotify): string {
  const side = feed.side ? ` · ${feed.side}` : ''
  return `${formatElapsed(feed.startAtIso)}${side}`
}

function stopTick() {
  if (tickTimer !== undefined) {
    clearInterval(tickTimer)
    tickTimer = undefined
  }
}

function stopReminderTimer() {
  if (reminderTimer !== undefined) {
    clearInterval(reminderTimer)
    reminderTimer = undefined
  }
}

function formatDurationSince(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function mergeReminderTracking(
  existing: Record<string, ReminderSessionState>,
  incoming: Record<string, ReminderSessionState>,
): Record<string, ReminderSessionState> {
  const merged: Record<string, ReminderSessionState> = { ...incoming }
  for (const [key, row] of Object.entries(existing)) {
    const inc = incoming[key] ?? {}
    merged[key] = {
      ...row,
      ...inc,
      dismissed: Boolean(inc.dismissed || row.dismissed),
      alerted: Boolean(inc.alerted || row.alerted),
      snoozeUntilIso: inc.snoozeUntilIso ?? row.snoozeUntilIso ?? null,
    }
  }
  return merged
}

function shouldShowReminderInSw(babyId: string, lastStartIso: string, thresholdMs: number): boolean {
  const elapsed = Date.now() - new Date(lastStartIso).getTime()
  if (Number.isNaN(elapsed) || elapsed < thresholdMs) return false
  const row = reminderTracking[feedReminderTrackingKey(babyId, lastStartIso)] ?? {}
  if (row.snoozeUntilIso) {
    const until = new Date(row.snoozeUntilIso).getTime()
    if (!Number.isNaN(until) && until > Date.now()) return false
  }
  if (row.dismissed) return false
  if (row.alerted) return false
  return true
}

function setReminderTracking(
  babyId: string,
  lastStartIso: string,
  patch: ReminderSessionState,
): void {
  const key = feedReminderTrackingKey(babyId, lastStartIso)
  reminderTracking[key] = { ...reminderTracking[key], ...patch }
}

async function clearReminderNotifications() {
  const existing = await self.registration.getNotifications()
  for (const n of existing) {
    if (n.tag?.startsWith('reminder-')) n.close()
  }
}

async function postReminderActionToClients(
  type: 'FEED_REMINDER_DISMISS' | 'FEED_REMINDER_SNOOZE',
  babyId: string,
  lastStartIso: string,
): Promise<void> {
  if (type === 'FEED_REMINDER_DISMISS') {
    setReminderTracking(babyId, lastStartIso, { dismissed: true, snoozeUntilIso: null })
  } else {
    const until = new Date(Date.now() + reminderSnoozeMinutes * 60_000).toISOString()
    setReminderTracking(babyId, lastStartIso, { dismissed: false, alerted: false, snoozeUntilIso: until })
  }

  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clientList) {
    client.postMessage({ type, babyId, lastStartIso })
  }
}

async function notifyClientsFeedReminderAlerted(babyId: string, lastStartIso: string): Promise<void> {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clientList) {
    client.postMessage({ type: 'FEED_REMINDER_ALERTED', babyId, lastStartIso })
  }
}

async function checkFeedReminders() {
  if (!reminderState?.enabled) return

  const feedingNow = new Set(reminderState.feedingInProgressBabyIds ?? [])

  for (const baby of reminderState.babies) {
    const tag = `reminder-${baby.id}`
    if (feedingNow.has(baby.id)) {
      const existing = await self.registration.getNotifications({ tag })
      for (const n of existing) n.close()
      continue
    }
    if (!baby.lastStartIso) {
      const existing = await self.registration.getNotifications({ tag })
      for (const n of existing) n.close()
      continue
    }

    const elapsed = Date.now() - new Date(baby.lastStartIso).getTime()
    if (elapsed < reminderState.thresholdMs) {
      const existing = await self.registration.getNotifications({ tag })
      for (const n of existing) n.close()
      continue
    }

    if (!shouldShowReminderInSw(baby.id, baby.lastStartIso, reminderState.thresholdMs)) {
      continue
    }

    const existing = await self.registration.getNotifications({ tag })
    if (existing.length > 0) continue

    const duration = formatDurationSince(elapsed)
    const snoozeMin = reminderState.snoozeMinutes ?? reminderSnoozeMinutes
    await self.registration.showNotification(`${baby.name} — feed reminder`, {
      body: `It's been ${duration} since ${baby.name} was last fed`,
      tag,
      data: { url: '/', babyId: baby.id, lastStartIso: baby.lastStartIso },
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      actions: [
        { action: 'dismiss', title: 'Dismiss' },
        { action: 'snooze', title: `Remind in ${snoozeMin} min` },
      ],
    } as FeedNotificationOptions)
    setReminderTracking(baby.id, baby.lastStartIso, { alerted: true })
    void notifyClientsFeedReminderAlerted(baby.id, baby.lastStartIso)
  }
}

function startReminderTimer() {
  stopReminderTimer()
  reminderTimer = setInterval(() => {
    void checkFeedReminders()
  }, 30_000)
  void checkFeedReminders()
}

function stopMedicineTimer() {
  if (medicineTimer !== undefined) {
    clearInterval(medicineTimer)
    medicineTimer = undefined
  }
}

function medicineTag(id: string): string {
  return `medicine-${id}`
}

async function clearMedicineNotifications(ids?: Set<string>) {
  const existing = await self.registration.getNotifications()
  for (const n of existing) {
    if (!n.tag?.startsWith('medicine-')) continue
    if (!ids) {
      n.close()
      continue
    }
    const id = n.tag.slice('medicine-'.length)
    if (!ids.has(id)) n.close()
  }
  if (!ids) medicineLastFired.clear()
  else {
    for (const key of [...medicineLastFired.keys()]) {
      if (!ids.has(key)) medicineLastFired.delete(key)
    }
  }
}

/** Most-recent due timestamp on or before `now`, or null if none. */
function asNeededIntervalHoursFromNotify(med: MedicineNotify): number | null {
  if (med.type === 'periodic') {
    const h = med.intervalHours ?? 0
    return h > 0 ? h : null
  }
  if (med.type === 'daily') return 24
  if (med.type === 'twice_daily') return 12
  if (med.type === 'three_times_daily') return 8
  return null
}

function lastDueAt(med: MedicineNotify, now: number): number | null {
  if (med.category === 'as_needed') {
    const hours = asNeededIntervalHoursFromNotify(med)
    if (hours == null) return null
    if (!med.lastTakenAtIso) return null
    const lastTaken = new Date(med.lastTakenAtIso).getTime()
    if (Number.isNaN(lastTaken)) return null
    const dueAt = lastTaken + hours * 60 * 60 * 1000
    return dueAt <= now ? dueAt : null
  }

  if (med.type === 'periodic') {
    const intervalMs = (med.intervalHours ?? 0) * 60 * 60 * 1000
    if (intervalMs <= 0) return null
    // Periodic cadence is anchored on lastTakenAt when available.
    if (med.lastTakenAtIso) {
      const lastTaken = new Date(med.lastTakenAtIso).getTime()
      if (Number.isNaN(lastTaken)) return null
      const dueAt = lastTaken + intervalMs
      return dueAt <= now ? dueAt : null
    }
    if (!med.startedAtIso) return null
    const startMs = new Date(med.startedAtIso).getTime()
    if (Number.isNaN(startMs)) return null
    return now >= startMs ? startMs : null
  }

  let latest: number | null = null
  for (let dayOffset of [0, -1]) {
    for (const slot of med.times) {
      const [h, m] = slot.split(':').map(Number)
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue
      const fire = new Date(now)
      fire.setDate(fire.getDate() + dayOffset)
      fire.setHours(h, m, 0, 0)
      if (fire.getTime() <= now) {
        if (latest == null || fire.getTime() > latest) latest = fire.getTime()
      }
    }
  }
  return latest
}

const MEDICINE_ALERT_AUTO_DISMISS_MS = 5_000

async function fireMedicineNotification(med: MedicineNotify) {
  const tag = medicineTag(med.id)
  const title = formatMedicineNotificationTitle(med.name, med.category)
  const subtitle = formatMedicineNotificationSubtitle(med.totalPills, med.dosage, med.category)
  await self.registration.showNotification(title, {
    body: subtitle,
    tag,
    data: { url: '/?view=medicines', medicineId: med.id },
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    renotify: true,
    actions: [{ action: 'mark-taken', title: 'I took it' }],
  } as NotificationOptions & { renotify?: boolean; actions?: { action: string; title: string }[] })

  setTimeout(() => {
    void self.registration.getNotifications({ tag }).then((list) => {
      for (const n of list) n.close()
    })
  }, MEDICINE_ALERT_AUTO_DISMISS_MS)
}

function medicineOverdueTag(medicineId: string, slotDueMs: number, kind: string): string {
  return `medicine-overdue-${medicineId}-${slotDueMs}-${kind}`
}

async function fireMedicineOverdueNotification(
  alarm: MedicineOverdueSyncAlarm,
): Promise<void> {
  const tag = medicineOverdueTag(alarm.medicineId, alarm.slotDueMs, alarm.kind)
  await self.registration.showNotification(alarm.title, {
    body: alarm.body,
    tag,
    data: { url: '/?view=medicines', medicineId: alarm.medicineId },
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    renotify: true,
    actions: [{ action: 'mark-taken', title: 'I took it' }],
  } as NotificationOptions & { renotify?: boolean; actions?: { action: string; title: string }[] })

  setTimeout(() => {
    void self.registration.getNotifications({ tag }).then((list) => {
      for (const n of list) n.close()
    })
  }, MEDICINE_ALERT_AUTO_DISMISS_MS)
}

async function checkMedicineOverdueAlarms() {
  if (!medicineOverdueFollowupsEnabled || activeMedicineOverdueAlarms.length === 0) return
  const now = Date.now()
  const STALE_MS = 15 * 60 * 1000
  for (const alarm of activeMedicineOverdueAlarms) {
    if (alarm.atMs > now) continue
    if (now - alarm.atMs > STALE_MS) continue
    const med = activeMedicines.find((m) => m.id === alarm.medicineId)
    if (!med || med.category === 'as_needed') continue
    const lastTaken = med.lastTakenAtIso ? new Date(med.lastTakenAtIso).getTime() : 0
    if (lastTaken >= alarm.slotDueMs) continue
    if (lastTaken >= alarm.atMs) continue
    const fireKey = `${alarm.medicineId}:${alarm.slotDueMs}:${alarm.kind}`
    const firedAt = medicineLastFired.get(fireKey) ?? 0
    if (firedAt >= alarm.atMs) continue
    medicineLastFired.set(fireKey, alarm.atMs)
    medicineLastFired.set(alarm.medicineId, Math.max(medicineLastFired.get(alarm.medicineId) ?? 0, alarm.atMs))
    await fireMedicineOverdueNotification(alarm)
  }
}

async function checkMedicineReminders() {
  if (activeMedicines.length === 0 && activeMedicineOverdueAlarms.length === 0) return
  const now = Date.now()
  // Don't alert for doses that were already due more than 10 minutes ago — avoids
  // bursts after long SW sleeps.
  const STALE_MS = 10 * 60 * 1000
  for (const med of activeMedicines) {
    const due = lastDueAt(med, now)
    if (due == null) continue
    if (now - due > STALE_MS) continue

    // Already marked taken for this slot? Suppress.
    const lastTaken = med.lastTakenAtIso ? new Date(med.lastTakenAtIso).getTime() : 0
    if (lastTaken >= due) continue

    const lastFired = medicineLastFired.get(med.id) ?? 0
    if (lastFired >= due) continue
    medicineLastFired.set(med.id, due)
    await fireMedicineNotification(med)
  }
  await checkMedicineOverdueAlarms()
}

function startMedicineTimer() {
  stopMedicineTimer()
  medicineTimer = setInterval(() => {
    void checkMedicineReminders()
  }, 60_000)
  void checkMedicineReminders()
}

function milkExpiryTag(lotId: string, kind: string): string {
  return `milk-expiry-${lotId}-${kind}`
}

function stopMilkExpiryTimer() {
  if (milkExpiryTimer !== undefined) {
    clearInterval(milkExpiryTimer)
    milkExpiryTimer = undefined
  }
}

async function clearMilkExpiryNotifications(activeLotIds?: Set<string>) {
  const existing = await self.registration.getNotifications()
  for (const n of existing) {
    if (!n.tag?.startsWith('milk-expiry-')) continue
    if (!activeLotIds) {
      n.close()
      continue
    }
    const rest = n.tag.slice('milk-expiry-'.length)
    const lotId = rest.replace(/-(fridge-soon|fridge-expired|frozen-week|frozen-day|frozen-expired)$/, '')
    if (!activeLotIds.has(lotId)) n.close()
  }
  if (!activeLotIds) milkExpiryLastFired.clear()
  else {
    for (const key of [...milkExpiryLastFired.keys()]) {
      const lotId = key.split(':')[0]
      if (!activeLotIds.has(lotId)) milkExpiryLastFired.delete(key)
    }
  }
}

async function fireMilkExpiryNotification(alarm: MilkExpiryAlarm) {
  const tag = milkExpiryTag(alarm.lotId, alarm.kind)
  await self.registration.showNotification(alarm.title, {
    body: alarm.body,
    tag,
    data: { url: '/?view=milk', lotId: alarm.lotId },
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    renotify: true,
  } as NotificationOptions & { renotify?: boolean })
}

async function checkMilkExpiryAlarms() {
  if (activeMilkAlarms.length === 0) return
  const now = Date.now()
  const STALE_MS = 10 * 60 * 1000
  for (const alarm of activeMilkAlarms) {
    if (alarm.atMs > now) continue
    const key = `${alarm.lotId}:${alarm.kind}`
    if (milkExpiryLastFired.has(key)) continue
    const isSoon =
      alarm.kind === 'fridge-soon' ||
      alarm.kind === 'frozen-day' ||
      alarm.kind === 'frozen-week'
    if (!isSoon && now - alarm.atMs > STALE_MS) continue
    milkExpiryLastFired.set(key, alarm.atMs)
    await fireMilkExpiryNotification(alarm)
  }
}

function startMilkExpiryTimer() {
  stopMilkExpiryTimer()
  milkExpiryTimer = setInterval(() => {
    void checkMilkExpiryAlarms()
  }, 60_000)
  void checkMilkExpiryAlarms()
}

async function syncMilkExpiryList(alarms: MilkExpiryAlarm[]) {
  activeMilkAlarms = alarms
  const activeLotIds = new Set(alarms.map((a) => a.lotId))
  await clearMilkExpiryNotifications(activeLotIds)
  if (alarms.length === 0) {
    stopMilkExpiryTimer()
    return
  }
  startMilkExpiryTimer()
}

function filterOverdueAlarmsForTaken(
  medicines: MedicineNotify[],
  overdueAlarms: MedicineOverdueSyncAlarm[],
): MedicineOverdueSyncAlarm[] {
  return overdueAlarms.filter((alarm) => {
    const med = medicines.find((m) => m.id === alarm.medicineId)
    if (!med) return false
    const lastTaken = med.lastTakenAtIso ? new Date(med.lastTakenAtIso).getTime() : 0
    if (Number.isNaN(lastTaken)) return true
    return lastTaken < alarm.slotDueMs && lastTaken < alarm.atMs
  })
}

function pruneMedicineLastFiredForTaken(medicines: MedicineNotify[]) {
  for (const key of [...medicineLastFired.keys()]) {
    if (!key.includes(':')) continue
    const medId = key.split(':')[0]
    const med = medicines.find((m) => m.id === medId)
    if (!med?.lastTakenAtIso) continue
    const lastTaken = new Date(med.lastTakenAtIso).getTime()
    if (Number.isNaN(lastTaken)) continue
    const parts = key.split(':')
    const slotDueMs = Number(parts[1])
    if (Number.isFinite(slotDueMs) && lastTaken >= slotDueMs) {
      medicineLastFired.delete(key)
    }
  }
}

async function syncMedicineList(
  medicines: MedicineNotify[],
  alertFired?: Record<string, number>,
  overdueEnabled = false,
  overdueAlarms: MedicineOverdueSyncAlarm[] = [],
) {
  activeMedicines = medicines
  medicineOverdueFollowupsEnabled = overdueEnabled
  activeMedicineOverdueAlarms = filterOverdueAlarmsForTaken(medicines, overdueAlarms)
  pruneMedicineLastFiredForTaken(medicines)
  const activeIds = new Set(medicines.map((m) => m.id))
  await clearMedicineNotifications(activeIds)
  if (alertFired) {
    for (const [id, due] of Object.entries(alertFired)) {
      if (typeof due === 'number' && Number.isFinite(due)) {
        medicineLastFired.set(id, due)
      }
    }
  }
  if (medicines.length === 0 && overdueAlarms.length === 0) {
    stopMedicineTimer()
    return
  }
  startMedicineTimer()
}

async function syncReminderState(state: ReminderState | null) {
  reminderState = state?.enabled ? state : null
  reminderTracking = mergeReminderTracking(reminderTracking, state?.tracking ?? {})
  reminderSnoozeMinutes = state?.snoozeMinutes ?? 15

  if (!reminderState) {
    stopReminderTimer()
    await clearReminderNotifications()
    return
  }

  startReminderTimer()
}

function stopNursingSessionTimer() {
  if (nursingSessionTimer !== undefined) {
    clearInterval(nursingSessionTimer)
    nursingSessionTimer = undefined
  }
}

async function clearNursingSessionReminderNotifications() {
  const existing = await self.registration.getNotifications()
  for (const n of existing) {
    if (n.tag?.startsWith('nursing-long-')) n.close()
  }
}

async function notifyClientsNursingSessionAlerted(sessionKey: string): Promise<void> {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clientList) {
    client.postMessage({ type: 'NURSING_SESSION_REMINDER_ALERTED', sessionKey })
  }
}

async function checkNursingSessionReminders() {
  if (!nursingSessionReminderState?.enabled) return

  const activeKeys = new Set(nursingSessionReminderState.sessions.map((s) => s.sessionKey))
  for (const key of nursingSessionAlerted) {
    if (!activeKeys.has(key)) nursingSessionAlerted.delete(key)
  }

  for (const session of nursingSessionReminderState.sessions) {
    const elapsed = Date.now() - new Date(session.startAtIso).getTime()
    if (Number.isNaN(elapsed) || elapsed < nursingSessionReminderState.thresholdMs) {
      const tag = `nursing-long-${session.babyId}`
      const existing = await self.registration.getNotifications({ tag })
      for (const n of existing) n.close()
      continue
    }
    if (nursingSessionAlerted.has(session.sessionKey)) continue

    const tag = `nursing-long-${session.babyId}`
    const existing = await self.registration.getNotifications({ tag })
    if (existing.length > 0) {
      nursingSessionAlerted.add(session.sessionKey)
      continue
    }

    const duration = formatDurationSince(elapsed)
    const side = session.side ? ` · ${session.side}` : ''
    await self.registration.showNotification(`${session.babyName} — nursing still active`, {
      body: `Timer running ${duration}${side}. Open Freifeed to stop the session.`,
      tag,
      data: { url: '/', babyId: session.babyId, sessionKey: session.sessionKey },
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    } as FeedNotificationOptions)
    nursingSessionAlerted.add(session.sessionKey)
    void notifyClientsNursingSessionAlerted(session.sessionKey)
  }
}

function startNursingSessionTimer() {
  stopNursingSessionTimer()
  nursingSessionTimer = setInterval(() => {
    void checkNursingSessionReminders()
  }, 15_000)
  void checkNursingSessionReminders()
}

async function syncNursingSessionReminderState(state: NursingSessionReminderState | null) {
  nursingSessionReminderState = state?.enabled ? state : null

  if (!nursingSessionReminderState || nursingSessionReminderState.sessions.length === 0) {
    stopNursingSessionTimer()
    await clearNursingSessionReminderNotifications()
    nursingSessionAlerted.clear()
    return
  }

  startNursingSessionTimer()
}

function startTick() {
  if (tickTimer !== undefined) return
  tickTimer = setInterval(() => {
    void tickUpdateNotifications()
  }, 1000)
}

async function clearFeedNotifications() {
  const existing = await self.registration.getNotifications()
  for (const n of existing) {
    if (n.tag?.startsWith('feed-progress-')) n.close()
  }
  alertedSessions.clear()
  lastFeedBodies.clear()
  dismissedSessions.clear()
}

async function shouldPlayAlert(feed: FeedNotify): Promise<boolean> {
  const session = sessionKey(feed)
  if (alertedSessions.has(session)) return false

  const tag = feedTag(feed.babyId)
  const existing = await self.registration.getNotifications({ tag })
  const match = existing.find((n) => n.data?.session === session)
  if (match) {
    alertedSessions.add(session)
    return false
  }

  return true
}

async function upsertFeedNotification(feed: FeedNotify, options: { allowAlert: boolean }) {
  const tag = feedTag(feed.babyId)
  const session = sessionKey(feed)

  // User dismissed this session — never recreate while it's still active.
  if (dismissedSessions.has(session)) return

  const elapsed = formatElapsed(feed.startAtIso)
  const body = feedBody(feed)
  const shouldAlert = options.allowAlert && (await shouldPlayAlert(feed))

  const existing = await self.registration.getNotifications({ tag })
  const matching = existing.find((n) => n.data?.session === session)

  // Tick refresh: notification may be gone after SW restart or OS cleanup — recreate silently.
  if (!shouldAlert && !matching) {
    dismissedSessions.delete(session)
    lastFeedBodies.delete(tag)
  } else if (lastFeedBodies.get(tag) === body) {
    return
  }

  const title = shouldAlert ? `${feed.babyName} — nursing` : `${feed.babyName} — ${elapsed}`

  const notificationOptions: FeedNotificationOptions = {
    body,
    tag,
    data: {
      url: '/',
      session,
      babyId: feed.babyId,
      feedingId: feed.id,
    },
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    silent: !shouldAlert,
    // Only renotify (sound/vibrate) on the initial alert. Tick updates
    // must NOT renotify or Wear OS will buzz on every refresh.
    renotify: shouldAlert,
    actions: [{ action: 'end-session', title: 'End session' }],
  }

  if (!shouldAlert) {
    notificationOptions.vibrate = []
  }

  await self.registration.showNotification(title, notificationOptions)
  lastFeedBodies.set(tag, body)
  if (shouldAlert) {
    alertedSessions.add(session)
  }
}

async function closeStaleNotifications() {
  const activeTags = new Set(activeFeeds.map((f) => feedTag(f.babyId)))
  const activeSessions = new Set(activeFeeds.map(sessionKey))

  // Drop dismissed entries whose session is no longer active.
  for (const s of [...dismissedSessions]) {
    if (!activeSessions.has(s)) dismissedSessions.delete(s)
  }

  const existing = await self.registration.getNotifications()
  for (const n of existing) {
    if (!n.tag?.startsWith('feed-progress-')) continue
    if (!activeTags.has(n.tag)) {
      const session = n.data?.session as string | undefined
      if (session) alertedSessions.delete(session)
      lastFeedBodies.delete(n.tag)
      n.close()
      continue
    }
    const session = n.data?.session as string | undefined
    if (session && !activeSessions.has(session)) {
      alertedSessions.delete(session)
      lastFeedBodies.delete(n.tag)
      n.close()
    }
  }
}

/** Feed list from the app — alert only when a baby newly starts nursing. */
async function syncFeedList(feeds: FeedNotify[]) {
  const prevByBaby = new Map(activeFeeds.map((f) => [f.babyId, f]))
  activeFeeds = feeds

  await closeStaleNotifications()

  if (activeFeeds.length === 0) {
    await clearFeedNotifications()
    stopTick()
    return
  }

  for (const feed of activeFeeds) {
    const prev = prevByBaby.get(feed.babyId)
    const isNewBaby = !prev
    const isNewSession =
      !prev || normalizeStartSecond(prev.startAtIso) !== normalizeStartSecond(feed.startAtIso)
    if (isNewBaby || isNewSession) {
      // Brand new session — drop any stale dismissal flag (different start time).
      dismissedSessions.delete(sessionKey(feed))
      await upsertFeedNotification(feed, { allowAlert: true })
    }
  }

  startTick()
  await tickUpdateNotifications()
}

/** Timer tick — replace notification body every second, never re-alert. */
async function tickUpdateNotifications() {
  if (activeFeeds.length === 0) return

  for (const feed of activeFeeds) {
    await upsertFeedNotification(feed, { allowAlert: false })
  }
}

self.addEventListener('message', (event) => {
  const data = event.data as {
    type?: string
    feeds?: FeedNotify[]
    enabled?: boolean
    thresholdMs?: number
    snoozeMinutes?: number
    babies?: ReminderBaby[]
    tracking?: Record<string, ReminderSessionState>
    medicines?: MedicineNotify[]
    alertFired?: Record<string, number>
    overdueFollowupsEnabled?: boolean
    overdueAlarms?: MedicineOverdueSyncAlarm[]
    alarms?: MilkExpiryAlarm[]
  }
  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (data?.type === 'SYNC_FEEDS' && Array.isArray(data.feeds)) {
    void syncFeedList(data.feeds)
  }
  if (data?.type === 'TICK_FEEDS') {
    if (activeFeeds.length > 0) {
      startTick()
      void tickUpdateNotifications()
    }
  }
  if (data?.type === 'CLEAR_FEEDS') {
    activeFeeds = []
    void clearFeedNotifications()
    stopTick()
  }
  if (data?.type === 'SYNC_REMINDERS') {
    void syncReminderState({
      enabled: !!data.enabled,
      thresholdMs: Number(data.thresholdMs) || 0,
      snoozeMinutes: Number(data.snoozeMinutes) || 15,
      babies: Array.isArray(data.babies) ? data.babies : [],
      feedingInProgressBabyIds: Array.isArray(
        (data as { feedingInProgressBabyIds?: string[] }).feedingInProgressBabyIds,
      )
        ? (data as { feedingInProgressBabyIds: string[] }).feedingInProgressBabyIds
        : [],
      tracking:
        data.tracking && typeof data.tracking === 'object'
          ? (data.tracking as Record<string, ReminderSessionState>)
          : {},
    })
  }
  if (data?.type === 'CLEAR_REMINDERS') {
    void syncReminderState(null)
  }
  if (data?.type === 'SYNC_NURSING_SESSION_REMINDERS') {
    void syncNursingSessionReminderState({
      enabled: !!data.enabled,
      thresholdMs: Number((data as { thresholdMs?: number }).thresholdMs) || 0,
      sessions: Array.isArray((data as { sessions?: NursingSessionReminderNotify[] }).sessions)
        ? (data as { sessions: NursingSessionReminderNotify[] }).sessions
        : [],
    })
  }
  if (data?.type === 'CLEAR_NURSING_SESSION_REMINDERS') {
    void syncNursingSessionReminderState(null)
  }
  if (data?.type === 'SYNC_MEDICINES' && Array.isArray(data.medicines)) {
    void syncMedicineList(
      data.medicines,
      data.alertFired,
      !!data.overdueFollowupsEnabled,
      Array.isArray(data.overdueAlarms) ? data.overdueAlarms : [],
    )
  }
  if (data?.type === 'CLEAR_MEDICINES') {
    activeMedicines = []
    activeMedicineOverdueAlarms = []
    medicineOverdueFollowupsEnabled = false
    void clearMedicineNotifications()
    stopMedicineTimer()
  }
  if (data?.type === 'SYNC_MILK_EXPIRATION' && Array.isArray(data.alarms)) {
    void syncMilkExpiryList(data.alarms)
  }
  if (data?.type === 'CLEAR_MILK_EXPIRATION') {
    activeMilkAlarms = []
    void clearMilkExpiryNotifications()
    stopMilkExpiryTimer()
  }
})

self.addEventListener('notificationclose', (event) => {
  const tag = event.notification.tag
  if (!tag?.startsWith('feed-progress-')) {
    if (tag?.startsWith('reminder-')) {
      const data = event.notification.data ?? {}
      const babyId = (data as { babyId?: string }).babyId
      const lastStartIso = (data as { lastStartIso?: string }).lastStartIso
      if (babyId && lastStartIso) {
        event.waitUntil(postReminderActionToClients('FEED_REMINDER_DISMISS', babyId, lastStartIso))
      }
    }
    return
  }
  const session = event.notification.data?.session as string | undefined
  if (session) dismissedSessions.add(session)
  lastFeedBodies.delete(tag)
})

self.addEventListener('notificationclick', (event) => {
  const action = (event as NotificationEvent).action
  const data = event.notification.data ?? {}
  const tag = event.notification.tag ?? ''
  const isMedicine = tag.startsWith('medicine-')
  const medicineId = (data as { medicineId?: string }).medicineId

  event.notification.close()

  if (tag.startsWith('feed-progress-') && action === 'end-session') {
    const babyId = (data as { babyId?: string }).babyId
    const feedingId = (data as { feedingId?: string }).feedingId
    if (!babyId) return
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
        if (clientList.length > 0) {
          for (const client of clientList) {
            client.postMessage({ type: 'FEED_END_SESSION', babyId, feedingId })
          }
          return
        }
        await self.clients.openWindow('/')
      }),
    )
    return
  }

  if (tag.startsWith('reminder-')) {
    const babyId = (data as { babyId?: string }).babyId
    const lastStartIso = (data as { lastStartIso?: string }).lastStartIso
    if (babyId && lastStartIso) {
      if (action === 'dismiss') {
        event.waitUntil(postReminderActionToClients('FEED_REMINDER_DISMISS', babyId, lastStartIso))
        return
      }
      if (action === 'snooze') {
        event.waitUntil(postReminderActionToClients('FEED_REMINDER_SNOOZE', babyId, lastStartIso))
        return
      }
    }
  }

  if (isMedicine && action === 'mark-taken' && medicineId) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
        if (clientList.length > 0) {
          for (const client of clientList) {
            client.postMessage({ type: 'MEDICINE_TAKEN', medicineId })
          }
          return
        }
        await self.clients.openWindow(`/?view=medicines&taken=${encodeURIComponent(medicineId)}`)
      }),
    )
    return
  }

  const url = (data.url as string) ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (isMedicine) client.postMessage({ type: 'MEDICINE_FOCUS', medicineId })
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
