import { PwaInstallPrompt } from './PwaInstallPrompt'
import { usesNativeNotifications } from '../lib/notificationPlatform'

export function PwaShell() {
  const nativeApp = usesNativeNotifications()
  if (nativeApp) return null
  return <PwaInstallPrompt />
}
