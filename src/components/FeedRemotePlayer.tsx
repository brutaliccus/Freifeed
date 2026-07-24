import { Square, ChevronUp } from 'lucide-react'
import { useSecondTick } from '../hooks/useSecondTick'
import { formatElapsed } from '../lib/activeFeedSession'
import { feedingElapsedSeconds, isFeedingInProgress } from '../lib/feedingProgress'
import { sideLabel } from '../lib/time'
import type { Baby, Feeding } from '../types'
import { resolveBaby } from '../types'
import { babyName as resolveBabyDisplayName } from '../lib/babyUtils'

interface FeedRemotePlayerProps {
  feeding: Feeding
  babies: Baby[]
  syncing?: boolean
  onOpen: () => void
  onStop: () => void
}

export function FeedRemotePlayer({ feeding, babies, syncing, onOpen, onStop }: FeedRemotePlayerProps) {
  const isPump = (feeding.type ?? 'nursing') === 'pump'
  const baby = resolveBaby(babies, feeding.babyId)
  const displayName = isPump ? 'Pumping' : typeof baby === 'string' ? resolveBabyDisplayName(babies, feeding.babyId) : baby.name
  useSecondTick(isFeedingInProgress(feeding))
  const elapsed = feedingElapsedSeconds(feeding)

  return (
    <div className="feed-player feed-player--local" role="region" aria-label={`${displayName} feeding in progress`}>
      <button type="button" className="feed-player__main" onClick={onOpen}>
        <span className="feed-player__pulse" aria-hidden />
        <div className="feed-player__info">
          <span className="feed-player__title">
            {displayName}
            {feeding.side ? ` · ${sideLabel(feeding.side)}` : ''}
          </span>
          <span className="feed-player__meta">
            <span className="feed-player__elapsed">{formatElapsed(elapsed)}</span>
            <span className="feed-player__status">Tap to expand</span>
          </span>
        </div>
      </button>
      <div className="feed-player__actions">
        <button
          type="button"
          className="feed-player__btn feed-player__btn--stop"
          onClick={(e) => {
            e.stopPropagation()
            onStop()
          }}
          disabled={syncing}
          aria-label="Stop and save"
        >
          <Square size={18} aria-hidden />
        </button>
        <button type="button" className="feed-player__btn" onClick={onOpen} aria-label="Expand feeding">
          <ChevronUp size={18} aria-hidden />
        </button>
      </div>
    </div>
  )
}
