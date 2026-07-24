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

export function useNursingSessionReminders({
  householdId,
  feedings,
  babies,
  localSessions,
}: UseNursingSessionRemindersOptions) {
  const feedingsRef = useRef(feedings)
  const babiesRef = useRef(babies)
  const localSessionsRef = useRef(localSessions)
  feedingsRef.current = feedings
  babiesRef.current = babies
  localSessionsRef.current = localSessions

  const syncReminders = useCallback(async () => {
    const native = usesNativeNotifications()

    if (!householdId || !getNursingSessionReminderEnabled()) {
      if (native) void syncNativeNursingSessionReminders(null)
      else void syncNursingSessionRemindersToServiceWorker(null)
      return
    }

    const payload = buildNursingSessionReminderPayload(
      feedingsRef.current,
      babiesRef.current,
      localSessionsRef.current,
    )

    const activeKeys = new Set(payload.sessions.map((s) => s.sessionKey))
    pruneNursingSessionReminderAlerts(activeKeys)

    if (!payload.enabled || payload.sessions.length === 0) {
      if (native) void syncNativeNursingSessionReminders(null)
      else void syncNursingSessionRemindersToServiceWorker(null)
      return
    }

    const perm = native
      ? (await ensureNativeNotificationPermission()) ? 'granted' : 'denied'
      : await ensureNotificationPermission()
    if (perm !== 'granted') {
      if (native) void syncNativeNursingSessionReminders(null)
      else void syncNursingSessionRemindersToServiceWorker(null)
      return
    }

    if (native) {
      await syncNativeNursingSessionReminders(payload)
    } else {
      await syncNursingSessionRemindersToServiceWorker(payload)
    }
  }, [householdId])

  useEffect(() => {
    return subscribeNursingSessionReminderSettings(() => {
      void syncReminders()
    })
  }, [syncReminders])

  useEffect(() => {
    void syncReminders()
    const interval = window.setInterval(() => void syncReminders(), 15_000)
    return () => window.clearInterval(interval)
  }, [syncReminders])
}
