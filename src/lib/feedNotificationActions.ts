import { isSessionInProgress, type ActiveFeedDraft } from './activeFeedSession'
import { findLocalSessionForFeeding, getInProgressFeedings } from './feedingProgress'
import type { BabyId, Feeding } from '../types'

export type FeedEndNotificationPayload = {
  babyId: BabyId
  feedingId?: string | null
}

/** Stop the in-progress feed for this baby (local session or remote Firestore record). */
export async function endActiveFeedFromNotification(
  payload: FeedEndNotificationPayload,
  deps: {
    localSessions: ActiveFeedDraft[]
    feedings: Feeding[]
    stopTimer: (sessionId: string) => Promise<void>
    stopFeedingRecord: (feeding: Feeding) => Promise<unknown>
  },
): Promise<void> {
  const { babyId, feedingId } = payload
  const { localSessions, feedings, stopTimer, stopFeedingRecord } = deps

  const feedingIdStr = feedingId?.trim() ?? ''
  if (feedingIdStr && !feedingIdStr.startsWith('local-')) {
    const feeding = feedings.find((f) => f.id === feedingIdStr)
    if (feeding && !feeding.endAt) {
      await stopFeedingRecord(feeding)
      return
    }
  }

  const local = localSessions.find(
    (s) => isSessionInProgress(s) && s.babyId === babyId && s.kind === 'nursing',
  )
  if (local) {
    await stopTimer(local.sessionId)
    return
  }

  const remote = getInProgressFeedings(feedings).filter(
    (f) => f.babyId === babyId && f.type !== 'bottle',
  )
  if (remote.length === 1) {
    const existing = findLocalSessionForFeeding(localSessions, remote[0])
    if (existing && isSessionInProgress(existing)) {
      await stopTimer(existing.sessionId)
      return
    }
    await stopFeedingRecord(remote[0])
  }
}
