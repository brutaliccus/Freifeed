import { RefreshCw } from 'lucide-react'
import { InAppBanner } from './InAppBanner'

interface WebContentUpdateBannerProps {
  bannerKey: string
  onRefresh: () => void
  onDismiss: () => void
  busy?: boolean
}

export function WebContentUpdateBanner({
  bannerKey,
  onRefresh,
  onDismiss,
  busy = false,
}: WebContentUpdateBannerProps) {
  return (
    <InAppBanner
      bannerKey={bannerKey}
      onDismiss={onDismiss}
      className="in-app-banner in-app-banner--web-update"
      style={{ zIndex: 400 }}
      role="status"
      ariaLabel="App update available. Swipe right to dismiss."
    >
      <div className="in-app-banner__header">
        <p className="in-app-banner__title">Update available</p>
        <span className="in-app-banner__hint muted">Swipe right to dismiss</span>
      </div>
      <p className="in-app-banner__body">
        A new version of Freifeed is ready. Refresh to load the latest changes from the server.
      </p>
      <button
        type="button"
        className="btn btn-primary in-app-banner__action"
        onClick={onRefresh}
        disabled={busy}
      >
        <RefreshCw size={18} aria-hidden />
        {busy ? 'Refreshing…' : 'Refresh now'}
      </button>
    </InAppBanner>
  )
}
