import { Timestamp } from 'firebase/firestore'
import { inputToPayload, type FeedingInput } from './api'
import { runMutation, newClientId, isMutationPending } from './mutationQueue'
import type { Feeding } from '../types'

export function feedingCoalesceKey(
  op: 'create' | 'update' | 'delete',
  feedingId: string,
): string {
  return `${op}Feeding:${feedingId}`
}

export function isFeedingMutationPending(feedingId: string): boolean {
  return (
    isMutationPending(feedingCoalesceKey('create', feedingId)) ||
    isMutationPending(feedingCoalesceKey('update', feedingId)) ||
    isMutationPending(feedingCoalesceKey('delete', feedingId))
  )
}

export function feedingFromInput(
  feedingId: string,
  _householdId: string,
  input: FeedingInput,
): Feeding {
  const now = Timestamp.now()
  return {
    id: feedingId,
    type: input.type,
    babyId: input.babyId,
    side: input.side,
    startAt: input.startAt ? Timestamp.fromDate(input.startAt) : null,
    endAt: input.endAt ? Timestamp.fromDate(input.endAt) : null,
    volumeOz: input.volumeOz,
    milkStorage: input.milkStorage,
    storedAt: input.storedAt ? Timestamp.fromDate(input.storedAt) : null,
    milkLotId: null,
    milkDeductions: input.milkDeductions ?? [],
    weightLb: input.weightLb,
    weightOz: input.weightOz,
    note: input.note,
    createdAt: now,
    updatedAt: now,
  }
}

/** Optimistic create — returns client id immediately; syncs in background. */
export function createFeedingOptimistic(
  householdId: string,
  input: FeedingInput,
  options: {
    clientId?: string
    onOptimistic: (feeding: Feeding) => void
  },
): string {
  const feedingId = options.clientId ?? newClientId()
  const feeding = feedingFromInput(feedingId, householdId, input)
  runMutation({
    name: 'createFeeding',
    payload: {
      householdId,
      input: inputToPayload(input),
      clientId: feedingId,
    },
    coalesceKey: feedingCoalesceKey('create', feedingId),
    optimistic: () => options.onOptimistic(feeding),
  })
  return feedingId
}

export function updateFeedingOptimistic(
  householdId: string,
  feedingId: string,
  input: FeedingInput,
  options: {
    onOptimistic: (patch: FeedingInput & { feedingId: string }) => void
  },
): void {
  runMutation({
    name: 'updateFeeding',
    payload: {
      householdId,
      feedingId,
      input: inputToPayload(input),
    },
    coalesceKey: feedingCoalesceKey('update', feedingId),
    optimistic: () => options.onOptimistic({ ...input, feedingId }),
  })
}

export function deleteFeedingOptimistic(
  householdId: string,
  feedingId: string,
  options: {
    onOptimistic: () => void
  },
): void {
  runMutation({
    name: 'deleteFeeding',
    payload: { householdId, feedingId },
    coalesceKey: feedingCoalesceKey('delete', feedingId),
    optimistic: () => options.onOptimistic(),
  })
}

// Re-export for api payload helper consumers that import from feedings.
export { inputToPayload }
