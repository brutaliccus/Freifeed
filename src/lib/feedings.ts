import {
  apiListFeedings,
  apiCreateFeeding,
  apiUpdateFeeding,
  apiDeleteFeeding,
  type FeedingInput,
} from './api'
import {
  createFeedingOptimistic,
  updateFeedingOptimistic,
  deleteFeedingOptimistic,
} from './feedingMutations'
import type { BabyId, Feeding } from '../types'
import { timestampToDate } from './time'

export type { FeedingInput }

export async function fetchFeedings(householdId: string): Promise<Feeding[]> {
  return apiListFeedings(householdId)
}

/** Blocking create (legacy / rare). Prefer createFeedingBackground. */
export async function createFeeding(
  householdId: string,
  input: FeedingInput,
  clientId?: string | null,
): Promise<string> {
  return apiCreateFeeding(householdId, input, clientId)
}

export async function updateFeeding(
  householdId: string,
  feedingId: string,
  input: FeedingInput,
): Promise<void> {
  await apiUpdateFeeding(householdId, feedingId, input)
}

export async function deleteFeeding(householdId: string, feedingId: string): Promise<void> {
  await apiDeleteFeeding(householdId, feedingId)
}

export {
  createFeedingOptimistic,
  updateFeedingOptimistic,
  deleteFeedingOptimistic,
}

const FEED_DISPLAY_TYPES = new Set<Feeding['type']>(['nursing', 'bottle'])

function feedingSortKey(f: Feeding): number {
  return feedingAnchorTime(f)?.getTime() ?? 0
}

/** Anchor time for "X ago" display (start, then end, then created). */
export function feedingAnchorTime(f: Feeding): Date | null {
  const start = timestampToDate(f.startAt)
  const end = timestampToDate(f.endAt)
  const created = timestampToDate(f.createdAt)
  return start ?? end ?? created
}

export function getLastFeedingForBaby(
  feedings: Feeding[],
  babyId: BabyId,
  type: Feeding['type'] = 'nursing',
): Feeding | null {
  const forBaby = feedings.filter((f) => f.babyId === babyId && (f.type ?? 'nursing') === type)
  if (forBaby.length === 0) return null
  return [...forBaby].sort((a, b) => feedingSortKey(b) - feedingSortKey(a))[0] ?? null
}

/** Most recent nursing or bottle feed for home status / display. */
export function getLastFeedForBaby(feedings: Feeding[], babyId: BabyId): Feeding | null {
  const forBaby = feedings.filter(
    (f) => f.babyId === babyId && FEED_DISPLAY_TYPES.has(f.type ?? 'nursing'),
  )
  if (forBaby.length === 0) return null
  return [...forBaby].sort((a, b) => feedingSortKey(b) - feedingSortKey(a))[0] ?? null
}
