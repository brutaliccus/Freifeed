import { LOAD_MORE_DAYS } from '../lib/listQueryClient'

interface LoadMoreButtonProps {
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  daysLoaded?: number
  className?: string
  /** Timeline views pin the control at the top; lists use bottom placement. */
  placement?: 'top' | 'bottom'
}

export function LoadMoreButton({
  hasMore,
  loading,
  onLoadMore,
  daysLoaded,
  className = '',
  placement = 'bottom',
}: LoadMoreButtonProps) {
  if (!hasMore && !loading) return null

  return (
    <div className={`load-more ${placement === 'top' ? 'load-more--top' : 'load-more--bottom'} ${className}`.trim()}>
      <button
        type="button"
        className="load-more__btn"
        disabled={loading || !hasMore}
        onClick={() => void onLoadMore()}
      >
        {loading
          ? 'Loading…'
          : daysLoaded
            ? `Load ${LOAD_MORE_DAYS} more days (${daysLoaded} days loaded)`
            : 'Load more history'}
      </button>
    </div>
  )
}
