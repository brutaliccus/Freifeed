import type { Baby, BabyId } from '../types'

/** First baby id when one is required (forms, defaults). Returns null if none. */
export function firstBabyId(babies: Baby[]): BabyId | null {
  return babies[0]?.id ?? null
}

export function babyIdsFrom(babies: Baby[]): BabyId[] {
  return babies.map((b) => b.id)
}

export function babyName(babies: Baby[], id: BabyId): string {
  const found = babies.find((b) => b.id === id)
  return found?.name ?? 'Baby'
}

export function requireBabyId(babies: Baby[], fallback: BabyId | null = null): BabyId {
  return firstBabyId(babies) ?? fallback ?? 'unknown'
}
