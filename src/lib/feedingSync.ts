import { format } from 'date-fns'
import type { ActiveFeedDraft } from './activeFeedSession'
import { nursingSideToSides } from './sides'
import { timestampToDate } from './time'
import type { Feeding } from '../types'

function sessionStopState(session: ActiveFeedDraft) {
  return `${session.timerStartedAt ?? ''}|${session.timerPaused}|${session.timerAccumulatedSec}|${session.endTime}|${session.awaitingVolume}|${session.startTime}`
}

export function reconcileSessionsWithFeedings(
  sessions: ActiveFeedDraft[],
  feedings: Feeding[],
): ActiveFeedDraft[] {
  const feedingById = new Map(feedings.map((f) => [f.id, f]))
  const next: ActiveFeedDraft[] = []

  for (const session of sessions) {
    if (!session.feedingId) {
      next.push(session)
      continue
    }

    const feeding = feedingById.get(session.feedingId)
    if (!feeding) {
      next.push(session)
      continue
    }

    const end = timestampToDate(feeding.endAt)
    const start = timestampToDate(feeding.startAt)

    if (end && feeding.type === 'pump' && feeding.volumeOz != null) {
      continue
    }

    if (end) {
      const endStr = format(end, 'HH:mm')
      const startStr = start ? format(start, 'HH:mm') : session.startTime
      next.push({
        ...session,
        startTime: startStr || session.startTime,
        endTime: endStr,
        timerStartedAt: null,
        timerPaused: false,
        awaitingVolume: feeding.type === 'pump' && feeding.volumeOz == null,
        side: feeding.side ?? session.side,
        sides: nursingSideToSides(feeding.side ?? session.side),
        defaultDate: start ? format(start, 'yyyy-MM-dd') : session.defaultDate,
      })
      continue
    }

    next.push(session)
  }

  return next
}

export function sessionsReconcileChanged(before: ActiveFeedDraft[], after: ActiveFeedDraft[]): boolean {
  if (before.length !== after.length) return true
  for (const session of after) {
    const prev = before.find((s) => s.sessionId === session.sessionId)
    if (!prev) return true
    if (sessionStopState(prev) !== sessionStopState(session)) return true
  }
  for (const session of before) {
    if (!after.some((s) => s.sessionId === session.sessionId)) return true
  }
  return false
}
