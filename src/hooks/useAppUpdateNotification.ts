import { onAuthStateChanged } from 'firebase/auth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { auth } from '../firebase'
import { checkAppUpdateRelease, type AppUpdateCheckResult } from '../lib/appUpdateCheck'
import {
  isApkUpdateAlertDismissed,
  isApkUpdateAlertShown,
  markApkUpdateAlertShown,
} from '../lib/appUpdateAlertState'
import { AppUpdateNative } from '../lib/appUpdateNative'
import { getNotificationPermission, ensureNotificationPermission } from '../lib/feedNotifications'
import { isAndroidNative } from '../lib/platform'

/** How often to re-check Drive while the app is open. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000
const RETRY_DELAYS_MS = [0, 3_000, 15_000] as const

async function tryShowSystemUpdateAlert(result: AppUpdateCheckResult): Promise<boolean> {
  if (isApkUpdateAlertShown(result.releaseKey)) return false

  let perm = await getNotificationPermission()
  if (perm === 'default') {
    perm = await ensureNotificationPermission()
  }
  if (perm !== 'granted') return false

  const idToken = await auth.currentUser!.getIdToken()
  await AppUpdateNative.showUpdateAvailable({
    title: 'Freifeed update available',
    body: `Version ${result.versionLabel} is ready to install.`,
    releaseKey: result.releaseKey,
    downloadUrl: result.remote.downloadUrl,
    authToken: idToken,
  })
  markApkUpdateAlertShown(result.releaseKey)
  return true
}

export function useAppUpdateNotification(enabled: boolean) {
  const checkingRef = useRef(false)
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdateCheckResult | null>(null)

  const runCheck = useCallback(async () => {
    if (!enabled || !isAndroidNative()) {
      setPendingUpdate(null)
      return
    }
    if (checkingRef.current) return
    if (!auth.currentUser) return

    checkingRef.current = true
    try {
      const result = await checkAppUpdateRelease()
      if (!result) {
        setPendingUpdate(null)
        return
      }

      if (!isApkUpdateAlertDismissed(result.releaseKey)) {
        setPendingUpdate(result)
      } else {
        setPendingUpdate(null)
      }

      if (!isApkUpdateAlertDismissed(result.releaseKey)) {
        await tryShowSystemUpdateAlert(result)
      }
    } catch {
      /* Profile → App still works */
    } finally {
      checkingRef.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !isAndroidNative()) {
      setPendingUpdate(null)
      return
    }

    const timeouts: number[] = []
    for (const delay of RETRY_DELAYS_MS) {
      timeouts.push(window.setTimeout(() => void runCheck(), delay))
    }

    const interval = window.setInterval(() => void runCheck(), CHECK_INTERVAL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void runCheck()
    }
    document.addEventListener('visibilitychange', onVisible)

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) void runCheck()
    })

    return () => {
      for (const id of timeouts) window.clearTimeout(id)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      unsubAuth()
    }
  }, [enabled, runCheck])

  return { pendingUpdate, recheckUpdate: runCheck }
}
