import { useCallback, useEffect, useState } from 'react'
import { ensureNotificationPermission, getNotificationPermission } from '../lib/feedNotifications'
import { isNativeCapacitor } from '../lib/platform'

function initialPermission(): NotificationPermission | 'unsupported' {
  if (isNativeCapacitor()) return 'default'
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
}

export function useNotificationPermissionState() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(initialPermission)

  useEffect(() => {
    void getNotificationPermission().then(setPermission)
  }, [])

  const requestPermission = useCallback(async () => {
    const perm = await ensureNotificationPermission()
    setPermission(perm)
    return perm
  }, [])

  return { permission, requestPermission }
}
