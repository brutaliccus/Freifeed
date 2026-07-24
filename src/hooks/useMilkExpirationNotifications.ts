import { useEffect, useRef } from 'react'
import { buildMilkExpirationAlarms } from '../lib/milkExpiration'
import { areMilkExpirationNotificationsEnabled } from '../lib/milkExpirationNotifications'
import { ensureNotificationPermission } from '../lib/feedNotifications'
import {
  clearNativeMilkExpirationNotifications,
  ensureNativeNotificationPermission,
  fireNativeMilkExpirationDueAlerts,
  syncNativeMilkExpirationSchedule,
  syncNativeMilkExpirationNotifications,
} from '../lib/nativeNotifications'
import { syncMilkExpirationToServiceWorker } from '../lib/milkExpirationNotifications'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import type { MilkLot } from '../types'

function alarmSignature(alarms: ReturnType<typeof buildMilkExpirationAlarms>): string {
  return JSON.stringify(alarms.map((a) => [a.lotId, a.kind, a.atMs]))
}

function dueAlarmSignature(alarms: ReturnType<typeof buildMilkExpirationAlarms>): string {
  const nowMs = Date.now()
  return JSON.stringify(
    alarms.filter((a) => a.atMs <= nowMs).map((a) => [a.lotId, a.kind, a.atMs]),
  )
}

interface UseMilkExpirationNotificationsOptions {
  householdId: string | null
  lots: MilkLot[]
  lotsLoading: boolean
  enabled: boolean
}

export function useMilkExpirationNotifications({
  householdId,
  lots,
  lotsLoading,
  enabled,
}: UseMilkExpirationNotificationsOptions) {
  const lastScheduleSignatureRef = useRef('')
  const lastDueSignatureRef = useRef('')
  const lotsRef = useRef(lots)
  lotsRef.current = lots

  useEffect(() => {
    const native = usesNativeNotifications()

    if (
      !householdId ||
      !enabled ||
      !areMilkExpirationNotificationsEnabled()
    ) {
      lastScheduleSignatureRef.current = ''
      lastDueSignatureRef.current = ''
      if (native) void clearNativeMilkExpirationNotifications()
      else void syncMilkExpirationToServiceWorker([])
      return
    }

    if (lotsLoading) return

    let cancelled = false
    let intervalId: number | undefined

    const run = async () => {
      const perm = native
        ? (await ensureNativeNotificationPermission()) ? 'granted' : 'denied'
        : await ensureNotificationPermission()
      if (cancelled || perm !== 'granted') {
        if (perm !== 'granted') {
          lastScheduleSignatureRef.current = ''
          lastDueSignatureRef.current = ''
          if (native) void clearNativeMilkExpirationNotifications()
          else void syncMilkExpirationToServiceWorker([])
        }
        return
      }

      const alarms = buildMilkExpirationAlarms(lots)
      const scheduleSig = alarmSignature(alarms)
      const dueSig = dueAlarmSignature(alarms)

      if (native) {
        if (scheduleSig !== lastScheduleSignatureRef.current) {
          lastScheduleSignatureRef.current = scheduleSig
          await syncNativeMilkExpirationSchedule(lots)
        }
        if (dueSig !== lastDueSignatureRef.current) {
          lastDueSignatureRef.current = dueSig
          await fireNativeMilkExpirationDueAlerts(lots)
        }
      } else {
        lastScheduleSignatureRef.current = scheduleSig
        lastDueSignatureRef.current = dueSig
        await syncMilkExpirationToServiceWorker(lots)
      }
    }

    void run()
    intervalId = window.setInterval(() => void run(), 60_000)

    return () => {
      cancelled = true
      if (intervalId !== undefined) window.clearInterval(intervalId)
    }
  }, [householdId, lots, lotsLoading, enabled])

  useEffect(() => {
    if (!householdId || !enabled || !areMilkExpirationNotificationsEnabled()) return

    const resync = () => {
      if (document.visibilityState !== 'visible') return
      if (usesNativeNotifications()) {
        lastScheduleSignatureRef.current = ''
        lastDueSignatureRef.current = ''
        void syncNativeMilkExpirationNotifications(lotsRef.current)
      } else {
        void syncMilkExpirationToServiceWorker(lotsRef.current)
      }
    }

    document.addEventListener('visibilitychange', resync)
    if (!usesNativeNotifications()) {
      navigator.serviceWorker?.addEventListener('controllerchange', resync)
    }

    return () => {
      document.removeEventListener('visibilitychange', resync)
      navigator.serviceWorker?.removeEventListener('controllerchange', resync)
    }
  }, [householdId, enabled])
}
