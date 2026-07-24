import type { BabyId, Feeding, NursingSide } from '../types'
import { timestampToDate } from './time'

export type SideToggle = 'left' | 'right'

function feedingRecencyKey(f: Feeding): number {
  const start = timestampToDate(f.startAt)
  const end = timestampToDate(f.endAt)
  const created = timestampToDate(f.createdAt)
  return (start ?? end ?? created)?.getTime() ?? 0
}

function oppositeSingleSide(side: 'left' | 'right'): SideToggle[] {
  return side === 'left' ? ['right'] : ['left']
}

/** Suggest the opposite breast from the baby's most recent nursing log. */
export function getSuggestedNursingSides(feedings: Feeding[], babyId: BabyId): SideToggle[] {
  const nursingFeeds = feedings
    .filter(
      (f) =>
        f.babyId === babyId &&
        (f.type ?? 'nursing') === 'nursing' &&
        (f.side === 'left' || f.side === 'right' || f.side === 'both'),
    )
    .sort((a, b) => feedingRecencyKey(b) - feedingRecencyKey(a))

  if (nursingFeeds.length === 0) return []

  const last = nursingFeeds[0]!
  if (last.side === 'left' || last.side === 'right') {
    return oppositeSingleSide(last.side)
  }

  const lastSingle = nursingFeeds.find((f) => f.side === 'left' || f.side === 'right')
  if (lastSingle?.side === 'left' || lastSingle?.side === 'right') {
    return oppositeSingleSide(lastSingle.side)
  }
  return []
}

export function suggestedSidePatch(
  feedings: Feeding[],
  babyId: BabyId,
): { sides: SideToggle[]; side: NursingSide | null } {
  const sides = getSuggestedNursingSides(feedings, babyId)
  return { sides, side: sidesToNursingSide(sides) }
}

export function sidesToNursingSide(sides: SideToggle[]): NursingSide | null {
  const hasLeft = sides.includes('left')
  const hasRight = sides.includes('right')
  if (hasLeft && hasRight) return 'both'
  if (hasLeft) return 'left'
  if (hasRight) return 'right'
  return null
}

export function nursingSideToSides(side: NursingSide | null | undefined): SideToggle[] {
  if (side === 'both') return ['left', 'right']
  if (side === 'left') return ['left']
  if (side === 'right') return ['right']
  return []
}

export function toggleSide(sides: SideToggle[], side: SideToggle): SideToggle[] {
  return sides.includes(side) ? sides.filter((s) => s !== side) : [...sides, side]
}
