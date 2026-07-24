import { HttpsError } from 'firebase-functions/v2/https'
import { parseBabyId } from './feedValidation'

export interface MeasurementInputPayload {
  babyId: string
  measuredAt: string
  weightLb: number | null
  weightOz: number | null
  lengthIn: number | null
  headCircIn: number | null
  note?: string | null
}

export function validateMeasurementInput(raw: MeasurementInputPayload) {
  const babyId = parseBabyId(raw.babyId)
  const measuredAt = new Date(raw.measuredAt)
  if (Number.isNaN(measuredAt.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid measurement date')
  }

  const weightLb = raw.weightLb != null ? Number(raw.weightLb) : null
  const weightOz = raw.weightOz != null ? Number(raw.weightOz) : null
  const lengthIn = raw.lengthIn != null ? Number(raw.lengthIn) : null
  const headCircIn = raw.headCircIn != null ? Number(raw.headCircIn) : null

  const hasWeight = weightLb != null || weightOz != null
  const hasLength = lengthIn != null
  const hasHead = headCircIn != null
  if (!hasWeight && !hasLength && !hasHead) {
    throw new HttpsError('invalid-argument', 'Enter at least one measurement')
  }

  if (weightLb != null && (weightLb < 0 || weightLb > 200)) {
    throw new HttpsError('invalid-argument', 'Invalid weight')
  }
  if (weightOz != null && (weightOz < 0 || weightOz >= 16)) {
    throw new HttpsError('invalid-argument', 'Invalid weight ounces')
  }
  if (lengthIn != null && (lengthIn <= 0 || lengthIn > 60)) {
    throw new HttpsError('invalid-argument', 'Invalid length/height')
  }
  if (headCircIn != null && (headCircIn <= 0 || headCircIn > 30)) {
    throw new HttpsError('invalid-argument', 'Invalid head circumference')
  }

  const note =
    typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : null

  return {
    babyId,
    measuredAt,
    weightLb: weightLb ?? null,
    weightOz: weightOz ?? null,
    lengthIn: lengthIn ?? null,
    headCircIn: headCircIn ?? null,
    note,
  }
}
