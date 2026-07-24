import { getMedicineAlertFiredForSync } from './medicineAlertState'
import { isNativeCapacitor } from './platform'
import { buildMedicineOverdueFollowups, isMedicineActiveNow } from './medicineSchedule'
import { timestampToDate } from './time'
import type { Medicine } from '../types'

const ENABLED_KEY = 'freifeed-medicine-notifications-enabled'
const OVERDUE_KEY = 'freifeed-medicine-overdue-followups-enabled'

export interface MedicineNotifyPayload {
  id: string
  forPersonId: string
  name: string
  totalPills: number
  dosage: string
  category: Medicine['category']
  type: Medicine['frequency']['type']
  times: string[]
  intervalHours: number | null
  startedAtIso: string | null
  lastTakenAtIso: string | null
}

export function areMedicineNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setMedicineNotificationsEnabled(enabled: boolean) {
  localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false')
  if (!enabled) {
    void import('./notificationPlatform').then((m) => m.clearMedicineRemindersWhenDisabled())
  }
}

export function areMedicineOverdueFollowupsEnabled(): boolean {
  try {
    if (!areMedicineNotificationsEnabled()) return false
    return localStorage.getItem(OVERDUE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setMedicineOverdueFollowupsEnabled(enabled: boolean) {
  localStorage.setItem(OVERDUE_KEY, enabled ? 'true' : 'false')
  window.dispatchEvent(new Event('freifeed-medicine-overdue-changed'))
}

export function buildMedicineNotifyPayload(medicines: Medicine[]): MedicineNotifyPayload[] {
  const now = new Date()
  const out: MedicineNotifyPayload[] = []
  for (const m of medicines) {
    if (!isMedicineActiveNow(m, now)) continue
    const started = timestampToDate(m.startedAt)
    const lastTaken = timestampToDate(m.lastTakenAt)
    out.push({
      id: m.id,
      forPersonId: m.forPersonId,
      name: m.name,
      totalPills: m.totalPills,
      dosage: m.dosage,
      category: m.category,
      type: m.frequency.type,
      times: m.frequency.times,
      intervalHours: m.frequency.intervalHours,
      startedAtIso: started?.toISOString() ?? null,
      lastTakenAtIso: lastTaken?.toISOString() ?? null,
    })
  }
  return out
}

export interface MedicineOverdueSyncAlarm {
  medicineId: string
  atMs: number
  title: string
  body: string
  slotDueMs: number
  kind: string
}

export function buildMedicineOverdueSyncAlarms(medicines: Medicine[]): MedicineOverdueSyncAlarm[] {
  if (!areMedicineOverdueFollowupsEnabled()) return []
  const out: MedicineOverdueSyncAlarm[] = []
  for (const m of medicines) {
    for (const a of buildMedicineOverdueFollowups(m)) {
      out.push({
        medicineId: a.medicineId,
        atMs: a.atMs,
        title: a.title,
        body: a.body,
        slotDueMs: a.slotDueMs,
        kind: a.kind,
      })
    }
  }
  return out
}

export async function syncMedicinesToServiceWorker(
  payload: MedicineNotifyPayload[],
  overdueFollowupsEnabled = areMedicineOverdueFollowupsEnabled(),
  medicinesForOverdue: Medicine[] = [],
): Promise<void> {
  if (isNativeCapacitor() || !('serviceWorker' in navigator)) return
  const overdueAlarms = overdueFollowupsEnabled
    ? buildMedicineOverdueSyncAlarms(medicinesForOverdue)
    : []
  try {
    const reg = await navigator.serviceWorker.ready
    const msg =
      payload.length > 0
        ? {
            type: 'SYNC_MEDICINES' as const,
            medicines: payload,
            alertFired: getMedicineAlertFiredForSync(),
            overdueFollowupsEnabled,
            overdueAlarms,
          }
        : { type: 'CLEAR_MEDICINES' as const }
    const target = navigator.serviceWorker.controller ?? reg.active
    target?.postMessage(msg)
  } catch {
    /* SW not ready */
  }
}
