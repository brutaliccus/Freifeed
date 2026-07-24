import { formatVolumeOz, parseVolumeOzInput, roundVolumeOz } from './feedingTypes'

/** Minimum when splitting into multiple bags (not applied to single-bag transfers). */
export const MIN_BAG_OZ = 0.01

function roundOz(n: number): number {
  return roundVolumeOz(n)
}

export function maxBagsForVolume(remainingOz: number): number {
  if (remainingOz <= 0) return 1
  return Math.max(1, Math.min(24, Math.floor(remainingOz / MIN_BAG_OZ)))
}

/** True when this row is auto-filled as total minus earlier bags. */
export function isAutoLastBag(index: number, count: number): boolean {
  return count > 1 && index === count - 1
}

/** Remainder for the last bag once all earlier bags have valid amounts. */
export function lastBagRemainderOz(
  totalOz: number,
  bagVolumes: string[],
  count: number,
): number | null {
  if (count <= 1) return null
  const total = roundOz(totalOz)
  let sum = 0
  for (let i = 0; i < count - 1; i++) {
    const raw = bagVolumes[i] ?? ''
    if (!raw.trim()) return null
    const oz = parseVolumeOzInput(raw)
    if (oz == null) return null
    sum = roundOz(sum + oz)
  }
  return roundOz(total - sum)
}

export function maxOzForBag(
  index: number,
  bagVolumes: string[],
  count: number,
  totalOz: number,
): number {
  if (count <= 1) return roundOz(totalOz)
  if (isAutoLastBag(index, count)) {
    const rem = lastBagRemainderOz(totalOz, bagVolumes, count)
    return rem != null ? Math.max(0, rem) : roundOz(totalOz)
  }

  let sumOthers = 0
  for (let j = 0; j < count - 1; j++) {
    if (j === index) continue
    const parsed = parseVolumeOzInput(bagVolumes[j] ?? '')
    if (parsed != null) sumOthers = roundOz(sumOthers + parsed)
  }
  return roundOz(Math.max(0, totalOz - sumOthers))
}

/** Write auto remainder into the last bag slot when earlier bags are filled. */
export function bagVolumesWithAutoLast(
  bagVolumes: string[],
  count: number,
  totalOz: number,
): string[] {
  if (count <= 1) return bagVolumes
  const rem = lastBagRemainderOz(totalOz, bagVolumes, count)
  if (rem == null) return bagVolumes
  const next = Array.from({ length: count }, (_, i) => bagVolumes[i] ?? '')
  next[count - 1] = formatVolumeOz(rem) || String(rem)
  return next
}

export type BagSplitValidation = {
  valid: boolean
  message: string | null
  totalOz: number
}

export function validateBagSplit(
  remainingOz: number,
  count: number,
  bagVolumes: string[],
): BagSplitValidation {
  const total = roundOz(remainingOz)
  if (count < 1) {
    return { valid: false, message: 'Enter at least one bag', totalOz: 0 }
  }

  if (count > maxBagsForVolume(total)) {
    return {
      valid: false,
      message: `Cannot split ${total} oz into ${count} bags (min ${MIN_BAG_OZ} oz each)`,
      totalOz: 0,
    }
  }

  if (count === 1) {
    const raw = bagVolumes[0] ?? ''
    if (!raw.trim()) {
      return { valid: false, message: null, totalOz: 0 }
    }
    const oz = parseVolumeOzInput(raw)
    if (oz == null) {
      return { valid: false, message: 'Enter a valid amount', totalOz: 0 }
    }
    if (oz <= 0) {
      return { valid: false, message: 'Volume must be greater than 0 oz', totalOz: 0 }
    }
    if (Math.abs(oz - total) > 0.01) {
      return {
        valid: false,
        message: `Must equal ${formatVolumeOz(total) || total} oz for a single bag`,
        totalOz: oz,
      }
    }
    return { valid: true, message: null, totalOz: oz }
  }

  let sum = 0
  for (let i = 0; i < count - 1; i++) {
    const raw = bagVolumes[i] ?? ''
    if (!raw.trim()) {
      return { valid: false, message: null, totalOz: sum }
    }
    const oz = parseVolumeOzInput(raw)
    if (oz == null) {
      return { valid: false, message: `Bag ${i + 1} needs a valid amount`, totalOz: sum }
    }
    if (oz <= 0) {
      return { valid: false, message: `Bag ${i + 1} must be greater than 0 oz`, totalOz: sum }
    }
    const maxForBag = maxOzForBag(i, bagVolumes, count, total)
    if (oz > maxForBag + 0.001) {
      return {
        valid: false,
        message: `Bag ${i + 1} is too large — max ${formatVolumeOz(maxForBag) || maxForBag} oz`,
        totalOz: sum,
      }
    }
    sum = roundOz(sum + oz)
  }

  const remainder = lastBagRemainderOz(total, bagVolumes, count)
  if (remainder == null) {
    return { valid: false, message: null, totalOz: sum }
  }
  if (remainder <= 0) {
    return {
      valid: false,
      message: `Last bag would be empty — use 1 bag or enter a smaller amount in bag ${count - 1}`,
      totalOz: sum,
    }
  }
  if (remainder < MIN_BAG_OZ - 0.001) {
    return {
      valid: false,
      message: `Last bag would be under ${MIN_BAG_OZ} oz — use fewer bags or adjust earlier amounts`,
      totalOz: roundOz(sum + remainder),
    }
  }

  const fullTotal = roundOz(sum + remainder)
  if (Math.abs(fullTotal - total) > 0.01) {
    return {
      valid: false,
      message: `Bag volumes must total ${formatVolumeOz(total) || total} oz`,
      totalOz: fullTotal,
    }
  }

  return { valid: true, message: null, totalOz: fullTotal }
}

/** Final oz per bag for save, including auto-filled last bag. */
export function resolveBagSplitVolumes(
  totalOz: number,
  count: number,
  bagVolumes: string[],
): number[] | null {
  const validation = validateBagSplit(totalOz, count, bagVolumes)
  if (!validation.valid) return null

  if (count === 1) {
    const oz = parseVolumeOzInput(bagVolumes[0] ?? '')
    return oz != null ? [oz] : null
  }

  const remainder = lastBagRemainderOz(totalOz, bagVolumes, count)
  if (remainder == null || remainder <= 0) return null

  const out: number[] = []
  for (let i = 0; i < count - 1; i++) {
    const oz = parseVolumeOzInput(bagVolumes[i] ?? '')
    if (oz == null) return null
    out.push(oz)
  }
  out.push(remainder)
  return out
}

export function applyBagSplitVolumeChange(
  index: number,
  raw: string,
  bagVolumes: string[],
  count: number,
  totalOz: number,
): { volumes: string[]; error: string | null } {
  if (isAutoLastBag(index, count)) {
    return { volumes: bagVolumes, error: null }
  }

  const next = Array.from({ length: count }, (_, i) => bagVolumes[i] ?? '')
  next[index] = raw

  const parsed = parseVolumeOzInput(raw)
  let error: string | null = null
  if (parsed != null && raw.trim()) {
    const max = maxOzForBag(index, next, count, totalOz)
    if (parsed > max + 0.001) {
      next[index] = formatVolumeOz(max) || String(max)
      error = `Bag ${index + 1} capped at ${formatVolumeOz(max) || max} oz`
    }
  }

  return {
    volumes: bagVolumesWithAutoLast(next, count, totalOz),
    error,
  }
}
