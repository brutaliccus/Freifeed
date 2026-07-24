import { useRegisterSW } from 'virtual:pwa-register/react'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import { useWebContentUpdate } from './useWebContentUpdate'

const SW_UPDATE_INTERVAL_MS = 3 * 60 * 1000

/** Hosted web app updates (PWA + Android WebView shell). */
export function useAppWebUpdate() {
  const native = usesNativeNotifications()

  const sw = useRegisterSW({
    immediate: !native,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const tick = () => {
        if (document.visibilityState === 'visible') void registration.update()
      }
      tick()
      document.addEventListener('visibilitychange', tick)
      window.setInterval(tick, SW_UPDATE_INTERVAL_MS)
    },
  })

  const [pwaNeedRefresh] = sw.needRefresh

  return useWebContentUpdate({
    pwaNeedRefresh,
    updateServiceWorker: native ? undefined : sw.updateServiceWorker,
  })
}
