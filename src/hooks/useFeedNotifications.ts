import { useCallback, useEffect, useRef } from 'react'
import type { ActiveFeedDraft } from '../lib/activeFeedSession'
import {
  areFeedNotificationsEnabled,
  buildFeedNotificationPayload,
  ensureNotificationPermission,
  syncFeedNotificationsToServiceWorker,
} from '../lib/feedNotifications'
import {
  clearFeedSessionAlertsForBaby,
  feedSessionAlertKey,
  markFeedSessionAlerted,
} from '../lib/feedAlertState'
import { FeedWatchNative } from '../lib/feedWatchNative'
import {
  bootstrapNativePartnerFeedWatch,
  clearNativeFeedNotifications,
  dismissNativeFeedForBaby,
  ensureNativeNotificationPermission,
  syncNativeFeedNotifications,
  syncNativeFeedWatch,
} from '../lib/nativeNotifications'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import type { Baby, BabyId, Feeding } from '../types'

interface UseFeedNotificationsOptions {
  householdId: string | null
  feedings: Feeding[]
  babies: Baby[]
  localSessions: ActiveFeedDraft[]
  enabled: boolean
  /** Refetch feedings once when partner session starts/ends (FCM → native bridge). */
  onPartnerFeedUpdate?: () => void | Promise<void>
  /** Clear in-progress feedings locally before refetch (stops re-showing native chronometer). */
  onPartnerFeedEnded?: (babyId: BabyId, feedingId?: string) => void
  /** Show partner in-progress feed in-app before listFeedings returns. */
  onPartnerFeedStarted?: (opts: {
    babyId: BabyId
    feedingId: string
    startAtMs: number
    side?: string | null
  }) => void
}

function payloadSignature(feeds: ReturnType<typeof buildFeedNotificationPayload>): string {
  return JSON.stringify(
    feeds
      .map((f) => [f.babyId, f.id, f.side, f.startAtIso])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  )
}

/** Refresh native auth token for FCM registration (not feed polling). */
const WATCH_AUTH_REFRESH_MS = 25 * 60 * 1000

export function useFeedNotifications({
  householdId,
  feedings,
  babies,
  localSessions,
  enabled,
  onPartnerFeedUpdate,
  onPartnerFeedEnded,
  onPartnerFeedStarted,
}: UseFeedNotificationsOptions) {
  const permissionRef = useRef<NotificationPermission | 'unsupported' | 'pending'>('pending')
  const lastSignatureRef = useRef('')
  const feedingsRef = useRef(feedings)
  const babiesRef = useRef(babies)
  const localSessionsRef = useRef(localSessions)
  const householdIdRef = useRef(householdId)
  const onPartnerFeedUpdateRef = useRef(onPartnerFeedUpdate)
  const onPartnerFeedEndedRef = useRef(onPartnerFeedEnded)
  const onPartnerFeedStartedRef = useRef(onPartnerFeedStarted)
  feedingsRef.current = feedings
  babiesRef.current = babies
  localSessionsRef.current = localSessions
  householdIdRef.current = householdId
  onPartnerFeedUpdateRef.current = onPartnerFeedUpdate
  onPartnerFeedEndedRef.current = onPartnerFeedEnded
  onPartnerFeedStartedRef.current = onPartnerFeedStarted

  const pushFeedSync = useCallback(async () => {
    if (permissionRef.current !== 'granted') return
    const payload = buildFeedNotificationPayload(
      feedingsRef.current,
      babiesRef.current,
      localSessionsRef.current,
    )
    if (usesNativeNotifications()) {
      await syncNativeFeedNotifications(payload)
    } else {
      await syncFeedNotificationsToServiceWorker(payload)
    }
  }, [])

  const refreshWatchAuth = useCallback(async () => {
    const hid = householdIdRef.current
    if (!hid || !usesNativeNotifications()) return
    const payload = buildFeedNotificationPayload(
      feedingsRef.current,
      babiesRef.current,
      localSessionsRef.current,
    )
    await syncNativeFeedWatch(hid, payload, true)
  }, [])

  const handlePartnerFeedEvent = useCallback(async () => {
    await onPartnerFeedUpdateRef.current?.()
  }, [])

  useEffect(() => {
    const native = usesNativeNotifications()

    if (!householdId || !enabled || !areFeedNotificationsEnabled()) {
      lastSignatureRef.current = ''
      if (native) void clearNativeFeedNotifications()
      else void syncFeedNotificationsToServiceWorker([])
      if (native && householdId) void syncNativeFeedWatch(householdId, [], false)
      return
    }

    let cancelled = false
    let tickInterval: number | undefined

    const run = async () => {
      const perm = native
        ? (await ensureNativeNotificationPermission()) ? 'granted' : 'denied'
        : await ensureNotificationPermission()
      permissionRef.current = perm
      if (cancelled || perm !== 'granted') {
        if (perm !== 'granted') {
          lastSignatureRef.current = ''
          if (native) void clearNativeFeedNotifications()
          else void syncFeedNotificationsToServiceWorker([])
          if (native && householdId) void syncNativeFeedWatch(householdId, [], false)
        }
        return
      }

      const payload = buildFeedNotificationPayload(feedings, babies, localSessions)
      const signature = payloadSignature(payload)

      if (native) {
        await syncNativeFeedWatch(householdId, payload, true)
      }

      if (native) {
        if (signature !== lastSignatureRef.current) {
          lastSignatureRef.current = signature
          await syncNativeFeedNotifications(payload)
        }
      } else {
        // Always push to SW — it loses in-memory feed state on update/restart.
        lastSignatureRef.current = signature
        await syncFeedNotificationsToServiceWorker(payload)
      }

      if (payload.length > 0 && !native) {
        tickInterval = window.setInterval(() => {
          void pushFeedSync()
        }, 1000)
      }
    }

    void run()

    const watchAuthInterval = native
      ? window.setInterval(() => void refreshWatchAuth(), WATCH_AUTH_REFRESH_MS)
      : undefined

    return () => {
      cancelled = true
      if (watchAuthInterval !== undefined) window.clearInterval(watchAuthInterval)
      if (tickInterval !== undefined) window.clearInterval(tickInterval)
    }
  }, [householdId, feedings, babies, localSessions, enabled, refreshWatchAuth, pushFeedSync])

  useEffect(() => {
    if (!householdId || !enabled || !areFeedNotificationsEnabled()) return
    if (usesNativeNotifications()) return

    const resync = () => {
      if (document.visibilityState === 'visible') void pushFeedSync()
    }

    document.addEventListener('visibilitychange', resync)
    navigator.serviceWorker?.addEventListener('controllerchange', resync)

    return () => {
      document.removeEventListener('visibilitychange', resync)
      navigator.serviceWorker?.removeEventListener('controllerchange', resync)
    }
  }, [householdId, enabled, pushFeedSync])

  useEffect(() => {
    if (!usesNativeNotifications() || !householdId || !enabled) return
    void bootstrapNativePartnerFeedWatch(householdId, feedings, babies, localSessions)
  }, [householdId, enabled])

  useEffect(() => {
    if (!usesNativeNotifications()) return
    let removeShown: (() => void) | undefined
    let removeEnded: (() => void) | undefined
    let removeResumed: (() => void) | undefined

    void FeedWatchNative.addListener('feedWatchShown', (event) => {
      if (!event.babyId || !Number.isFinite(event.startAtMs)) return
      if (event.feedingId) {
        onPartnerFeedStartedRef.current?.({
          babyId: event.babyId as BabyId,
          feedingId: event.feedingId,
          startAtMs: event.startAtMs,
        })
      }
      markFeedSessionAlerted(
        feedSessionAlertKey(event.babyId, new Date(event.startAtMs).toISOString()),
      )
      void handlePartnerFeedEvent()
    }).then((h) => {
      removeShown = () => h.remove()
    })

    void FeedWatchNative.addListener('feedWatchEnded', (event) => {
      if (!event.babyId) return
      onPartnerFeedEndedRef.current?.(event.babyId as BabyId, event.feedingId)
      clearFeedSessionAlertsForBaby(event.babyId)
      void (async () => {
        await dismissNativeFeedForBaby(event.babyId)
        await handlePartnerFeedEvent()
        // Follow-up fetch after Firestore write propagates (avoid stale list overwriting optimistic end).
        window.setTimeout(() => void handlePartnerFeedEvent(), 1_500)
      })()
    }).then((h) => {
      removeEnded = () => h.remove()
    })

    void FeedWatchNative.addListener('appResumed', () => {
      void handlePartnerFeedEvent()
      void refreshWatchAuth()
    }).then((h) => {
      removeResumed = () => h.remove()
    })

    return () => {
      removeShown?.()
      removeEnded?.()
      removeResumed?.()
    }
  }, [handlePartnerFeedEvent, refreshWatchAuth])
}
