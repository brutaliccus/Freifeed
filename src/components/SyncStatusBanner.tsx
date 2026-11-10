interface FailedItem {
  id: string
  description: string
  lastError?: string
}

interface SyncStatusBannerProps {
  message: string | null
  status: 'ok' | 'offline' | 'pending' | 'error'
  onRetry?: () => void
  onDiscard?: () => void
  failedItems?: FailedItem[]
}

export function SyncStatusBanner({
  message,
  status,
  onRetry,
  onDiscard,
  failedItems = [],
}: SyncStatusBannerProps) {
  if (!message || status === 'ok') return null

  return (
    <div
      className={`sync-status-banner sync-status-banner--${status}`}
      role="status"
      aria-live="polite"
    >
      <div className="sync-status-banner__body">
        <span>{message}</span>
        {status === 'error' && failedItems.length > 0 && (
          <ul className="sync-status-banner__details">
            {failedItems.map((item) => (
              <li key={item.id}>
                {item.description}
                {item.lastError ? ` — ${item.lastError}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sync-status-banner__actions">
        {(status === 'error' || status === 'offline' || status === 'pending') && onRetry && (
          <button type="button" className="sync-status-banner__retry" onClick={() => void onRetry()}>
            Retry
          </button>
        )}
        {status === 'error' && onDiscard && failedItems.length > 0 && (
          <button
            type="button"
            className="sync-status-banner__dismiss"
            onClick={() => onDiscard()}
          >
            Dismiss failed
          </button>
        )}
      </div>
    </div>
  )
}
