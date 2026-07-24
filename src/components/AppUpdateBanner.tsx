import { Download } from 'lucide-react'
import { InAppBanner } from './InAppBanner'
import type { AppUpdateCheckResult } from '../lib/appUpdateCheck'

interface AppUpdateBannerProps {
  update: AppUpdateCheckResult
  downloading?: boolean
  onDismiss: () => void
  onDownload: () => void
}

export function AppUpdateBanner({
  update,
  downloading = false,
  onDismiss,
  onDownload,
}: AppUpdateBannerProps) {
  return (
    <InAppBanner
      bannerKey={update.releaseKey}
      onDismiss={onDismiss}
      className="in-app-banner in-app-banner--update"
      style={{ zIndex: 395 }}
      role="status"
      ariaLabel="App update available. Swipe right to dismiss."
    >
      <div className="in-app-banner__header">
        <p className="in-app-banner__title">Update available</p>
        <span className="in-app-banner__hint muted">Swipe right to dismiss</span>
      </div>
      <p className="in-app-banner__body">
        Version {update.versionLabel} is ready to install.
      </p>
      <button
        type="button"
        className="btn btn-primary in-app-banner__action"
        onClick={onDownload}
        disabled={downloading}
      >
        <Download size={18} aria-hidden />
        {downloading ? 'Downloading…' : 'Download & install'}
      </button>
    </InAppBanner>
  )
}
