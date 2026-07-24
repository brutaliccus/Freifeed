import { useState } from 'react'
import { useAppWebUpdate } from '../hooks/useAppWebUpdate'
import { WebContentUpdateBanner } from './WebContentUpdateBanner'

/** In-app banner when a newer hosted build is available (PWA + Android WebView). */
export function AppWebUpdate() {
  const { updateAvailable, remoteBuildId, applyUpdate, dismissUpdate } = useAppWebUpdate()
  const [busy, setBusy] = useState(false)

  if (!updateAvailable) return null

  const bannerKey = remoteBuildId ?? 'pwa-sw-update'

  return (
    <WebContentUpdateBanner
      bannerKey={bannerKey}
      busy={busy}
      onDismiss={dismissUpdate}
      onRefresh={async () => {
        setBusy(true)
        try {
          await applyUpdate()
        } finally {
          setBusy(false)
        }
      }}
    />
  )
}
