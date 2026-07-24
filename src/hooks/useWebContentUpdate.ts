import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acknowledgeWebContentBuild,
  applyWebContentUpdate,
  clearAcknowledgedWebContentBuild,
  consumePostUpdateReload,
  dismissPwaSwUpdate,
  dismissWebContentUpdate,
  fetchRemoteBuildId,
  getAcknowledgedBuildId,
  getInstalledBuildId,
  isPwaSwUpdateDismissed,
  isWebContentUpdateSuppressed,
} from '../lib/webContentUpdate'

const POLL_MS = 3 * 60 * 1000

interface UseWebContentUpdateOptions {
  pwaNeedRefresh?: boolean
  updateServiceWorker?: (reloadPage?: boolean) => Promise<void>
}

export function useWebContentUpdate({
  pwaNeedRefresh = false,
  updateServiceWorker,
}: UseWebContentUpdateOptions = {}) {
  const installedRef = useRef(getInstalledBuildId())
  const [remoteBuildId, setRemoteBuildId] = useState<string | null>(null)
  const [userDismissed, setUserDismissed] = useState(false)

  useEffect(() => {
    const installed = getInstalledBuildId()
    installedRef.current = installed
    if (consumePostUpdateReload() && installed) {
      acknowledgeWebContentBuild(installed)
      dismissPwaSwUpdate()
      setUserDismissed(true)
    }
    const ack = getAcknowledgedBuildId()
    if (ack && ack === installed) {
      clearAcknowledgedWebContentBuild()
    }
  }, [])

  const checkNow = useCallback(async () => {
    const installed = getInstalledBuildId()
    installedRef.current = installed
    const remote = await fetchRemoteBuildId()
    if (!remote) return
    if (remote !== installed) {
      setRemoteBuildId(remote)
    } else {
      setRemoteBuildId(null)
    }
  }, [])

  useEffect(() => {
    if (!remoteBuildId) {
      setUserDismissed(false)
      return
    }
    setUserDismissed(
      isWebContentUpdateSuppressed(remoteBuildId, getInstalledBuildId()),
    )
  }, [remoteBuildId])

  useEffect(() => {
    void checkNow()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => void checkNow(), POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [checkNow])

  useEffect(() => {
    if (pwaNeedRefresh && remoteBuildId == null) {
      void checkNow()
    }
  }, [pwaNeedRefresh, remoteBuildId, checkNow])

  const installed = getInstalledBuildId()
  const hostedUpdatePending =
    remoteBuildId != null &&
    remoteBuildId !== installed &&
    !isWebContentUpdateSuppressed(remoteBuildId, installed)

  const pwaUpdatePending = pwaNeedRefresh && !isPwaSwUpdateDismissed()

  const updateAvailable = (hostedUpdatePending || pwaUpdatePending) && !userDismissed

  const applyUpdate = useCallback(async () => {
    const target = remoteBuildId ?? (await fetchRemoteBuildId())
    if (target) {
      dismissWebContentUpdate(target)
      acknowledgeWebContentBuild(target)
    }
    if (pwaNeedRefresh) {
      dismissPwaSwUpdate()
    }
    setUserDismissed(true)
    await applyWebContentUpdate(updateServiceWorker)
  }, [remoteBuildId, pwaNeedRefresh, updateServiceWorker])

  const dismissUpdate = useCallback(() => {
    if (remoteBuildId) {
      dismissWebContentUpdate(remoteBuildId)
      acknowledgeWebContentBuild(remoteBuildId)
    } else if (pwaNeedRefresh) {
      dismissPwaSwUpdate()
    }
    setUserDismissed(true)
  }, [remoteBuildId, pwaNeedRefresh])

  return {
    updateAvailable,
    remoteBuildId,
    applyUpdate,
    dismissUpdate,
    checkNow,
  }
}
