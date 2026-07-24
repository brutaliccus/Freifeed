interface SyncStatusBannerProps {
  message: string | null
  status: 'ok' | 'offline' | 'pending' | 'error'
  onRetry?: () => void
}

export function SyncStatusBanner({ message, status, onRetry }: SyncStatusBannerProps) {
  if (!message || status === 'ok') return null

  return (
    <div
      className={`sync-status-banner sync-status-banner--${status}`}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
      {(status === 'error' || status === 'offline' || status === 'pending') && onRetry && (
        <button type="button" className="sync-status-banner__retry" onClick={() => void onRetry()}>
          Retry
        </button>
      )}
    </div>
  )
}
