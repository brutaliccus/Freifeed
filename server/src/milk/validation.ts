import { HttpsError } from '../errors.js'

export const FEEDING_TYPES = ['nursing', 'pump', 'bottle'] as const
export const NURSING_SIDES = ['left', 'right', 'both'] as const
export const MILK_STORAGE = ['fridge', 'frozen'] as const

export type FeedingType = (typeof FEEDING_TYPES)[number]
export type NursingSide = (typeof NURSING_SIDES)[number]
export type MilkStorage = (typeof MILK_STORAGE)[number]

export interface MilkDeduction {
  lotId: string
  amountOz: number
}

export interface FeedingInputPayload {
  type?: string
  babyId: string
  side: string | null
  startAt: string | null
  endAt: string | null
  volumeOz: number | null
  milkStorage: string | null
  storedAt: string | null
  weightLb: number | null
  weightOz: number | null
  note: string | null
  milkDeductions?: MilkDeduction[]
  milkBagVolumes?: number[]
  addToLotId?: string | null
}

export function roundOz(n: number): number {
  return Math.round(n * 100) / 100
}

export function parseOptionalDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new HttpsError('invalid-argument', 'Invalid date')
  return d.toISOString()
}

export function parseBabyId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!/^[a-z0-9_-]{1,32}$/.test(id)) {
    throw new HttpsError('invalid-argument', 'Invalid baby')
  }
  return id
}

export function parseFeedingType(raw: unknown): FeedingType {
  const type = typeof raw === 'string' ? raw : 'nursing'
  if (!FEEDING_TYPES.includes(type as FeedingType)) {
    throw new HttpsError('invalid-argument', 'Invalid feeding type')
  }
  return type as FeedingType
}

export function parseSide(raw: unknown): NursingSide | null {
  if (raw == null || raw === '') return null
  if (!NURSING_SIDES.includes(raw as NursingSide)) {
    throw new HttpsError('invalid-argument', 'Invalid side')
  }
  return raw as NursingSide
}

export function parseMilkStorage(raw: unknown): MilkStorage | null {
  if (raw == null || raw === '') return null
  if (!MILK_STORAGE.includes(raw as MilkStorage)) {
    throw new HttpsError('invalid-argument', 'Invalid milk storage')
  }
  return raw as MilkStorage
}

export function parseVolumeOz(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new HttpsError('invalid-argument', 'Invalid volume')
  }
  return roundOz(n)
}

export function validateFeedingInput(input: FeedingInputPayload) {
  const type = parseFeedingType(input.type)
  const babyId = parseBabyId(input.babyId)
  const side = parseSide(input.side)
  const volumeOz = parseVolumeOz(input.volumeOz)
  const milkStorage = parseMilkStorage(input.milkStorage)

  if (type === 'bottle' && volumeOz == null) {
    throw new HttpsError('invalid-argument', 'Bottle feeds require volume in oz')
  }
  if (type === 'pump' && volumeOz != null && !milkStorage) {
    throw new HttpsError('invalid-argument', 'Pump sessions require fridge or frozen storage')
  }

  return { type, babyId, side, volumeOz, milkStorage }
}

export function feedingDocFromInput(input: FeedingInputPayload) {
  const { type, babyId, side, volumeOz, milkStorage } = validateFeedingInput(input)
  return {
    type,
    babyId,
    side,
    startAt: parseOptionalDate(input.startAt),
    endAt: parseOptionalDate(input.endAt),
    volumeOz,
    milkStorage,
    storedAt: parseOptionalDate(input.storedAt) ?? parseOptionalDate(input.startAt),
    weightLb: input.weightLb ?? null,
    weightOz: input.weightOz ?? null,
    note: input.note?.trim() || null,
  }
}

export function parseMilkDeductions(raw: unknown): MilkDeduction[] {
  if (!Array.isArray(raw)) return []
  const out: MilkDeduction[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const lotId = 'lotId' in item ? String((item as { lotId: unknown }).lotId) : ''
    const amountOz = 'amountOz' in item ? Number((item as { amountOz: unknown }).amountOz) : NaN
    if (!lotId || !Number.isFinite(amountOz) || amountOz <= 0) continue
    out.push({ lotId, amountOz: roundOz(amountOz) })
  }
  return out
}

export function parseMilkBagVolumes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const oz = Number(item)
    if (!Number.isFinite(oz) || oz <= 0) continue
    out.push(roundOz(oz))
  }
  return out
}

export function parseBagVolumes(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  return raw.map((item) => {
    const n = roundOz(Number(item))
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpsError('invalid-argument', 'Each bag needs a positive volume in oz')
    }
    return n
  })
}
