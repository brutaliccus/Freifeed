import { auth } from '../firebase'
import { apiRegisterPushToken } from './api'
import { areFeedNotificationsEnabled } from './feedNotifications'
import { FeedWatchNative } from './feedWatchNative'
import { isAndroidNative } from './platform'

/**
 * Register this device's FCM token with Firestore (partner feed push).
 * Call after sign-in and whenever feed notifications are enabled.
 */
export async function registerNativePartnerPushToken(): Promise<void> {
  if (!isAndroidNative() || !auth.currentUser) return
  if (!areFeedNotificationsEnabled()) return

  const idToken = await auth.currentUser.getIdToken(true)

  // Primary path: Firebase callable (must succeed for partner FCM).
  let token = ''
  try {
    const res = await FeedWatchNative.getPushToken()
    token = res.token ?? ''
  } catch (err) {
    console.warn('getPushToken failed', err)
  }
  if (token) {
    await apiRegisterPushToken(token)
    console.info('Partner FCM token registered')
  }

  // Backup for poller / onNewToken when WebView is not running.
  try {
    await FeedWatchNative.registerPushToken({ authToken: idToken })
  } catch (err) {
    console.warn('Native HTTP FCM registration failed', err)
  }
}

/** Web fallback if native plugin unavailable (should not run on Android). */
export async function registerWebPushToken(_token: string): Promise<void> {
  await apiRegisterPushToken(_token)
}
