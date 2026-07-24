import { format } from 'date-fns'
import type { ActiveFeedDraft } from './activeFeedSession'
import { createEmptyDraft, newSessionId } from './activeFeedSession'
import { nursingSideToSides } from './sides'
import { dateToTimeInputValue, timestampToDate } from './time'
import type { BabyId, Feeding } from '../types'

export function feedingToDraft(householdId: string, feeding: Feeding): ActiveFeedDraft {
  const start = timestampToDate(feeding.startAt)
  const end = timestampToDate(feeding.endAt)
  const stored = timestampToDate(feeding.storedAt)
  const anchor = start ?? end ?? stored ?? timestampToDate(feeding.createdAt) ?? new Date()
  const inProgress = !!start && !end && feeding.type !== 'bottle'
  const kind = feeding.type

  const draft = createEmptyDraft(householdId, kind, feeding.babyId)
  return {
    ...draft,
    sessionId: newSessionId(),
    kind,
    babyId: feeding.babyId,
    sides: nursingSideToSides(feeding.side),
    side: feeding.side,
    startTime: dateToTimeInputValue(start),
    endTime: dateToTimeInputValue(end),
    defaultDate: format(anchor, 'yyyy-MM-dd'),
    storedDate: format(stored ?? anchor, 'yyyy-MM-dd'),
    timerStartedAt: inProgress ? (start?.toISOString() ?? null) : null,
    timerAccumulatedSec: 0,
    timerPaused: false,
    feedingId: feeding.id,
    note: feeding.note ?? '',
    volumeOz: feeding.volumeOz != null ? String(feeding.volumeOz) : '',
    milkStorage: feeding.milkStorage ?? draft.milkStorage,
    awaitingVolume: kind === 'pump' && !!end && feeding.volumeOz == null,
    weightLb: feeding.weightLb != null ? String(feeding.weightLb) : '',
    weightOz: feeding.weightOz != null ? String(feeding.weightOz) : '',
    showWeight: feeding.weightLb != null || feeding.weightOz != null,
    bottleMilkDeductions: feeding.milkDeductions ?? [],
  }
}

export function newFeedDraft(
  householdId: string,
  babyId: BabyId,
  existing?: ActiveFeedDraft | null,
): ActiveFeedDraft {
  if (existing?.householdId === householdId) return existing
  return createEmptyDraft(householdId, 'nursing', babyId)
}
