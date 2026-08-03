import { useCallback, useEffect, useRef } from 'react'
import type { ActiveFeedDraft } from '../lib/activeFeedSession'
import { ensureNotificationPermission } from '../lib/feedNotifications'
import {
  buildNursingSessionReminderPayload,
  syncNursingSessionRemindersToServiceWorker,
} from '../lib/nursingSessionReminders'
import {
  getNursingSessionReminderEnabled,
  subscribeNursingSessionReminderSettings,
} from '../lib/nursingSessionReminderSettings'
import { pruneNursingSessionReminderAlerts } from '../lib/nursingSessionReminderState'
import {
  ensureNativeNotificationPermission,
  syncNativeNursingSessionReminders,
} from '../lib/nativeNotifications'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import type { Baby, Feeding } from '../types'

interface UseNursingSessionRemindersOptions {
  householdId: string | null
  feedings: Feeding[]
  babies: Baby[]
  localSessions: ActiveFeedDraft[]
}

function payloadSignature(
  payload: ReturnType<typeof buildNursingSessionReminderPayload>,
): string {
  return JSON.stringify({
    enabled: payload.enabled,
    thresholdMs: payload.thresholdMs,
    sessions: payload.sessions.map((s) => [s.sessionKey, s.startAtIso, s.babyName, s.side]),
    alertedKeys: [...payload.alertedKeys].sort(),
  })
}

export function useNursingSessionReminders({
  householdId,
  feedings,
  babies,
  localSessions,
}: UseNursingSessionRemindersOptions) {
  const lastSigRef = useRef('')

  const syncReminders = useCallback(async () => {
    const native = usesNativeNotifications()

    if (!householdId || !getNursingSessionReminderEnabled()) {
      lastSigRef.current = ''
      if (native) void syncNativeNursingSessionReminders(null)
      else void syncNursingSessionRemindersToServiceWorker(null)
      return
    }

    // Android: partner sessions are armed by FCM/FeedWatch. Only schedule owned
    // sessions from JS so we never adopt (then cancel) partner alarm ids.
    const ownedOnly = native
    const payload = buildNursingSessionReminderPayload(feedings, babies, localSessions, {
      ownedOnly,
    })

    const activeKeys = new Set(payload.sessions.map((s) => s.sessionKey))
    pruneNursingSessionReminderAlerts(activeKeys)

    // Rebuild after prune so alertedKeys stays accurate for the native scheduler.
    const next = buildNursingSessionReminderPayload(feedings, babies, localSessions, {
      ownedOnly,
    })
    const sig = payloadSignature(next)
    if (sig === lastSigRef.current) return
    lastSigRef.current = sig

    if (!next.enabled) {
      if (native) void syncNativeNursingSessionReminders(null)
      else void syncNursingSessionRemindersToServiceWorker(null)
      return
    }

    const perm = native
      ? (await ensureNativeNotificationPermission()) ? 'granted' : 'denied'
      : await ensureNotificationPermission()
    if (perm !== 'granted') {
      lastSigRef.current = ''
      if (native) void syncNativeNursingSessionReminders(null)
      else void syncNursingSessionRemindersToServiceWorker(null)
      return
    }

    // Sync even when sessions is empty so native can drop ended web-tracked
    // sessions without wiping partner-only FCM/poller alarms.
    if (native) {
      await syncNativeNursingSessionReminders(next)
    } else if (next.sessions.length === 0) {
      await syncNursingSessionRemindersToServiceWorker(null)
    } else {
      await syncNursingSessionRemindersToServiceWorker(next)
    }
  }, [householdId, feedings, babies, localSessions])

  useEffect(() => {
    return subscribeNursingSessionReminderSettings(() => {
      lastSigRef.current = ''
      void syncReminders()
    })
  }, [syncReminders])

  useEffect(() => {
    void syncReminders()
    // Backup poll in case a session starts while the tab is backgrounded and refs lag.
    const interval = window.setInterval(() => void syncReminders(), 30_000)
    return () => window.clearInterval(interval)
  }, [syncReminders])
}
