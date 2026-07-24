export type DiaperKind = 'wet' | 'poop' | 'both'

export interface DiaperInputPayload {
  babyId: string
  kind: DiaperKind
  changedAt: string | null
  note?: string | null
}

const KINDS: DiaperKind[] = ['wet', 'poop', 'both']

export function validateDiaperInput(input: DiaperInputPayload): {
  babyId: string
  kind: DiaperKind
  changedAt: Date
  note: string | null
} {
  const babyId = typeof input.babyId === 'string' ? input.babyId.trim() : ''
  if (!babyId) throw new Error('babyId required')

  const kind = input.kind
  if (!KINDS.includes(kind)) throw new Error('Invalid diaper type')

  const changedAt = input.changedAt ? new Date(input.changedAt) : new Date()
  if (Number.isNaN(changedAt.getTime())) throw new Error('Invalid date')

  const note =
    input.note == null || input.note === ''
      ? null
      : String(input.note).trim().slice(0, 500) || null

  return { babyId, kind, changedAt, note }
}
