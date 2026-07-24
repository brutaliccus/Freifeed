import { isAndroidNative } from './platform'

/** True on Android APK — all system notifications use native Java (not PWA service worker / LocalNotifications). */
export function usesNativeNotifications(): boolean {
  return isAndroidNative()
}

/** Unregister any PWA service worker so only Android system notifications are used in the APK. */
export async function disableServiceWorkerOnNative(): Promise<void> {
  if (!usesNativeNotifications() || !('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((reg) => reg.unregister()))
  } catch {
    /* ignore */
  }
}

export async function clearFeedTimersWhenDisabled(): Promise<void> {
  if (usesNativeNotifications()) {
    const { clearNativeFeedNotifications, clearNativeMilkExpirationNotifications } =
      await import('./nativeNotifications')
    await clearNativeFeedNotifications()
    await clearNativeMilkExpirationNotifications()
  } else {
    const { syncFeedNotificationsToServiceWorker } = await import('./feedNotifications')
    await syncFeedNotificationsToServiceWorker([])
    const { syncMilkExpirationToServiceWorker } = await import('./milkExpirationNotifications')
    await syncMilkExpirationToServiceWorker([])
  }
}

export async function clearMedicineRemindersWhenDisabled(): Promise<void> {
  if (usesNativeNotifications()) {
    const { clearNativeMedicineNotifications } = await import('./nativeNotifications')
    await clearNativeMedicineNotifications()
  } else {
    const { syncMedicinesToServiceWorker } = await import('./medicineNotifications')
    await syncMedicinesToServiceWorker([])
  }
}
