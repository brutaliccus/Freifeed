import type { Baby, BabyId } from '../types'

export const BABY_BORDER_COLORS = [
  { id: 'blush', label: 'Blush', border: '#d4a5b5', shadow: 'rgba(201, 160, 184, 0.5)' },
  { id: 'rose', label: 'Rose', border: '#e8b4cc', shadow: 'rgba(232, 180, 204, 0.55)' },
  { id: 'mauve', label: 'Mauve', border: '#c9a0b8', shadow: 'rgba(201, 160, 184, 0.48)' },
  { id: 'lavender', label: 'Lavender', border: '#b8a8d8', shadow: 'rgba(184, 168, 216, 0.5)' },
  { id: 'sage', label: 'Sage', border: '#8fb89a', shadow: 'rgba(143, 184, 154, 0.5)' },
  { id: 'cream', label: 'Cream', border: '#e0c4b4', shadow: 'rgba(224, 196, 180, 0.5)' },
] as const

export type BabyBorderColorId = (typeof BABY_BORDER_COLORS)[number]['id']

export const BABY_BORDER_COLOR_IDS: BabyBorderColorId[] = BABY_BORDER_COLORS.map((c) => c.id)

const DEFAULT_BY_BABY: Record<BabyId, BabyBorderColorId> = {
  ingrid: 'blush',
  willow: 'lavender',
}

function defaultColorForBabyId(babyId: string): BabyBorderColorId {
  if (babyId in DEFAULT_BY_BABY) return DEFAULT_BY_BABY[babyId]!
  let h = 0
  for (let i = 0; i < babyId.length; i++) h = (h + babyId.charCodeAt(i)) % BABY_BORDER_COLOR_IDS.length
  return BABY_BORDER_COLOR_IDS[h]!
}

export function resolveBabyBorderColor(baby: Baby | BabyId): (typeof BABY_BORDER_COLORS)[number] {
  const babyId = typeof baby === 'string' ? baby : baby.id
  const saved = typeof baby === 'string' ? null : baby.borderColorId
  const id = (saved && BABY_BORDER_COLOR_IDS.includes(saved as BabyBorderColorId)
    ? saved
    : defaultColorForBabyId(babyId)) as BabyBorderColorId
  return BABY_BORDER_COLORS.find((c) => c.id === id) ?? BABY_BORDER_COLORS[0]
}

export function babyBorderRingStyle(baby: Baby | BabyId): {
  '--baby-ring-border': string
  '--baby-ring-shadow': string
} {
  const c = resolveBabyBorderColor(baby)
  return {
    '--baby-ring-border': c.border,
    '--baby-ring-shadow': c.shadow,
  }
}
