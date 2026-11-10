import { Timestamp } from 'firebase/firestore'
import { inputToPayload, type FeedingInput } from './api'
import { runMutation, newClientId, isMutationPending } from './mutationQueue'
import {
  optimisticAddOzToLot,
  optimisticApplyMilkDeductions,
  optimisticRemoveMilkLotIds,
  optimisticUpsertMilkLot,
} from './milkInventoryLocal'
import type { Feeding, MilkLot } from '../types'

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

function planPumpLotIds(input: FeedingInput): string[] {
  if (input.type !== 'pump' || input.volumeOz == null || !input.endAt || !input.milkStorage) return []
  if (input.addToLotId) return []
  if (input.milkBagVolumes && input.milkBagVolumes.length > 0) {
    return input.milkBagVolumes.map(() => newClientId())
  }
  return [newClientId()]
}

function applyMilkSideEffectsOptimistic(
  householdId: string,
  feedingId: string,
  input: FeedingInput,
  plannedLotIds: string[] = [],
) {
  if (input.type === 'bottle' && input.milkDeductions && input.milkDeductions.length > 0) {
    optimisticApplyMilkDeductions(householdId, input.milkDeductions)
  }
  if (input.type === 'pump' && input.volumeOz != null && input.endAt && input.milkStorage) {
    const pumpedAt = input.startAt ?? input.endAt
    const storedAt = input.storedAt ?? pumpedAt
    if (input.addToLotId) {
      optimisticAddOzToLot(householdId, input.addToLotId, input.volumeOz)
      return
    }
    if (input.milkBagVolumes && input.milkBagVolumes.length > 0) {
      for (let i = 0; i < input.milkBagVolumes.length; i++) {
        const vol = input.milkBagVolumes[i]!
        const lot: MilkLot = {
          id: plannedLotIds[i] ?? newClientId(),
          pumpedAt: Timestamp.fromDate(pumpedAt),
          storedAt: Timestamp.fromDate(storedAt),
          volumeOz: vol,
          remainingOz: vol,
          storage: input.milkStorage,
          feedingId: i === 0 ? feedingId : null,
          note: input.note,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }
        optimisticUpsertMilkLot(householdId, lot)
      }
      return
    }
    const lot: MilkLot = {
      id: plannedLotIds[0] ?? newClientId(),
      pumpedAt: Timestamp.fromDate(pumpedAt),
      storedAt: Timestamp.fromDate(storedAt),
      volumeOz: input.volumeOz,
      remainingOz: input.volumeOz,
      storage: input.milkStorage,
      feedingId,
      note: input.note,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }
    optimisticUpsertMilkLot(householdId, lot)
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
  const clientLotIds = planPumpLotIds(input)
  runMutation({
    name: 'createFeeding',
    payload: {
      householdId,
      input: inputToPayload(input),
      clientId: feedingId,
      clientLotIds,
    },
    coalesceKey: feedingCoalesceKey('create', feedingId),
    optimistic: () => {
      options.onOptimistic(feeding)
      applyMilkSideEffectsOptimistic(householdId, feedingId, input, clientLotIds)
    },
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
  const clientLotIds = planPumpLotIds(input)
  runMutation({
    name: 'updateFeeding',
    payload: {
      householdId,
      feedingId,
      input: inputToPayload(input),
      clientLotIds,
    },
    coalesceKey: feedingCoalesceKey('update', feedingId),
    optimistic: () => {
      options.onOptimistic({ ...input, feedingId })
      applyMilkSideEffectsOptimistic(householdId, feedingId, input, clientLotIds)
    },
  })
}

export function deleteFeedingOptimistic(
  householdId: string,
  feedingId: string,
  options: {
    onOptimistic: () => void
    /** Optional milk lot ids to remove locally (pump lot linked to this feeding). */
    milkLotIds?: string[]
  },
): void {
  runMutation({
    name: 'deleteFeeding',
    payload: { householdId, feedingId },
    coalesceKey: feedingCoalesceKey('delete', feedingId),
    optimistic: () => {
      options.onOptimistic()
      if (options.milkLotIds?.length) {
        optimisticRemoveMilkLotIds(householdId, options.milkLotIds)
      }
    },
  })
}

// Re-export for api payload helper consumers that import from feedings.
export { inputToPayload }
