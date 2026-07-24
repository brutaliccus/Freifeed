import { Timestamp, type DocumentData } from 'firebase/firestore'
import type {
  AppointmentRecurrence,
  BabyNote,
  Diaper,
  Feeding,
  Measurement,
  Medicine,
  MilkDeduction,
  MilkLot,
} from '../types'

/**
 * Client-side document mappers for direct Firestore listeners.
 * These mirror the serializers in `functions/src/*` but keep native Firestore
 * `Timestamp` objects (no ISO round-trip) — which is exactly what app types expect.
 */

function tsOrNull(value: unknown): Timestamp | null {
  if (value == null) return null
  if (value instanceof Timestamp) return value
  if (typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    try {
      return Timestamp.fromMillis((value as { toMillis: () => number }).toMillis())
    } catch {
      return null
    }
  }
  if (typeof value === 'object' && '__ts' in (value as object)) {
    const ms = Number((value as { __ts: unknown }).__ts)
    return Number.isFinite(ms) ? Timestamp.fromMillis(ms) : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Timestamp.fromMillis(value)
  }
  return null
}

/** Prefer real field; fall back so sort/cache never see undefined timestamps. */
function tsRequired(value: unknown, fallback?: unknown): Timestamp {
  return tsOrNull(value) ?? tsOrNull(fallback) ?? Timestamp.fromMillis(0)
}

export function mapFeeding(id: string, data: DocumentData): Feeding {
  const createdAt = tsRequired(data.createdAt, data.updatedAt)
  return {
    id,
    type: data.type ?? 'nursing',
    babyId: data.babyId,
    side: data.side ?? null,
    startAt: tsOrNull(data.startAt),
    endAt: tsOrNull(data.endAt),
    volumeOz: data.volumeOz ?? null,
    milkStorage: data.milkStorage ?? null,
    storedAt: tsOrNull(data.storedAt),
    milkLotId: data.milkLotId ?? null,
    milkDeductions: Array.isArray(data.milkDeductions)
      ? (data.milkDeductions as MilkDeduction[])
      : [],
    weightLb: data.weightLb ?? null,
    weightOz: data.weightOz ?? null,
    note: data.note ?? null,
    createdAt,
    updatedAt: tsRequired(data.updatedAt, createdAt),
  }
}

export function mapDiaper(id: string, data: DocumentData): Diaper {
  const changedAt = tsRequired(data.changedAt, data.createdAt)
  const createdAt = tsRequired(data.createdAt, changedAt)
  return {
    id,
    babyId: data.babyId,
    kind: data.kind,
    changedAt,
    note: data.note ?? null,
    createdAt,
    updatedAt: tsRequired(data.updatedAt, createdAt),
  }
}

export function mapMeasurement(id: string, data: DocumentData): Measurement {
  const measuredAt = tsRequired(data.measuredAt, data.createdAt)
  const createdAt = tsRequired(data.createdAt, measuredAt)
  return {
    id,
    babyId: data.babyId,
    measuredAt,
    weightLb: data.weightLb ?? null,
    weightOz: data.weightOz ?? null,
    lengthIn: data.lengthIn ?? null,
    headCircIn: data.headCircIn ?? null,
    note: data.note ?? null,
    createdAt,
    updatedAt: tsRequired(data.updatedAt, createdAt),
  }
}

export function mapMilkLot(id: string, data: DocumentData): MilkLot {
  const pumpedAt = tsRequired(data.pumpedAt, data.storedAt ?? data.createdAt)
  const storedAt = tsRequired(data.storedAt, pumpedAt)
  const createdAt = tsRequired(data.createdAt, storedAt)
  return {
    id,
    pumpedAt,
    storedAt,
    volumeOz: data.volumeOz ?? 0,
    remainingOz: data.remainingOz ?? 0,
    storage: data.storage === 'frozen' ? 'frozen' : 'fridge',
    feedingId: data.feedingId ?? null,
    note: data.note ?? null,
    createdAt,
    updatedAt: tsRequired(data.updatedAt, createdAt),
  }
}

export function mapMedicine(id: string, data: DocumentData): Medicine {
  const forPersonId =
    typeof data.forPersonId === 'string' && data.forPersonId.includes(':')
      ? data.forPersonId
      : 'baby:unknown'
  const startedAt = tsRequired(data.startedAt, data.createdAt)
  const createdAt = tsRequired(data.createdAt, startedAt)
  return {
    id,
    forPersonId,
    name: data.name ?? '',
    totalPills: data.totalPills ?? 0,
    dosage: data.dosage ?? '',
    category: data.category === 'as_needed' ? 'as_needed' : 'required',
    durationDays: data.durationDays ?? null,
    frequency: data.frequency ?? { type: 'daily', times: ['08:00'], intervalHours: null },
    startedAt,
    lastTakenAt: tsOrNull(data.lastTakenAt),
    active: data.active !== false,
    createdAt,
    updatedAt: tsRequired(data.updatedAt, createdAt),
  }
}

function parseForPersonIdsFromDoc(data: DocumentData, fallback: string): string[] {
  const raw = data.forPersonIds
  if (Array.isArray(raw)) {
    const ids = raw.filter((id): id is string => typeof id === 'string' && id.includes(':'))
    if (ids.length > 0) return ids
  }
  return fallback ? [fallback] : []
}

function legacyBabyId(forPersonId: string): string | null {
  return forPersonId.startsWith('baby:') ? forPersonId.slice(5) : null
}

function parseInviteeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is string => typeof id === 'string' && id.includes(':'))
}

function parseRecurrenceFromDoc(raw: unknown): AppointmentRecurrence | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const frequency = r.frequency
  if (typeof frequency !== 'string') return null
  return {
    frequency: frequency as AppointmentRecurrence['frequency'],
    count: typeof r.count === 'number' ? r.count : null,
    endAt: typeof r.endAt === 'string' ? r.endAt : null,
  }
}

export function mapNote(id: string, data: DocumentData): BabyNote {
  const forPersonIdRaw =
    typeof data.forPersonId === 'string' && data.forPersonId.includes(':')
      ? data.forPersonId
      : data.babyId
        ? `baby:${data.babyId}`
        : ''
  const forPersonIds = parseForPersonIdsFromDoc(data, forPersonIdRaw)
  const primary = forPersonIds[0] ?? forPersonIdRaw
  return {
    id,
    forPersonId: primary,
    forPersonIds,
    babyId: legacyBabyId(primary),
    kind: typeof data.kind === 'string' ? (data.kind as BabyNote['kind']) : 'todo',
    text: data.text,
    details: data.details ?? null,
    scheduledAt: tsOrNull(data.scheduledAt),
    reminderMinutesBefore:
      typeof data.reminderMinutesBefore === 'number' ? data.reminderMinutesBefore : null,
    recurrence: parseRecurrenceFromDoc(data.recurrence),
    inviteePersonIds: parseInviteeIds(data.inviteePersonIds),
    archived: data.archived === true,
    completedAt: tsOrNull(data.completedAt),
    lastArchivedOccurrenceAt: tsOrNull(data.lastArchivedOccurrenceAt),
    createdAt: tsRequired(data.createdAt, data.updatedAt),
    updatedAt: tsRequired(data.updatedAt, data.createdAt),
  }
}
