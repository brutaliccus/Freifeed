import type { DiaperKind } from '../types'

export type DiaperKindToggle = 'wet' | 'poop'

export function diaperKindToToggles(kind: DiaperKind): DiaperKindToggle[] {
  if (kind === 'both') return ['wet', 'poop']
  if (kind === 'wet') return ['wet']
  if (kind === 'poop') return ['poop']
  return []
}

export function togglesToDiaperKind(toggles: DiaperKindToggle[]): DiaperKind | null {
  const hasWet = toggles.includes('wet')
  const hasPoop = toggles.includes('poop')
  if (hasWet && hasPoop) return 'both'
  if (hasWet) return 'wet'
  if (hasPoop) return 'poop'
  return null
}

export function toggleDiaperKind(toggles: DiaperKindToggle[], kind: DiaperKindToggle): DiaperKindToggle[] {
  return toggles.includes(kind) ? toggles.filter((k) => k !== kind) : [...toggles, kind]
}
