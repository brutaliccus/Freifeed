import { areFeedNotificationsEnabled } from './feedNotifications'
import { buildMilkExpirationAlarms, type MilkExpirationAlarm } from './milkExpiration'
import { isNativeCapacitor } from './platform'
import type { MilkLot } from '../types'

export function areMilkExpirationNotificationsEnabled(): boolean {
  return areFeedNotificationsEnabled()
}

export function buildMilkExpirationNotifyPayload(lots: MilkLot[]): MilkExpirationAlarm[] {
  return buildMilkExpirationAlarms(lots)
}

export async function syncMilkExpirationToServiceWorker(lots: MilkLot[]): Promise<void> {
  if (isNativeCapacitor() || !('serviceWorker' in navigator)) return
  if (!areMilkExpirationNotificationsEnabled()) {
    try {
      const reg = await navigator.serviceWorker.ready
      const target = navigator.serviceWorker.controller ?? reg.active
      target?.postMessage({ type: 'CLEAR_MILK_EXPIRATION' as const })
    } catch {
      /* SW not ready */
    }
    return
  }

  const alarms = buildMilkExpirationNotifyPayload(lots)
  try {
    const reg = await navigator.serviceWorker.ready
    const msg =
      alarms.length > 0
        ? { type: 'SYNC_MILK_EXPIRATION' as const, alarms }
        : { type: 'CLEAR_MILK_EXPIRATION' as const }
    const target = navigator.serviceWorker.controller ?? reg.active
    target?.postMessage(msg)
  } catch {
    /* SW not ready */
  }
}
