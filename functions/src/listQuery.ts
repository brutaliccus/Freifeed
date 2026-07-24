import { Timestamp } from 'firebase-admin/firestore'

/** Default history window for timeline collections (feedings, diapers, measurements). */
export const DEFAULT_LIST_SINCE_DAYS = 180

export const MAX_LIST_LIMIT = 5000

export function parseSinceDays(raw: unknown): number {
  if (raw === null || raw === undefined) return DEFAULT_LIST_SINCE_DAYS
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LIST_SINCE_DAYS
  return Math.min(Math.max(Math.floor(n), 7), 730)
}

export function sinceTimestamp(days: number): Timestamp {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  d.setUTCHours(0, 0, 0, 0)
  return Timestamp.fromDate(d)
}
