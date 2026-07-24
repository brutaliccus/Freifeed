import { HttpsError } from 'firebase-functions/v2/https'

export const FEEDING_TYPES = ['nursing', 'pump', 'bottle'] as const
export const NURSING_SIDES = ['left', 'right', 'both'] as const
export const MILK_STORAGE = ['fridge', 'frozen'] as const

export type FeedingType = (typeof FEEDING_TYPES)[number]
export type NursingSide = (typeof NURSING_SIDES)[number]
export type MilkStorage = (typeof MILK_STORAGE)[number]

export interface MilkDeductionPayload {
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
  /** Bottle feeds: explicit milk lot(s) to deduct from. */
  milkDeductions?: MilkDeductionPayload[]
  /** Pump / milk log: split stored volume across multiple bags. */
  milkBagVolumes?: number[]
  /** Pump / milk log: add volume into an existing bag instead of new lot(s). */
  addToLotId?: string | null
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
  return Math.round(n * 100) / 100
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

  // Pump sessions may save with no volume — the user can add it later from
  // milk storage. We just require fridge/frozen once a volume is provided.
  if (type === 'pump' && volumeOz != null && !milkStorage) {
    throw new HttpsError('invalid-argument', 'Pump sessions require fridge or frozen storage')
  }

  return { type, babyId, side, volumeOz, milkStorage }
}
