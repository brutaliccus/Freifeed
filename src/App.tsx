import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAuth } from './hooks/useAuth'
import { useFeedings } from './hooks/useFeedings'
import { useBabies } from './hooks/useBabies'
import { useHousehold } from './hooks/useHousehold'
import { AppBrand } from './components/AppBrand'
import { LoginScreen } from './components/LoginScreen'
import { HouseholdScreen } from './components/HouseholdScreen'
import { PhotoOnboarding } from './components/PhotoOnboarding'
import { BabyOnboarding } from './components/BabyOnboarding'
import { FeedDrawer, type FeedDrawerMode } from './components/FeedDrawer'
import { FeedInProgressStack } from './components/FeedInProgressStack'
import { BottomNav } from './components/BottomNav'
import { PwaShell } from './components/PwaShell'
import { useActiveFeedSessions } from './hooks/useActiveFeedSessions'
import { useFeedNotifications } from './hooks/useFeedNotifications'
import { useFeedReminders } from './hooks/useFeedReminders'
import { useNursingSessionReminders } from './hooks/useNursingSessionReminders'
import { areFeedNotificationsEnabled } from './lib/feedNotifications'
import { areMedicineNotificationsEnabled } from './lib/medicineNotifications'
import { filterMedicinesForDeviceNotifications } from './lib/medicineSubjects'
import { isSessionInProgress } from './lib/activeFeedSession'
import { feedingToDraft } from './lib/feedingDraft'
import {
  remoteInProgressFeedings,
  isFeedingInProgress,
  findLocalSessionForFeeding,
  getInProgressFeedings,
  canStartTandemFeed,
  defaultBabyForTandem,
  defaultTandemSidePatch,
  isBabyNursingInProgress,
} from './lib/feedingProgress'
import { getSuggestedNursingSides, suggestedSidePatch } from './lib/sides'
import { isFeedingOwnedByThisDevice, pruneFeedingOwnership } from './lib/feedOwnership'
import { useMilkInventory } from './hooks/useMilkInventory'
import { useMedicines } from './hooks/useMedicines'
import { useMedicineNotifications } from './hooks/useMedicineNotifications'
import { useAppointmentNotifications } from './hooks/useAppointmentNotifications'
import { useMilkExpirationNotifications } from './hooks/useMilkExpirationNotifications'
import { MedicineDueBanner } from './components/MedicineDueBanner'
import { endActiveFeedFromNotification } from './lib/feedNotificationActions'
import { applyFeedReminderDismiss, applyFeedReminderSnooze, applyFeedReminderAlerted } from './lib/feedReminders'
import { markNursingSessionReminderAlerted } from './lib/nursingSessionReminderState'
import { registerNativeNotificationListeners } from './lib/nativeNotifications'
import { usesNativeNotifications } from './lib/notificationPlatform'
import { useAppUpdateNotification } from './hooks/useAppUpdateNotification'
import { AppUpdateBanner } from './components/AppUpdateBanner'
import { InAppBannerStack } from './components/InAppBannerStack'
import { AppWebUpdate } from './components/AppWebUpdate'
import { AppUpdateNative } from './lib/appUpdateNative'
import { fetchAndroidAppUpdateInfo, installAndroidAppUpdate, markApkInstalled } from './lib/appUpdate'
import { getApkReleaseKey, markApkUpdateAlertDismissed } from './lib/appUpdateAlertState'
import { isAndroidNative } from './lib/platform'
import { destroyHouseholdSubscriptions } from './lib/householdSubscriptions'
import { clearHouseholdCollectionCache } from './lib/householdCollectionCache'
import { initNativeGoogleAuth } from './lib/nativeGoogleAuth'
import { markMedicineTaken } from './lib/medicines'
import { HomePage } from './pages/HomePage'
import { MedicinesPage } from './pages/MedicinesPage'
import { MilkStoragePage } from './pages/MilkStoragePage'
import { DailyPage } from './pages/DailyPage'
import { WeeklyPage } from './pages/WeeklyPage'
import { ProfilePage } from './pages/ProfilePage'
import { DiapersPage } from './pages/DiapersPage'
import { DiaperWeeklyPage } from './pages/DiaperWeeklyPage'
import { MeasurementsPage } from './pages/MeasurementsPage'
import { NotesPage } from './pages/NotesPage'
import { DiaperFormModal } from './components/DiaperFormModal'
import { MeasurementFormModal } from './components/MeasurementFormModal'
import { NoteFormModal } from './components/NoteFormModal'
import { MedicineFormModal } from './components/MedicineFormModal'
import { QuickAddMilkSheet } from './components/QuickAddMilkSheet'
import { useDiapers } from './hooks/useDiapers'
import { useMeasurements } from './hooks/useMeasurements'
import { useNotes } from './hooks/useNotes'
import { SyncStatusBanner } from './components/SyncStatusBanner'
import { useSyncStatus } from './lib/syncStatus'
import { resolvePumpBabyId } from './lib/feedingTypes'
import { applyUiScale } from './lib/appPreferences'
import { applyAppThemeFromProfile } from './lib/theme'
import { defaultBabyForDiaper } from './lib/diapers'
import { babiesNeedPhotos } from './lib/household'
import { defaultMedicineForPersonId } from './lib/medicineSubjects'
import { babiesForHome, babiesForTracker, resolveNavTrackers } from './lib/trackers'
import type { AppView, Feeding, BabyId } from './types'
import type { ActiveFeedDraft } from './lib/activeFeedSession'

function App() {
  const {
    user,
    profile,
    loading,
    authError: profileAuthError,
    firestoreError,
    signIn,
    signOut,
    refreshProfile,
  } = useAuth()
  const householdId = profile?.householdId ?? null
  const prevHouseholdIdRef = useRef<string | null>(null)

  useEffect(() => {
    const prev = prevHouseholdIdRef.current
    if (prev && prev !== householdId) {
      destroyHouseholdSubscriptions(prev)
      clearHouseholdCollectionCache(prev)
    }
    if (!householdId) {
      destroyHouseholdSubscriptions()
      if (prev) clearHouseholdCollectionCache(prev)
    }
    prevHouseholdIdRef.current = householdId
  }, [householdId])

  const navTrackers = useMemo(() => resolveNavTrackers(profile), [profile])
  const {
    feedings,
    loading: feedingsLoading,
    error: feedingsError,
    refresh: refreshFeedings,
    loadMore: loadMoreFeedings,
    loadingMore: feedingsLoadingMore,
    hasMore: feedingsHasMore,
    daysLoaded: feedingsDaysLoaded,
    markPartnerFeedEnded,
    markPartnerFeedStarted,
  } = useFeedings(householdId)
  const { babies, loading: babiesLoading, error: babiesError, refresh: refreshBabies } = useBabies(householdId)
  const { household, refresh: refreshHousehold } = useHousehold(householdId)
  const {
    lots,
    summary,
    loading: milkLoading,
    error: milkError,
    refresh: refreshMilk,
  } = useMilkInventory(householdId)
  const { medicines, loading: medicinesLoading, error: medicinesError, refresh: refreshMedicines } = useMedicines(householdId)
  const {
    diapers,
    error: diapersError,
    refresh: refreshDiapers,
    loadMore: loadMoreDiapers,
    loadingMore: diapersLoadingMore,
    hasMore: diapersHasMore,
    daysLoaded: diapersDaysLoaded,
  } = useDiapers(householdId)
  const {
    measurements,
    error: measurementsError,
    refresh: refreshMeasurements,
    loadMore: loadMoreMeasurements,
    loadingMore: measurementsLoadingMore,
    hasMore: measurementsHasMore,
    daysLoaded: measurementsDaysLoaded,
  } = useMeasurements(householdId)
  const {
    notes,
    loading: notesLoading,
    error: notesError,
    refresh: refreshNotes,
    archiveNoteOptimistic,
    unarchiveNoteOptimistic,
    revertNoteOptimistic,
  } = useNotes(householdId)
  const allBabyIds = useMemo(() => babies.map((b) => b.id), [babies])
  const feedSessions = useActiveFeedSessions(householdId, allBabyIds, feedings, refreshFeedings, refreshMilk)
  const [notificationsEnabled, setNotificationsEnabled] = useState(areFeedNotificationsEnabled)
  const [medicineNotificationsEnabled, setMedicineNotificationsEnabled] = useState(
    areMedicineNotificationsEnabled,
  )
  const [medicineNotifPrefsRev, setMedicineNotifPrefsRev] = useState(0)

  useEffect(() => {
    const bump = () => setMedicineNotifPrefsRev((n) => n + 1)
    window.addEventListener('freifeed-medicine-watch-changed', bump)
    window.addEventListener('freifeed-medicine-overdue-changed', bump)
    return () => {
      window.removeEventListener('freifeed-medicine-watch-changed', bump)
      window.removeEventListener('freifeed-medicine-overdue-changed', bump)
    }
  }, [])

  // Feedings/diapers/milk/medicines/measurements/notes now update in real time via
  // Firestore onSnapshot listeners inside their hooks, so there's no polling or
  // sync-pulse refetch to coordinate here. `refreshAll` only nudges the remaining
  // callable-backed data (babies + household) — e.g. from the sync-error retry button.
  const refreshAll = useCallback(() => {
    void refreshBabies()
    void refreshHousehold()
  }, [refreshBabies, refreshHousehold])

  const sync = useSyncStatus([
    feedingsError,
    diapersError,
    measurementsError,
    navTrackers.notes ? notesError : null,
    medicinesError,
    milkError,
    babiesError,
  ])

  const medicinesForAlerts = useMemo(() => {
    if (!householdId) return []
    return filterMedicinesForDeviceNotifications(householdId, medicines)
  }, [householdId, medicines, medicineNotifPrefsRev])

  useFeedNotifications({
    householdId,
    feedings,
    babies,
    localSessions: feedSessions.sessions,
    enabled: notificationsEnabled,
    onPartnerFeedUpdate: refreshFeedings,
    onPartnerFeedEnded: markPartnerFeedEnded,
    onPartnerFeedStarted: markPartnerFeedStarted,
  })

  useMedicineNotifications({
    householdId,
    medicines,
    medicinesLoading,
    enabled: medicineNotificationsEnabled,
  })

  useMilkExpirationNotifications({
    householdId,
    lots,
    lotsLoading: milkLoading,
    enabled: notificationsEnabled,
  })

  useAppointmentNotifications({
    householdId,
    notes,
    notesLoading,
    babies,
    members: household?.memberProfiles ?? [],
    personNicknames: household?.personNicknames,
    enabled: notificationsEnabled && navTrackers.notes,
  })

  const [profileTabRequest, setProfileTabRequest] = useState<
    'babies' | 'notifications' | 'household' | 'application' | null
  >(null)
  const { pendingUpdate: appUpdatePending, recheckUpdate } = useAppUpdateNotification(!!user)
  const [appUpdateDownloading, setAppUpdateDownloading] = useState(false)

  const runAppUpdateDownload = useCallback(async () => {
    if (!isAndroidNative() || appUpdateDownloading) return
    setAppUpdateDownloading(true)
    try {
      const remote = appUpdatePending?.remote ?? (await fetchAndroidAppUpdateInfo())
      await installAndroidAppUpdate(remote)
      const releaseKey = appUpdatePending?.releaseKey ?? getApkReleaseKey(remote)
      if (releaseKey) markApkUpdateAlertDismissed(releaseKey)
      await AppUpdateNative.dismissUpdateNotification()
      void recheckUpdate()
    } catch {
      /* Profile → App shows errors if user opens settings */
    } finally {
      setAppUpdateDownloading(false)
    }
  }, [appUpdatePending, appUpdateDownloading, recheckUpdate])

  useEffect(() => {
    if (!isAndroidNative()) return
    const unsubs: Array<() => void> = []
    void AppUpdateNative.addListener('appUpdateDismissed', (event) => {
      if (event.releaseKey) markApkUpdateAlertDismissed(event.releaseKey)
    }).then((h) => unsubs.push(() => h.remove()))
    void AppUpdateNative.addListener('appUpdateRequested', () => {
      void runAppUpdateDownload()
    }).then((h) => unsubs.push(() => h.remove()))
    void AppUpdateNative.addListener('appUpdateNow', (event) => {
      void (async () => {
        try {
          const remote = await fetchAndroidAppUpdateInfo()
          markApkInstalled(remote.driveModifiedTime)
          if (event.releaseKey) markApkUpdateAlertDismissed(event.releaseKey)
        } catch {
          /* install may still proceed; Profile → App has the update */
        }
      })()
    }).then((h) => unsubs.push(() => h.remove()))
    return () => {
      for (const off of unsubs) off()
    }
  }, [runAppUpdateDownload])

  useEffect(() => {
    if (!householdId || usesNativeNotifications()) return
    if (!('serviceWorker' in navigator)) return
    const onMessage = async (event: MessageEvent) => {
      const data = event.data as {
        type?: string
        medicineId?: string
        babyId?: string
        feedingId?: string | null
        lastStartIso?: string
        sessionKey?: string
      }
      if (data?.type === 'MEDICINE_TAKEN' && data.medicineId) {
        try {
          await markMedicineTaken(householdId, data.medicineId, new Date())
          refreshMedicines()
        } catch {
          /* ignore — user can retry from the card */
        }
        return
      }
      if (data?.type === 'FEED_END_SESSION' && data.babyId) {
        try {
          await endActiveFeedFromNotification(
            { babyId: data.babyId as BabyId, feedingId: data.feedingId },
            {
              localSessions: feedSessions.sessions,
              feedings,
              stopTimer: feedSessions.stopTimer,
              stopFeedingRecord: feedSessions.stopFeedingRecord,
            },
          )
          refreshFeedings()
        } catch {
          /* ignore */
        }
        return
      }
      if (data?.type === 'FEED_REMINDER_DISMISS' && data.babyId && data.lastStartIso) {
        applyFeedReminderDismiss(data.babyId, data.lastStartIso)
        return
      }
      if (data?.type === 'FEED_REMINDER_SNOOZE' && data.babyId && data.lastStartIso) {
        applyFeedReminderSnooze(data.babyId, data.lastStartIso)
        return
      }
      if (data?.type === 'FEED_REMINDER_ALERTED' && data.babyId && data.lastStartIso) {
        applyFeedReminderAlerted(data.babyId, data.lastStartIso)
      }
      if (data?.type === 'NURSING_SESSION_REMINDER_ALERTED' && data.sessionKey) {
        markNursingSessionReminderAlerted(data.sessionKey)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [
    householdId,
    refreshMedicines,
    feedSessions.sessions,
    feedSessions.stopTimer,
    feedSessions.stopFeedingRecord,
    feedings,
    refreshFeedings,
  ])

  // Honor `?taken=<medicineId>` deep links from notification action clicks.
  useEffect(() => {
    if (!householdId) return
    const url = new URL(window.location.href)
    const takenId = url.searchParams.get('taken')
    if (!takenId) return
    url.searchParams.delete('taken')
    window.history.replaceState({}, '', url.toString())
    void (async () => {
      try {
        await markMedicineTaken(householdId, takenId, new Date())
        refreshMedicines()
      } catch {
        /* ignore */
      }
    })()
    if (url.searchParams.get('view') === 'medicines') {
      setView('medicines')
    }
  }, [householdId, refreshMedicines])

  useFeedReminders({
    householdId,
    feedings,
    babies,
    localSessions: feedSessions.sessions,
  })

  useNursingSessionReminders({
    householdId,
    feedings,
    babies,
    localSessions: feedSessions.sessions,
  })

  const [view, setView] = useState<AppView>('home')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSessionId, setDrawerSessionId] = useState<string | null>(null)
  const [drawerBootstrapDraft, setDrawerBootstrapDraft] = useState<ActiveFeedDraft | null>(null)
  const [drawerMode, setDrawerMode] = useState<FeedDrawerMode>('active')
  const [editDraft, setEditDraft] = useState<ActiveFeedDraft | null>(null)

  const [medicineDueDismissed, setMedicineDueDismissed] = useState(false)
  const [dailyJumpDate, setDailyJumpDate] = useState<Date | null>(null)
  const [diaperJumpDate, setDiaperJumpDate] = useState<Date | null>(null)
  const [homeDiaperModalOpen, setHomeDiaperModalOpen] = useState(false)
  const [homeMilkQuickAddOpen, setHomeMilkQuickAddOpen] = useState(false)
  const [homeMedicineAddOpen, setHomeMedicineAddOpen] = useState(false)
  const [homeMeasurementModalOpen, setHomeMeasurementModalOpen] = useState(false)
  const [homeNoteModalOpen, setHomeNoteModalOpen] = useState(false)
  const [notesExpandedPersonId, setNotesExpandedPersonId] = useState<string | null>(null)

  const nursingBabies = useMemo(() => babiesForTracker(babies, 'nursing'), [babies])
  const homeBabies = useMemo(() => babiesForHome(babies), [babies])
  const diaperBabies = useMemo(() => babiesForTracker(babies, 'diaper'), [babies])
  const medicineBabies = useMemo(() => babiesForTracker(babies, 'medicine'), [babies])
  const [signInError, setSignInError] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState<'babies' | 'photos'>('babies')
  const onboardingDismissed = useRef(false)

  const localInProgress = feedSessions.sessions.filter(isSessionInProgress)
  const remoteInProgress = useMemo(
    () => remoteInProgressFeedings(feedings, feedSessions.sessions),
    [feedings, feedSessions.sessions],
  )

  useEffect(() => {
    void initNativeGoogleAuth()
  }, [])

  useEffect(() => {
    const syncScale = () => applyUiScale(profile)
    syncScale()
    window.addEventListener('resize', syncScale)
    window.addEventListener('orientationchange', syncScale)
    return () => {
      window.removeEventListener('resize', syncScale)
      window.removeEventListener('orientationchange', syncScale)
    }
  }, [profile?.uiScale])

  useEffect(() => {
    applyAppThemeFromProfile(profile)
  }, [profile?.appTheme, profile])

  useEffect(() => {
    if (!householdId) return
    return registerNativeNotificationListeners({
      onMedicineTaken: (medicineId) => {
        void (async () => {
          try {
            await markMedicineTaken(householdId, medicineId, new Date())
            refreshMedicines()
          } catch {
            /* ignore */
          }
        })()
      },
      onEndFeed: (payload) => {
        void (async () => {
          try {
            await endActiveFeedFromNotification(payload, {
              localSessions: feedSessions.sessions,
              feedings,
              stopTimer: feedSessions.stopTimer,
              stopFeedingRecord: feedSessions.stopFeedingRecord,
            })
            refreshFeedings()
          } catch {
            /* ignore */
          }
        })()
      },
    })
  }, [
    householdId,
    refreshMedicines,
    feedSessions.sessions,
    feedSessions.stopTimer,
    feedSessions.stopFeedingRecord,
    feedings,
    refreshFeedings,
  ])

  useEffect(() => {
    setMedicineDueDismissed(false)
  }, [householdId])

  useEffect(() => {
    if (!householdId) return
    const inProgress = getInProgressFeedings(feedings)
    pruneFeedingOwnership(inProgress.map((f) => f.id))
    for (const feeding of inProgress) {
      if (!isFeedingOwnedByThisDevice(feeding.id)) continue
      if (findLocalSessionForFeeding(feedSessions.sessions, feeding)) continue
      feedSessions.ensureSessionForFeeding(feeding)
    }
  }, [householdId, feedings, feedSessions.sessions, feedSessions.ensureSessionForFeeding])

  const babyIds = nursingBabies.map((b) => b.id)
  const hasBabies = babies.length > 0
  const pumpBabyId = resolvePumpBabyId(allBabyIds)

  useEffect(() => {
    if (view === 'daily' || view === 'weekly') {
      if (!navTrackers.nursing) setView('home')
    } else if (view === 'milk' && !navTrackers.milk) {
      setView('home')
    } else if ((view === 'diapers' || view === 'diapers-weekly') && !navTrackers.diaper) {
      setView('home')
    } else if (view === 'medicines' && !navTrackers.medicine) {
      setView('home')
    } else if (view === 'measurements' && !navTrackers.measurements) {
      setView('home')
    } else if (view === 'notes' && !navTrackers.notes) {
      setView('home')
    }
  }, [view, navTrackers])

  const hasHouseholdMembers = (household?.memberProfiles?.length ?? 0) > 0

  useEffect(() => {
    if (!hasBabies && view !== 'home' && view !== 'profile') {
      if (view === 'notes' && hasHouseholdMembers) return
      setView('home')
    }
  }, [hasBabies, hasHouseholdMembers, view])

  const showStack = (localInProgress.length > 0 || remoteInProgress.length > 0) && !drawerOpen

  const inProgressFeedKindByBaby = useMemo(() => {
    const map = new Map<BabyId, 'nursing' | 'bottle'>()
    for (const session of localInProgress) {
      if (session.kind === 'nursing' || session.kind === 'bottle') {
        map.set(session.babyId, session.kind)
      }
    }
    for (const feeding of remoteInProgress) {
      if ((feeding.type ?? 'nursing') === 'nursing' && !map.has(feeding.babyId)) {
        map.set(feeding.babyId, 'nursing')
      }
    }
    return map
  }, [localInProgress, remoteInProgress])

  const isBabyNursingBusy = useCallback(
    (babyId: BabyId) => isBabyNursingInProgress(babyId, feedSessions.sessions, remoteInProgress),
    [feedSessions.sessions, remoteInProgress],
  )

  const drawerDraft =
    drawerOpen && drawerSessionId
      ? feedSessions.getSession(drawerSessionId) ?? drawerBootstrapDraft
      : drawerOpen && editDraft
        ? editDraft
        : null

  const canAddTandem = canStartTandemFeed(
    babyIds,
    feedSessions.sessions,
    remoteInProgress,
    drawerDraft,
  )

  useEffect(() => {
    if (onboardingDismissed.current) return
    if (!profile?.householdId) return
    if (!profile.skippedBabyOnboarding) {
      setOnboardingStep('babies')
      setShowOnboarding(true)
      return
    }
    if (!profile.skippedPhotoOnboarding && babies.length > 0 && babiesNeedPhotos(babies)) {
      setOnboardingStep('photos')
      setShowOnboarding(true)
      return
    }
    setShowOnboarding(false)
  }, [profile?.householdId, profile?.skippedBabyOnboarding, profile?.skippedPhotoOnboarding, babies])

  const openDrawerForSession = (sessionId: string, bootstrap?: ActiveFeedDraft) => {
    setDrawerSessionId(sessionId)
    setDrawerBootstrapDraft(bootstrap ?? null)
    setEditDraft(null)
    setDrawerMode('active')
    setDrawerOpen(true)
  }

  const openAddFeed = () => {
    if (!householdId) return
    const existing = feedSessions.getSession(drawerSessionId ?? '')
    if (existing && isSessionInProgress(existing)) {
      openDrawerForSession(existing.sessionId)
      return
    }
    const activePump = feedSessions.sessions.find((s) => s.kind === 'pump' && isSessionInProgress(s))
    if (activePump) {
      openDrawerForSession(activePump.sessionId)
      return
    }
    const babyId = defaultBabyForTandem(babyIds, feedSessions.sessions, remoteInProgress) ?? babyIds[0]
    if (!babyId) return
    const session = feedSessions.createSession('nursing', babyId)
    openDrawerForSession(session.sessionId, session)
  }

  const openTandemFeed = () => {
    if (!householdId) return
    const babyId =
      defaultBabyForTandem(babyIds, feedSessions.sessions, remoteInProgress, feedings) ?? babyIds[0]
    if (!babyId) return
    const sidePatch = defaultTandemSidePatch(
      feedSessions.sessions,
      remoteInProgress,
      drawerDraft,
    )
    const session = feedSessions.createSession('nursing', babyId, sidePatch)
    openDrawerForSession(session.sessionId, session)
  }

  const startFeedForBaby = (babyId: string) => {
    if (!householdId) return
    const existing = feedSessions.sessions.find((s) => s.babyId === babyId && isSessionInProgress(s))
    if (existing) {
      openDrawerForSession(existing.sessionId)
      return
    }
    const session = feedSessions.createSession('nursing', babyId)
    openDrawerForSession(session.sessionId, session)
  }

  const openEditFeed = (feeding: Feeding) => {
    if (!householdId) return
    const local = findLocalSessionForFeeding(feedSessions.sessions, feeding)
    if (local) {
      if (!local.feedingId) {
        feedSessions.patchSession(local.sessionId, { feedingId: feeding.id })
      }
      openDrawerForSession(local.sessionId)
      return
    }
    if (isFeedingInProgress(feeding)) {
      const session = feedSessions.ensureSessionForFeeding(feeding)
      if (session) openDrawerForSession(session.sessionId)
      return
    }
    setDrawerSessionId(null)
    setEditDraft(feedingToDraft(householdId, feeding))
    setDrawerMode('edit-completed')
    setDrawerOpen(true)
  }

  const minimizeDrawer = () => {
    setDrawerOpen(false)
    setEditDraft(null)
    setDrawerSessionId(null)
    setDrawerBootstrapDraft(null)
  }

  const handleStopLocal = (sessionId: string) => {
    void feedSessions.stopTimer(sessionId)
  }

  const handleStopRemote = (feeding: Feeding) => {
    void feedSessions.stopFeedingRecord(feeding)
  }

  const handleSaved = () => {
    feedSessions.notifySaved()
    refreshFeedings()
    refreshMilk()
    setEditDraft(null)
    setDrawerSessionId(null)
    setDrawerBootstrapDraft(null)
  }

  const handleClearSession = () => {
    if (drawerSessionId) feedSessions.removeSession(drawerSessionId)
    setEditDraft(null)
    setDrawerSessionId(null)
    setDrawerBootstrapDraft(null)
  }

  const handleHouseholdJoined = useCallback(async () => {
    await refreshProfile()
  }, [refreshProfile])

  if (loading) {
    return (
      <>
        <div className="loading-screen" role="status" aria-label="Loading">
          <AppBrand variant="splash" />
        </div>
        <InAppBannerStack>
          <AppWebUpdate />
        </InAppBannerStack>
        <PwaShell />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <LoginScreen
          onSignIn={async () => {
            setSignInError(null)
            try {
              await signIn()
            } catch (e) {
              const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
              if (code === 'auth/popup-closed-by-user') return
              setSignInError(e instanceof Error ? e.message : 'Sign in failed')
            }
          }}
          error={signInError ?? profileAuthError}
          firestoreError={firestoreError}
        />
        <InAppBannerStack>
          <AppWebUpdate />
        </InAppBannerStack>
        <PwaShell />
      </>
    )
  }

  if (!profile?.householdId) {
    return (
      <>
        {firestoreError && user && (
          <div className="firestore-banner" role="alert">
            <p>Signed in as {user.email ?? 'you'}, but the server could not be reached: {firestoreError}</p>
            <button type="button" className="btn btn-secondary btn--compact" onClick={() => refreshProfile()}>
              Retry
            </button>
          </div>
        )}
        <HouseholdScreen uid={user.uid} onJoined={handleHouseholdJoined} />
        <InAppBannerStack>
          <AppWebUpdate />
        </InAppBannerStack>
        <PwaShell />
      </>
    )
  }

  if (showOnboarding && householdId) {
    return (
      <>
        {onboardingStep === 'babies' ? (
          <BabyOnboarding
            householdId={householdId}
            uid={user.uid}
            existingNames={babies.map((b) => b.name)}
            onComplete={async () => {
              await refreshProfile()
              await refreshBabies()
              setOnboardingStep('photos')
            }}
          />
        ) : (
          <PhotoOnboarding
            householdId={householdId}
            uid={user.uid}
            babies={babies}
            onComplete={async () => {
              onboardingDismissed.current = true
              setShowOnboarding(false)
              await refreshProfile()
              refreshBabies()
            }}
          />
        )}
        <InAppBannerStack>
          <AppWebUpdate />
        </InAppBannerStack>
        <PwaShell />
      </>
    )
  }

  return (
    <div
      className={`app-shell${showStack ? ' app-shell--with-player' : ''}${view === 'home' ? ' app-shell--home' : ''}${view === 'daily' || view === 'diapers' ? ' app-shell--daily' : ''}`}
    >
      <SyncStatusBanner
        message={sync.message}
        status={sync.status}
        onRetry={() => {
          void sync.retry()
          refreshAll()
        }}
      />
      <main
        className={`app-main${view === 'home' ? ' app-main--home' : ''}${view === 'daily' || view === 'diapers' ? ' app-main--daily' : ''}`}
      >
        {view === 'home' && (
          <HomePage
            profile={profile}
            babies={homeBabies}
            members={household?.memberProfiles ?? []}
            personNicknames={household?.personNicknames ?? {}}
            memberShowOnHome={household?.memberShowOnHome ?? {}}
            currentUid={user?.uid ?? null}
            feedings={feedings}
            milkSummary={summary}
            navTrackers={navTrackers}
            notes={notes}
            onAddNursing={openAddFeed}
            onAddMilk={() => setHomeMilkQuickAddOpen(true)}
            onAddDiaper={() => setHomeDiaperModalOpen(true)}
            onAddMedicine={() => setHomeMedicineAddOpen(true)}
            onAddMeasurement={() => setHomeMeasurementModalOpen(true)}
            onAddNote={() => setHomeNoteModalOpen(true)}
            onStartFeedForBaby={startFeedForBaby}
            onOpenNotesForPerson={(personId) => {
              setNotesExpandedPersonId(personId)
              setView('notes')
            }}
            onOpenNotes={() => setView('notes')}
            onOpenMilkStorage={() => setView('milk')}
            onOpenProfile={() => setView('profile')}
            onAddBaby={() => {
              setView('profile')
              setProfileTabRequest('babies')
            }}
            inProgressFeedKindByBaby={inProgressFeedKindByBaby}
          />
        )}
        {view === 'milk' && householdId && hasBabies && (
          <MilkStoragePage
            householdId={householdId}
            babies={babies}
            lots={lots}
            feedings={feedings}
            totalOz={summary.totalRemainingOz}
            loading={milkLoading}
            onBack={() => setView('home')}
            onRefresh={() => {
              refreshMilk()
              refreshFeedings()
            }}
          />
        )}
        {view === 'medicines' && householdId && hasBabies && (
          <MedicinesPage
            householdId={householdId}
            medicines={medicines}
            babies={medicineBabies}
            members={household?.memberProfiles ?? []}
            personNicknames={household?.personNicknames ?? {}}
            loading={medicinesLoading}
            onBack={() => setView('home')}
            onRefresh={refreshMedicines}
          />
        )}
        {view === 'daily' && hasBabies && (
          <DailyPage
            babies={nursingBabies}
            feedings={feedings}
            onEditFeed={openEditFeed}
            onOpenWeekly={() => setView('weekly')}
            initialDate={dailyJumpDate}
            onDateConsumed={() => setDailyJumpDate(null)}
            hasMore={feedingsHasMore}
            loadingMore={feedingsLoadingMore}
            onLoadMore={() => void loadMoreFeedings()}
            daysLoaded={feedingsDaysLoaded}
          />
        )}
        {view === 'weekly' && hasBabies && (
          <WeeklyPage
            babies={nursingBabies}
            feedings={feedings}
            onBack={() => setView('daily')}
            onDaySelect={(date) => {
              setDailyJumpDate(date)
              setView('daily')
            }}
            hasMore={feedingsHasMore}
            loadingMore={feedingsLoadingMore}
            onLoadMore={() => void loadMoreFeedings()}
            daysLoaded={feedingsDaysLoaded}
          />
        )}
        {view === 'diapers' && householdId && hasBabies && (
          <DiapersPage
            householdId={householdId}
            babies={babies}
            diapers={diapers}
            onOpenWeekly={() => setView('diapers-weekly')}
            initialDate={diaperJumpDate}
            onDateConsumed={() => setDiaperJumpDate(null)}
            onRefresh={refreshDiapers}
            hasMore={diapersHasMore}
            loadingMore={diapersLoadingMore}
            onLoadMore={() => void loadMoreDiapers()}
            daysLoaded={diapersDaysLoaded}
          />
        )}
        {view === 'diapers-weekly' && hasBabies && (
          <DiaperWeeklyPage
            babies={babiesForTracker(babies, 'diaper')}
            diapers={diapers}
            onBack={() => setView('diapers')}
            onDaySelect={(date) => {
              setDiaperJumpDate(date)
              setView('diapers')
            }}
            hasMore={diapersHasMore}
            loadingMore={diapersLoadingMore}
            onLoadMore={() => void loadMoreDiapers()}
            daysLoaded={diapersDaysLoaded}
          />
        )}
        {view === 'measurements' && householdId && hasBabies && (
          <MeasurementsPage
            householdId={householdId}
            babies={babies}
            measurements={measurements}
            onRefresh={refreshMeasurements}
            hasMore={measurementsHasMore}
            loadingMore={measurementsLoadingMore}
            onLoadMore={() => void loadMoreMeasurements()}
            daysLoaded={measurementsDaysLoaded}
          />
        )}
        {view === 'notes' && householdId && (hasBabies || hasHouseholdMembers) && (
          <NotesPage
            householdId={householdId}
            babies={babies}
            members={household?.memberProfiles ?? []}
            personNicknames={household?.personNicknames}
            notes={notes}
            initialExpandedPersonId={notesExpandedPersonId}
            onExpandedPersonConsumed={() => setNotesExpandedPersonId(null)}
            onRefresh={refreshNotes}
            archiveNoteOptimistic={archiveNoteOptimistic}
            unarchiveNoteOptimistic={unarchiveNoteOptimistic}
            revertNoteOptimistic={revertNoteOptimistic}
          />
        )}
        {view === 'profile' && householdId && (
          <ProfilePage
            household={household}
            babies={babies}
            householdId={householdId}
            currentUid={user?.uid ?? null}
            feedings={feedings}
            localSessions={feedSessions.sessions}
            onBabyUpdated={refreshBabies}
            onHouseholdRefresh={refreshHousehold}
            onLeftHousehold={() => void refreshProfile()}
            onSignOut={signOut}
            onNotificationsEnabledChange={setNotificationsEnabled}
            onMedicineNotificationsEnabledChange={setMedicineNotificationsEnabled}
            onMedicineOverdueFollowupsChange={() => setMedicineNotifPrefsRev((n) => n + 1)}
            profile={profile}
            onProfileUpdated={() => void refreshProfile()}
            requestedTab={profileTabRequest}
            onRequestedTabHandled={() => setProfileTabRequest(null)}
          />
        )}
        {(feedingsLoading || babiesLoading) && feedings.length === 0 && hasBabies && (
          <div className="sync-indicator" aria-live="polite">
            Syncing…
          </div>
        )}
      </main>

      {showStack && (
        <FeedInProgressStack
          localSessions={localInProgress}
          remoteFeedings={remoteInProgress}
          babies={babies}
          syncingId={feedSessions.syncingId}
          onOpenLocal={openDrawerForSession}
          onStopLocal={handleStopLocal}
          onOpenRemote={openEditFeed}
          onStopRemote={handleStopRemote}
          syncingFeedingId={feedSessions.syncingId}
          onAddAnother={openTandemFeed}
          canAddAnother={canAddTandem}
        />
      )}

      <BottomNav view={view} onChange={setView} navTrackers={navTrackers} hasBabies={hasBabies} />

      <InAppBannerStack>
        <AppWebUpdate />

        {appUpdatePending && isAndroidNative() && (
          <AppUpdateBanner
            update={appUpdatePending}
            downloading={appUpdateDownloading}
            onDismiss={() => {
              markApkUpdateAlertDismissed(appUpdatePending.releaseKey)
              void recheckUpdate()
            }}
            onDownload={() => void runAppUpdateDownload()}
          />
        )}

        {householdId && !medicineDueDismissed && (
          <MedicineDueBanner
            medicines={medicinesForAlerts}
            onDismiss={() => setMedicineDueDismissed(true)}
            onOpenMedicines={() => setView('medicines')}
            onMarkTaken={(medicineId) => {
              void (async () => {
                try {
                  await markMedicineTaken(householdId, medicineId, new Date())
                  refreshMedicines()
                } catch {
                  /* ignore */
                }
              })()
            }}
          />
        )}
      </InAppBannerStack>

      {homeDiaperModalOpen && householdId && navTrackers.diaper && (
        <DiaperFormModal
          householdId={householdId}
          babies={diaperBabies}
          defaultBabyId={defaultBabyForDiaper(diaperBabies.map((b) => b.id)) ?? undefined}
          onClose={() => setHomeDiaperModalOpen(false)}
          onSaved={() => {
            setHomeDiaperModalOpen(false)
            refreshDiapers()
          }}
        />
      )}

      {homeMilkQuickAddOpen && householdId && navTrackers.milk && hasBabies && (
        <QuickAddMilkSheet
          householdId={householdId}
          lots={lots}
          pumpBabyId={pumpBabyId}
          onClose={() => setHomeMilkQuickAddOpen(false)}
          onSaved={() => {
            setHomeMilkQuickAddOpen(false)
            refreshMilk()
            refreshFeedings()
          }}
        />
      )}

      {homeMedicineAddOpen && householdId && navTrackers.medicine && (
        <MedicineFormModal
          householdId={householdId}
          babies={medicineBabies}
          members={household?.memberProfiles ?? []}
          personNicknames={household?.personNicknames ?? {}}
          defaultForPersonId={defaultMedicineForPersonId(medicineBabies)}
          medicine={null}
          onClose={() => setHomeMedicineAddOpen(false)}
          onSaved={() => {
            setHomeMedicineAddOpen(false)
            refreshMedicines()
          }}
        />
      )}

      {homeMeasurementModalOpen && householdId && navTrackers.measurements && (
        <MeasurementFormModal
          householdId={householdId}
          babies={babies}
          onClose={() => setHomeMeasurementModalOpen(false)}
          onSaved={() => {
            setHomeMeasurementModalOpen(false)
            refreshMeasurements()
          }}
        />
      )}

      {homeNoteModalOpen && householdId && navTrackers.notes && (
        <NoteFormModal
          householdId={householdId}
          babies={babies}
          members={household?.memberProfiles ?? []}
          personNicknames={household?.personNicknames}
          onClose={() => setHomeNoteModalOpen(false)}
          onSaved={() => {
            setHomeNoteModalOpen(false)
            refreshNotes()
          }}
        />
      )}

      {drawerOpen && householdId && drawerDraft && (
        <FeedDrawer
          householdId={householdId}
          babies={nursingBabies.length > 0 ? nursingBabies : babies}
          milkLots={lots}
          draft={drawerDraft}
          mode={drawerMode}
          buildInput={feedSessions.buildInput}
          onDraftChange={(patch) => {
            if (drawerSessionId) {
              feedSessions.patchSession(drawerSessionId, patch)
            } else if (editDraft) {
              setEditDraft({ ...editDraft, ...patch })
            }
          }}
          syncing={drawerSessionId ? feedSessions.syncingId === drawerSessionId : false}
          onStartTimer={() => {
            if (!drawerSessionId) return Promise.resolve()
            return feedSessions.startTimer(drawerSessionId).then(() => minimizeDrawer())
          }}
          onPauseTimer={() => {
            if (drawerSessionId) feedSessions.pauseTimer(drawerSessionId)
          }}
          onResumeTimer={() => {
            if (drawerSessionId) feedSessions.resumeTimer(drawerSessionId)
          }}
          onSyncEndTime={(endTime) => {
            if (drawerSessionId) void feedSessions.syncEndTime(drawerSessionId, endTime)
          }}
          onStopForSave={(endTime) => {
            if (drawerSessionId) return feedSessions.stopTimer(drawerSessionId, endTime)
            return Promise.resolve()
          }}
          onMinimize={minimizeDrawer}
          onSaved={handleSaved}
          onRefreshMilk={() => void refreshMilk()}
          onClearSession={handleClearSession}
          hasActiveBaby={isBabyNursingBusy}
          canAddTandem={canAddTandem}
          onStartTandem={openTandemFeed}
          pumpBusy={feedSessions.sessions.some(
            (s) => s.kind === 'pump' && isSessionInProgress(s) && s.sessionId !== drawerSessionId,
          )}
          getSuggestedSides={(babyId) => getSuggestedNursingSides(feedings, babyId)}
          onSwitchBaby={(babyId: BabyId) => {
            const sidePatch = suggestedSidePatch(feedings, babyId)
            if (drawerDraft.kind === 'pump') {
              if (drawerSessionId) {
                feedSessions.patchSession(drawerSessionId, {
                  kind: 'nursing',
                  babyId,
                  ...sidePatch,
                  volumeOz: '',
                  awaitingVolume: false,
                })
              } else if (editDraft) {
                setEditDraft({
                  ...editDraft,
                  kind: 'nursing',
                  babyId,
                  ...sidePatch,
                  volumeOz: '',
                })
              }
              return
            }
            const other = feedSessions.sessions.find(
              (s) => s.babyId === babyId && s.sessionId !== drawerSessionId && isSessionInProgress(s),
            )
            if (other) {
              openDrawerForSession(other.sessionId)
              return
            }
            if (drawerSessionId) {
              feedSessions.patchSession(drawerSessionId, { babyId, ...sidePatch })
            } else if (editDraft) {
              setEditDraft({ ...editDraft, babyId, ...sidePatch })
            }
          }}
        />
      )}

      <PwaShell />
    </div>
  )
}
export default App
