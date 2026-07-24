import { CalendarDays, CalendarRange } from 'lucide-react'

interface TimelineViewFabProps {
  /** Daily timeline shows stats opener; weekly/monthly shows return to daily. */
  mode: 'daily' | 'stats'
  onClick: () => void
  className?: string
}

export function TimelineViewFab({ mode, onClick, className }: TimelineViewFabProps) {
  const label = mode === 'daily' ? 'Weekly and monthly stats' : 'Back to timeline'

  return (
    <button
      type="button"
      className={['page-fab', 'page-fab--timeline', 'soft-glow-control', className]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      aria-label={label}
    >
      {mode === 'daily' ? (
        <CalendarRange size={45} strokeWidth={2} aria-hidden />
      ) : (
        <CalendarDays size={45} strokeWidth={2} aria-hidden />
      )}
    </button>
  )
}
