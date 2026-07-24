import { useCallback, useEffect, useRef } from 'react'
import type { ActiveFeedDraft } from '../lib/activeFeedSession'
import {
  buildFeedReminderPayload,
  getFeedReminderSettings,
  syncFeedRemindersToServiceWorker,
} from '../lib/feedReminders'
import { ensureNotificationPermission } from '../lib/feedNotifications'
import {
  ensureNativeNotificationPermission,
  syncNativeFeedReminders,
} from '../lib/nativeNotifications'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import type { Baby, Feeding } from '../types'

interface UseFeedRemindersOptions {
  householdId: string | null
  feedings: Feeding[]
  babies: Baby[]
  localSessions: ActiveFeedDraft[]
}

export function useFeedReminders({
  householdId,
  feedings,
  babies,
  localSessions,
}: UseFeedRemindersOptions) {
  const settingsRef = useRef(getFeedReminderSettings())

  const syncReminders = useCallback(async () => {
    const native = usesNativeNotifications()

    if (!householdId) {
      if (native) void syncNativeFeedReminders(null)
      else void syncFeedRemindersToServiceWorker(null)
      return
    }

    const settings = getFeedReminderSettings()
    settingsRef.current = settings

    if (!settings.enabled || settings.hours * 60 + settings.minutes <= 0) {
      if (native) void syncNativeFeedReminders(null)
      else void syncFeedRemindersToServiceWorker(null)
      return
    }

    const perm = native
      ? (await ensureNativeNotificationPermission()) ? 'granted' : 'denied'
      : await ensureNotificationPermission()
    if (perm !== 'granted') {
      if (native) void syncNativeFeedReminders(null)
      else void syncFeedRemindersToServiceWorker(null)
      return
    }

    const payload = buildFeedReminderPayload(feedings, babies, localSessions)
    if (native) {
      await syncNativeFeedReminders(payload)
    } else {
      await syncFeedRemindersToServiceWorker(payload)
    }
  }, [householdId, feedings, babies, localSessions])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === 'freifeed-feed-reminder-enabled' ||
        event.key === 'freifeed-feed-reminder-hours' ||
        event.key === 'freifeed-feed-reminder-minutes' ||
        event.key === 'freifeed-feed-reminder-snooze-minutes' ||
        event.key === 'freifeed-feed-reminder-tracking'
      ) {
        settingsRef.current = getFeedReminderSettings()
        void syncReminders()
      }
    }
    const onReminderState = () => {
      void syncReminders()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('freifeed-reminder-state-changed', onReminderState)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('freifeed-reminder-state-changed', onReminderState)
    }
  }, [syncReminders])

  useEffect(() => {
    void syncReminders()
    const interval = window.setInterval(() => void syncReminders(), 60_000)
    return () => window.clearInterval(interval)
  }, [syncReminders])
}
