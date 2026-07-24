import { Square, ChevronUp } from 'lucide-react'
import {
  formatElapsed,
  isTimerPaused,
  isTimerRunning,
  sessionElapsedSeconds,
  type ActiveFeedDraft,
} from '../lib/activeFeedSession'
import { useSecondTick } from '../hooks/useSecondTick'
import { sideToggleLabel } from '../lib/feedingTypes'
import { sideLabel } from '../lib/time'
import type { Baby } from '../types'
import { resolveBaby } from '../types'
import { babyName as resolveBabyDisplayName } from '../lib/babyUtils'

interface FeedLocalPlayerProps {
  draft: ActiveFeedDraft
  babies: Baby[]
  syncing?: boolean
  onOpen: () => void
  onStop: () => void
}

export function FeedLocalPlayer({ draft, babies, syncing, onOpen, onStop }: FeedLocalPlayerProps) {
  const isPump = draft.kind === 'pump'
  const baby = resolveBaby(babies, draft.babyId)
  const displayName = isPump ? 'Pumping' : typeof baby === 'string' ? resolveBabyDisplayName(babies, draft.babyId) : baby.name
  const sideText = isPump ? sideToggleLabel(draft.sides) : sideLabel(draft.side)
  const timerRunning = isTimerRunning(draft)
  const timerPaused = isTimerPaused(draft)
  const timerActive = timerRunning || timerPaused
  useSecondTick(timerActive)
  const elapsed = sessionElapsedSeconds(draft)

  return (
    <div className="feed-player feed-player--local" role="region" aria-label={`${displayName} in progress`}>
      <button type="button" className="feed-player__main" onClick={onOpen}>
        {timerRunning && <span className="feed-player__pulse" aria-hidden />}
        <div className="feed-player__info">
          <span className="feed-player__title">
            {displayName}
            {sideText ? ` · ${sideText}` : ''}
          </span>
          <span className="feed-player__meta">
            {draft.awaitingVolume ? (
              <span className="feed-player__status">Stopped — add oz to save</span>
            ) : timerActive ? (
              <>
                <span className="feed-player__elapsed">{formatElapsed(elapsed)}</span>
                <span className="feed-player__status">
                  {timerPaused ? 'Paused — tap to expand' : 'Tap to expand'}
                </span>
              </>
            ) : (
              <span className="feed-player__status">Stopped — tap to save</span>
            )}
          </span>
        </div>
      </button>
      <div className="feed-player__actions">
        {(timerRunning || timerPaused) && (
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
        )}
        <button type="button" className="feed-player__btn" onClick={onOpen} aria-label="Expand">
          <ChevronUp size={18} aria-hidden />
        </button>
      </div>
    </div>
  )
}
