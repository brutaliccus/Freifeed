import type { ActiveFeedDraft } from './activeFeedSession'
import type { FeedingType, MilkStorage, SessionKind, BabyId } from '../types'
import type { SideToggle } from './sides'

/** Legacy pump sessions may reference the first household baby; new sessions use an explicit babyId. */
export function resolvePumpBabyId(babyIds: BabyId[]): BabyId {
  return babyIds[0] ?? 'household'
}

export function roundVolumeOz(n: number): number {
  return Math.round(n * 100) / 100
}

export function parseVolumeOzInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return roundVolumeOz(n)
}

/** Up to 2 decimal places; avoids showing 3.5 when the stored value is 3.46. */
export function formatVolumeOz(oz: number | null | undefined): string {
  if (oz == null) return ''
  const rounded = roundVolumeOz(oz)
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.?0+$/, '')
}

export function feedingTypeLabel(type: FeedingType | SessionKind): string {
  if (type === 'pump') return 'Pump'
  if (type === 'bottle') return 'Bottle'
  return 'Nursing'
}

/** Drawer heading — nursing + bottle share "Nursing Log", pump uses "Pump Log". */
export function feedingLogTitle(type: FeedingType | SessionKind, edit = false): string {
  const base = type === 'pump' ? 'Pump Log' : 'Nursing Log'
  return edit ? `Edit ${base}` : base
}

export function defaultMilkStorage(): MilkStorage {
  return 'fridge'
}

export function draftNeedsVolume(draft: ActiveFeedDraft): boolean {
  return draft.kind === 'pump' && draft.awaitingVolume
}

export function draftCanSave(draft: ActiveFeedDraft): boolean {
  if (draft.kind === 'bottle') {
    return parseVolumeOzInput(draft.volumeOz) != null
  }
  // Pump can always save — volume prompt will surface if it's empty.
  return true
}

export function sideToggleLabel(sides: SideToggle[]): string {
  if (sides.length === 2) return 'Both'
  if (sides.includes('left')) return 'L'
  if (sides.includes('right')) return 'R'
  return ''
}
