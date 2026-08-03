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
    stopTimer: (sessionId: string, endTimeOverride?: string) => void | Promise<void>
    stopFeedingRecord: (feeding: Feeding) => unknown
  },
): Promise<void> {
  const { babyId, feedingId } = payload
  const { localSessions, feedings, stopTimer, stopFeedingRecord } = deps

  const feedingIdStr = feedingId?.trim() ?? ''
  if (feedingIdStr && !feedingIdStr.startsWith('local-')) {
    const feeding = feedings.find((f) => f.id === feedingIdStr)
    if (feeding && !feeding.endAt) {
      await Promise.resolve(stopFeedingRecord(feeding))
      return
    }
  }

  const local = localSessions.find(
    (s) => isSessionInProgress(s) && s.babyId === babyId && s.kind === 'nursing',
  )
  if (local) {
    await Promise.resolve(stopTimer(local.sessionId))
    return
  }

  const remote = getInProgressFeedings(feedings).filter(
    (f) => f.babyId === babyId && f.type !== 'bottle',
  )
  if (remote.length === 1) {
    const existing = findLocalSessionForFeeding(localSessions, remote[0])
    if (existing && isSessionInProgress(existing)) {
      await Promise.resolve(stopTimer(existing.sessionId))
      return
    }
    await Promise.resolve(stopFeedingRecord(remote[0]))
  }
}
