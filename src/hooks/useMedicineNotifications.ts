import { useEffect, useRef, useState } from 'react'
import {
  areMedicineNotificationsEnabled,
  areMedicineOverdueFollowupsEnabled,
  buildMedicineNotifyPayload,
  syncMedicinesToServiceWorker,
} from '../lib/medicineNotifications'
import { filterMedicinesForDeviceNotifications } from '../lib/medicineSubjects'
import { ensureNotificationPermission } from '../lib/feedNotifications'
import {
  clearNativeMedicineNotifications,
  ensureNativeNotificationPermission,
  syncMedicineDueAlerts,
  syncNativeMedicineNotifications,
} from '../lib/nativeNotifications'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import { isMedicineActiveNow, mostRecentDueAtMs } from '../lib/medicineSchedule'
import { timestampToDate } from '../lib/time'
import type { Medicine } from '../types'

interface UseMedicineNotificationsOptions {
  householdId: string | null
  medicines: Medicine[]
  medicinesLoading: boolean
  enabled: boolean
}

function scheduleSignature(payload: ReturnType<typeof buildMedicineNotifyPayload>): string {
  return JSON.stringify(
    payload
      .map((m) => [
        m.id,
        m.forPersonId,
        m.name,
        m.category,
        m.type,
        m.intervalHours,
        m.startedAtIso,
        m.lastTakenAtIso,
        [...m.times].sort(),
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  )
}

function dueAlertSignature(medicines: Medicine[]): string {
  const now = new Date()
  return JSON.stringify(
    medicines
      .filter((m) => isMedicineActiveNow(m, now))
      .map((m) => {
        const due = mostRecentDueAtMs(m, now)
        const last = timestampToDate(m.lastTakenAt)?.getTime() ?? null
        return [m.id, m.category, last, due]
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  )
}

export function useMedicineNotifications({
  householdId,
  medicines,
  medicinesLoading,
  enabled,
}: UseMedicineNotificationsOptions) {
  const lastScheduleSignatureRef = useRef('')
  const lastDueSignatureRef = useRef('')
  const [prefsTick, setPrefsTick] = useState(0)
  const [scheduleDirtyTick, setScheduleDirtyTick] = useState(0)

  useEffect(() => {
    const bump = () => setPrefsTick((n) => n + 1)
    const onScheduleDirty = () => {
      lastScheduleSignatureRef.current = ''
      lastDueSignatureRef.current = ''
      setScheduleDirtyTick((n) => n + 1)
    }
    window.addEventListener('freifeed-medicine-watch-changed', bump)
    window.addEventListener('freifeed-medicine-overdue-changed', bump)
    window.addEventListener('freifeed-medicines-schedule-dirty', onScheduleDirty)
    return () => {
      window.removeEventListener('freifeed-medicine-watch-changed', bump)
      window.removeEventListener('freifeed-medicine-overdue-changed', bump)
      window.removeEventListener('freifeed-medicines-schedule-dirty', onScheduleDirty)
    }
  }, [])

  useEffect(() => {
    const native = usesNativeNotifications()

    if (!householdId || !enabled || !areMedicineNotificationsEnabled()) {
      lastScheduleSignatureRef.current = ''
      lastDueSignatureRef.current = ''
      if (native) void clearNativeMedicineNotifications()
      else void syncMedicinesToServiceWorker([])
      return
    }

    // Firestore load starts with medicines=[] — syncing then wipes alert-fired state.
    if (medicinesLoading) return

    let cancelled = false

    const run = async () => {
      const perm = native
        ? (await ensureNativeNotificationPermission()) ? 'granted' : 'denied'
        : await ensureNotificationPermission()
      if (cancelled || perm !== 'granted') {
        if (perm !== 'granted') {
          lastScheduleSignatureRef.current = ''
          lastDueSignatureRef.current = ''
          if (native) void clearNativeMedicineNotifications()
          else void syncMedicinesToServiceWorker([])
        }
        return
      }

      if (medicines.length === 0) {
        lastScheduleSignatureRef.current = ''
        lastDueSignatureRef.current = ''
        if (native) void clearNativeMedicineNotifications()
        else void syncMedicinesToServiceWorker([])
        return
      }

      const watched = filterMedicinesForDeviceNotifications(householdId, medicines)
      const payload = buildMedicineNotifyPayload(watched)
      const scheduleSig = JSON.stringify([
        scheduleSignature(payload),
        areMedicineOverdueFollowupsEnabled(),
        prefsTick,
      ])
      const dueSig = dueAlertSignature(watched)

      if (scheduleSig !== lastScheduleSignatureRef.current) {
        lastScheduleSignatureRef.current = scheduleSig
        if (native) {
          await syncNativeMedicineNotifications(watched)
        } else {
          await syncMedicinesToServiceWorker(
            payload,
            areMedicineOverdueFollowupsEnabled(),
            watched,
          )
        }
      }

      if (dueSig !== lastDueSignatureRef.current) {
        lastDueSignatureRef.current = dueSig
        if (native) {
          await syncMedicineDueAlerts(watched)
        } else {
          await syncMedicinesToServiceWorker(
            payload,
            areMedicineOverdueFollowupsEnabled(),
            watched,
          )
        }
      }
    }

    void run()
    const interval = window.setInterval(() => void run(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [householdId, medicines, medicinesLoading, enabled, prefsTick, scheduleDirtyTick])
}
