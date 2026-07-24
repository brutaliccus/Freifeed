import type { ReactNode } from 'react'
import type { ActiveFeedDraft } from '../lib/activeFeedSession'
import type { Baby, Feeding } from '../types'
import { FeedLocalPlayer } from './FeedLocalPlayer'
import { FeedRemotePlayer } from './FeedRemotePlayer'

interface FeedInProgressStackProps {
  localSessions: ActiveFeedDraft[]
  remoteFeedings: Feeding[]
  babies: Baby[]
  syncingId: string | null
  onOpenLocal: (sessionId: string) => void
  onStopLocal: (sessionId: string) => void
  onOpenRemote: (feeding: Feeding) => void
  onStopRemote: (feeding: Feeding) => void
  syncingFeedingId?: string | null
  onAddAnother?: () => void
  canAddAnother: boolean
}

export function FeedInProgressStack({
  localSessions,
  remoteFeedings,
  babies,
  syncingId,
  onOpenLocal,
  onStopLocal,
  onOpenRemote,
  onStopRemote,
  syncingFeedingId,
  onAddAnother,
  canAddAnother,
}: FeedInProgressStackProps) {
  if (localSessions.length === 0 && remoteFeedings.length === 0) return null

  const addButton =
    canAddAnother && onAddAnother ? (
      <button type="button" className="feed-players-stack__add btn btn-ghost" onClick={onAddAnother}>
        + Start tandem feed
      </button>
    ) : null

  const renderLocal = (session: ActiveFeedDraft) => (
    <FeedLocalPlayer
      key={session.sessionId}
      draft={session}
      babies={babies}
      syncing={syncingId === session.sessionId}
      onOpen={() => onOpenLocal(session.sessionId)}
      onStop={() => onStopLocal(session.sessionId)}
    />
  )

  const renderRemote = (feeding: Feeding) => (
    <FeedRemotePlayer
      key={feeding.id}
      feeding={feeding}
      babies={babies}
      syncing={syncingFeedingId === feeding.id}
      onOpen={() => onOpenRemote(feeding)}
      onStop={() => onStopRemote(feeding)}
    />
  )

  let left: ReactNode = null
  let right: ReactNode = null

  const [firstLocal, secondLocal] = localSessions
  const [firstRemote, secondRemote] = remoteFeedings

  if (firstLocal) {
    left = renderLocal(firstLocal)
    if (secondLocal) {
      right = renderLocal(secondLocal)
    } else if (firstRemote) {
      right = renderRemote(firstRemote)
    } else {
      right = addButton
    }
  } else if (firstRemote) {
    left = renderRemote(firstRemote)
    right = secondRemote ? renderRemote(secondRemote) : addButton
  }

  return (
    <div className="feed-players-stack" role="region" aria-label="Feeds in progress">
      <div className="feed-players-stack__slot">{left}</div>
      <div className="feed-players-stack__slot">{right}</div>
    </div>
  )
}
