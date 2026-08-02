import { format } from 'date-fns'
import { markMedicineAlertFired, shouldAlertMedicineDue } from './medicineAlertState'
import { timestampToDate } from './time'
import type { Medicine, MedicineCategory, MedicineFrequency } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

export const FREQUENCY_LABELS: Record<MedicineFrequency['type'], string> = {
  daily: 'Daily',
  twice_daily: 'Twice daily',
  three_times_daily: '3 times daily',
  periodic: 'Periodically',
}

/** Common medicine dosage units. First entry is the default. */
export const DOSAGE_UNITS = [
  'mg',
  'mcg',
  'g',
  'ml',
  'IU',
  'tsp',
  'tbsp',
  'drop',
  'puff',
] as const
export type DosageUnit = (typeof DOSAGE_UNITS)[number]

const DOSAGE_UNIT_RE = new RegExp(`\\b(${DOSAGE_UNITS.join('|')})\\b`, 'i')

/** Parse a stored dosage string ("500 mg", "5mg") into amount + unit. */
export function parseDosageString(raw: string | null | undefined): {
  amount: string
  unit: DosageUnit
} {
  const text = (raw ?? '').trim()
  if (!text) return { amount: '', unit: 'mg' }
  const match = text.match(/^([\d.]+)\s*([a-zA-Z]+)?$/)
  if (match) {
    const amount = match[1]
    const rawUnit = (match[2] ?? '').toLowerCase()
    const unit = DOSAGE_UNITS.find((u) => u.toLowerCase() === rawUnit) ?? 'mg'
    return { amount, unit }
  }
  const unitMatch = text.match(DOSAGE_UNIT_RE)
  const unit =
    (unitMatch ? DOSAGE_UNITS.find((u) => u.toLowerCase() === unitMatch[1].toLowerCase()) : null) ??
    'mg'
  const amountMatch = text.match(/[\d.]+/)
  return { amount: amountMatch?.[0] ?? '', unit }
}

export function composeDosage(amount: string, unit: DosageUnit): string {
  const trimmed = amount.trim()
  if (!trimmed) return ''
  return `${trimmed} ${unit}`
}

export function formatPillCount(totalPills: number): string {
  if (!Number.isFinite(totalPills) || totalPills <= 0) return ''
  return `${totalPills} pill${totalPills === 1 ? '' : 's'}`
}

/** Notification body, e.g. "3 pills @ 325 mg". */
export function formatMedicineNotificationBody(
  totalPills: number,
  dosage: string | null | undefined,
): string {
  const pills = formatPillCount(totalPills)
  const dose = (dosage ?? '').trim()
  if (pills && dose) return `${pills} @ ${dose}`
  if (pills) return pills
  if (dose) return dose
  return 'Time for your dose'
}

export function isAsNeededMedicine(medicine: Pick<Medicine, 'category'>): boolean {
  return medicine.category === 'as_needed'
}

/** Notification title — as-needed uses softer “another dose” wording. */
export function formatMedicineNotificationTitle(
  name: string,
  category: MedicineCategory,
): string {
  const label = name.trim() || 'your medicine'
  if (category === 'as_needed') {
    return `You can take another ${label} now`
  }
  return `💊 ${label}`
}

export function formatMedicineNotificationSubtitle(
  totalPills: number,
  dosage: string | null | undefined,
  category: MedicineCategory,
): string {
  if (category === 'as_needed') {
    const detail = formatMedicineNotificationBody(totalPills, dosage)
    return detail === 'Time for your dose' ? 'Tap “I took it” when you dose' : detail
  }
  return formatMedicineNotificationBody(totalPills, dosage)
}

/** Card / banner line when a dose window is open. */
export function formatDoseDueLabel(medicine: Pick<Medicine, 'category' | 'name'>): string {
  if (medicine.category === 'as_needed') {
    const label = medicine.name.trim() || 'medicine'
    return `You can take another ${label} now`
  }
  return 'Due now'
}

/** Countdown line on the taken overlay. */
export function formatTakenCountdownLabel(medicine: Pick<Medicine, 'category'>): string {
  return medicine.category === 'as_needed' ? 'Available again in' : 'Next dose in'
}

/** “Next dose” row on the card. */
export function formatNextDosePrefix(
  medicine: Pick<Medicine, 'category' | 'name'>,
  doseDue: boolean,
): string {
  if (doseDue) return `${formatDoseDueLabel(medicine)} — `
  if (medicine.category === 'as_needed') return 'Available again · '
  return 'Next dose · '
}

export const DEFAULT_TIMES_BY_FREQUENCY: Record<MedicineFrequency['type'], string[]> = {
  daily: ['08:00'],
  twice_daily: ['08:00', '20:00'],
  three_times_daily: ['06:00', '12:00', '18:00'],
  periodic: [],
}

export function expectedTimeCount(type: MedicineFrequency['type']): number {
  if (type === 'daily') return 1
  if (type === 'twice_daily') return 2
  if (type === 'three_times_daily') return 3
  return 0
}

/** Build a default frequency object for a given type. */
export function defaultFrequency(type: MedicineFrequency['type']): MedicineFrequency {
  return {
    type,
    times: [...DEFAULT_TIMES_BY_FREQUENCY[type]],
    intervalHours: type === 'periodic' ? 4 : null,
  }
}

/** Has the medicine's duration window elapsed? Indefinite meds never expire. */
export function isDurationExpired(medicine: Medicine, now = new Date()): boolean {
  if (medicine.durationDays == null) return false
  const started = timestampToDate(medicine.startedAt)
  if (!started) return false
  const expiry = started.getTime() + medicine.durationDays * DAY_MS
  return now.getTime() >= expiry
}

export function daysRemaining(medicine: Medicine, now = new Date()): number | null {
  if (medicine.durationDays == null) return null
  const started = timestampToDate(medicine.startedAt)
  if (!started) return 0
  const expiry = started.getTime() + medicine.durationDays * DAY_MS
  const remainingMs = expiry - now.getTime()
  if (remainingMs <= 0) return 0
  return Math.ceil(remainingMs / DAY_MS)
}

/** Effective active state: user has marked active AND duration hasn't elapsed. */
export function isMedicineActiveNow(medicine: Medicine, now = new Date()): boolean {
  if (!medicine.active) return false
  if (isDurationExpired(medicine, now)) return false
  return true
}

export function formatTimeOfDay(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return format(d, 'h:mm a')
}

export function describeFrequency(frequency: MedicineFrequency): string {
  if (frequency.type === 'periodic') {
    const hours = frequency.intervalHours ?? 0
    return hours === 1 ? 'Every hour' : `Every ${hours} hours`
  }
  const times = frequency.times.map(formatTimeOfDay).join(' · ')
  return `${FREQUENCY_LABELS[frequency.type]} (${times})`
}

/** Build a date for a specific HH:mm time on a given calendar day. */
function dateAtSlot(base: Date, slot: string, dayOffset = 0): Date | null {
  const [hStr, mStr] = slot.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}

/** Minimum hours between as-needed doses derived from frequency (not clock times). */
export function asNeededIntervalHours(
  frequency: Medicine['frequency'],
): number | null {
  if (frequency.type === 'periodic') {
    const h = frequency.intervalHours ?? 0
    return h > 0 ? h : null
  }
  if (frequency.type === 'daily') return 24
  if (frequency.type === 'twice_daily') return 12
  if (frequency.type === 'three_times_daily') return 8
  return null
}

function mostRecentAsNeededDueAtMs(medicine: Medicine, now: Date): number | null {
  const hours = asNeededIntervalHours(medicine.frequency)
  if (hours == null) return null
  const intervalMs = hours * 60 * 60 * 1000
  const lastTaken = timestampToDate(medicine.lastTakenAt)
  // As-needed: only prompt after a logged dose, once the minimum interval has passed.
  if (!lastTaken) return null
  const dueAt = lastTaken.getTime() + intervalMs
  return dueAt <= now.getTime() ? dueAt : null
}

function nextAsNeededDueAtMs(medicine: Medicine, now: Date): number | null {
  const hours = asNeededIntervalHours(medicine.frequency)
  if (hours == null) return null
  const intervalMs = hours * 60 * 60 * 1000
  const lastTaken = timestampToDate(medicine.lastTakenAt)
  if (!lastTaken) return null
  const nextAt = lastTaken.getTime() + intervalMs
  return nextAt > now.getTime() ? nextAt : null
}

/** Compute the most recent past slot (≤ now). null if none has happened yet. */
export function mostRecentDueAtMs(medicine: Medicine, now = new Date()): number | null {
  if (medicine.category === 'as_needed') {
    return mostRecentAsNeededDueAtMs(medicine, now)
  }

  if (medicine.frequency.type === 'periodic') {
    return mostRecentPeriodicDueAtMs(medicine, now)
  }

  const candidates: number[] = []
  for (const slot of medicine.frequency.times) {
    const today = dateAtSlot(now, slot, 0)
    const yesterday = dateAtSlot(now, slot, -1)
    if (today && today.getTime() <= now.getTime()) candidates.push(today.getTime())
    if (yesterday && yesterday.getTime() <= now.getTime()) candidates.push(yesterday.getTime())
  }
  if (candidates.length === 0) return null
  return Math.max(...candidates)
}

function mostRecentPeriodicDueAtMs(
  medicine: Pick<Medicine, 'frequency' | 'lastTakenAt' | 'startedAt'>,
  now: Date,
): number | null {
  const intervalMs = (medicine.frequency.intervalHours ?? 0) * 60 * 60 * 1000
  if (intervalMs <= 0) return null
  const lastTaken = timestampToDate(medicine.lastTakenAt)
  if (lastTaken) {
    const dueAt = lastTaken.getTime() + intervalMs
    return dueAt <= now.getTime() ? dueAt : null
  }
  const started = timestampToDate(medicine.startedAt)
  if (!started) return null
  return now.getTime() >= started.getTime() ? started.getTime() : null
}

/** Compute the next future dose time (strictly > now). */
export function nextDueAtMs(medicine: Medicine, now = new Date()): number | null {
  if (medicine.category === 'as_needed') {
    return nextAsNeededDueAtMs(medicine, now)
  }

  if (medicine.frequency.type === 'periodic') {
    return nextPeriodicDueAtMs(medicine, now)
  }

  const candidates: number[] = []
  for (const slot of medicine.frequency.times) {
    const today = dateAtSlot(now, slot, 0)
    const tomorrow = dateAtSlot(now, slot, 1)
    if (today && today.getTime() > now.getTime()) candidates.push(today.getTime())
    if (tomorrow) candidates.push(tomorrow.getTime())
  }
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

function nextPeriodicDueAtMs(
  medicine: Pick<Medicine, 'frequency' | 'lastTakenAt' | 'startedAt'>,
  now: Date,
): number | null {
  const intervalMs = (medicine.frequency.intervalHours ?? 0) * 60 * 60 * 1000
  if (intervalMs <= 0) return null
  const lastTaken = timestampToDate(medicine.lastTakenAt)
  if (lastTaken) {
    return lastTaken.getTime() + intervalMs
  }
  const started = timestampToDate(medicine.startedAt)
  if (!started) return null
  if (started.getTime() > now.getTime()) return started.getTime()
  return started.getTime() + intervalMs
}

/**
 * Is the latest scheduled dose still waiting to be acknowledged?
 * - No `mostRecentDue` yet → not due (medicine hasn't started its first dose).
 * - Has `lastTakenAt` ≥ `mostRecentDue` → already acknowledged.
 */
export function isDoseDue(medicine: Medicine, now = new Date()): boolean {
  const due = mostRecentDueAtMs(medicine, now)
  if (due == null) return false
  const lastTaken = timestampToDate(medicine.lastTakenAt)
  if (!lastTaken) return true
  return lastTaken.getTime() < due
}

/**
 * In-app banner only: required meds stay visible while a dose is untaken.
 * Push notifications use shouldAlertMedicineDue separately so cold opens do not re-alert.
 */
export function shouldShowInAppDueBanner(medicine: Medicine, now = new Date()): boolean {
  if (!isMedicineActiveNow(medicine, now) || !isDoseDue(medicine, now)) return false
  if (medicine.category !== 'as_needed') return true
  const dueMs = mostRecentDueAtMs(medicine, now)
  if (dueMs == null) return false
  return shouldAlertMedicineDue(medicine.id, dueMs)
}

/** After the in-app banner is dismissed, don't re-prompt as-needed until the dose is taken. */
export function acknowledgeInAppDueBanner(medicines: Medicine[], now = new Date()): void {
  for (const m of medicines) {
    if (m.category !== 'as_needed' || !isDoseDue(m, now)) continue
    const dueMs = mostRecentDueAtMs(m, now)
    if (dueMs != null) markMedicineAlertFired(m.id, dueMs)
  }
}

export function formatLastTakenAt(medicine: Medicine, now = new Date()): string {
  const at = timestampToDate(medicine.lastTakenAt)
  if (!at) return ''
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()
  return sameDay ? format(at, 'h:mm a') : format(at, 'MMM d, h:mm a')
}

export function formatCountdownMs(ms: number): string {
  if (ms <= 0) return 'Due now'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function formatNextDose(medicine: Medicine, now = new Date()): string {
  const due = nextDueAtMs(medicine, now)
  if (due == null) return ''
  const date = new Date(due)
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return sameDay ? format(date, 'h:mm a') : format(date, 'EEE h:mm a')
}

export function formatDoseTime(at: number | Date, now = new Date()): string {
  const date = at instanceof Date ? at : new Date(at)
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return sameDay ? format(date, 'h:mm a') : format(date, 'EEE h:mm a')
}

export interface LastDoseOption {
  id: string
  label: string
  /** null = "haven't taken yet" */
  takenAt: Date | null
}

/**
 * Build the "When did you last take it?" picker for onboarding.
 * Derived from the chosen frequency so it always speaks in the user's cadence.
 *
 * Never returns options whose `takenAt` is in the future relative to `now`.
 */
export function lastDoseOptions(
  frequency: MedicineFrequency,
  now = new Date(),
): LastDoseOption[] {
  const opts: LastDoseOption[] = [
    { id: 'none', label: "Haven't taken it yet", takenAt: null },
    { id: 'now', label: 'Just now', takenAt: new Date(now) },
  ]

  if (frequency.type === 'periodic') {
    // Periodic meds use a custom time picker — see `customTimeToDate` below.
    return opts
  }

  // Scheduled frequencies: enumerate past slots (today + yesterday), newest first.
  const slotEntries: { slotIndex: number; at: Date }[] = []
  for (const dayOffset of [0, -1]) {
    frequency.times.forEach((slot, i) => {
      const at = dateAtSlot(now, slot, dayOffset)
      if (at && at.getTime() <= now.getTime()) {
        slotEntries.push({ slotIndex: i, at })
      }
    })
  }
  slotEntries.sort((a, b) => b.at.getTime() - a.at.getTime())

  const slotLabels = frequencyTimeLabels(frequency.type)
  for (const entry of slotEntries.slice(0, 4)) {
    const slotLabel = slotLabels[entry.slotIndex] ?? formatTimeOfDay(frequency.times[entry.slotIndex] ?? '')
    opts.push({
      id: `${entry.at.toISOString()}`,
      label: `${slotLabel} dose at ${formatDoseTime(entry.at, now)}`,
      takenAt: entry.at,
    })
  }

  return opts
}

/**
 * Convert an "HH:mm" time + optional day offset to the most recent past instance
 * of that time relative to `now`. If `time` resolves to a moment > now today,
 * we roll back one day so the user can't accidentally pick a future first dose.
 */
export function customTimeToDate(time: string, now = new Date()): Date | null {
  const today = dateAtSlot(now, time, 0)
  if (!today) return null
  if (today.getTime() <= now.getTime()) return today
  const yesterday = dateAtSlot(now, time, -1)
  return yesterday ?? null
}

function frequencyTimeLabels(type: MedicineFrequency['type']): string[] {
  if (type === 'daily') return ["Today's"]
  if (type === 'twice_daily') return ['Morning', 'Evening']
  if (type === 'three_times_daily') return ['Morning', 'Midday', 'Evening']
  return []
}

const OVERDUE_FOLLOWUP_1H_MS = 60 * 60 * 1000
const OVERDUE_FOLLOWUP_3H_MS = 3 * 60 * 60 * 1000

export type MedicineOverdueKind = 'overdue-1h' | 'overdue-3h'

export interface MedicineOverdueAlarm {
  medicineId: string
  slotDueMs: number
  kind: MedicineOverdueKind
  atMs: number
  title: string
  body: string
}

/** Scheduled dose times (past + near future) for required medicines. */
export function enumerateMedicineDueSlotTimes(
  medicine: Medicine,
  now = new Date(),
  lookBackHours = 72,
  lookAheadHours = 36,
): number[] {
  if (medicine.category === 'as_needed') return []
  const started = timestampToDate(medicine.startedAt)
  if (!started) return []

  const minMs = now.getTime() - lookBackHours * 60 * 60 * 1000
  const maxMs = now.getTime() + lookAheadHours * 60 * 60 * 1000
  const slots: number[] = []

  if (medicine.frequency.type === 'periodic') {
    const intervalMs = (medicine.frequency.intervalHours ?? 0) * 60 * 60 * 1000
    if (intervalMs <= 0) return []
    let t = timestampToDate(medicine.lastTakenAt)?.getTime() ?? started.getTime()
    if (medicine.lastTakenAt) {
      t += intervalMs
    }
    while (t <= maxMs) {
      if (t >= minMs) slots.push(t)
      t += intervalMs
    }
    return slots
  }

  for (let dayOffset = -3; dayOffset <= 2; dayOffset++) {
    for (const slot of medicine.frequency.times) {
      const at = dateAtSlot(now, slot, dayOffset)
      if (at) {
        const ms = at.getTime()
        if (ms >= minMs && ms <= maxMs) slots.push(ms)
      }
    }
  }
  return [...new Set(slots)].sort((a, b) => a - b)
}

export function buildMedicineOverdueFollowups(
  medicine: Medicine,
  now = new Date(),
): MedicineOverdueAlarm[] {
  if (medicine.category === 'as_needed') return []
  if (!isMedicineActiveNow(medicine, now)) return []

  const lastTakenMs = timestampToDate(medicine.lastTakenAt)?.getTime() ?? 0
  const nowMs = now.getTime()
  const out: MedicineOverdueAlarm[] = []
  const label = medicine.name.trim() || 'medicine'

  for (const slotDueMs of enumerateMedicineDueSlotTimes(medicine, now)) {
    if (lastTakenMs >= slotDueMs) continue

    const push = (kind: MedicineOverdueKind, offsetMs: number, title: string, body: string) => {
      const atMs = slotDueMs + offsetMs
      if (lastTakenMs >= slotDueMs || lastTakenMs >= atMs) return
      if (atMs <= nowMs) return
      out.push({ medicineId: medicine.id, slotDueMs, kind, atMs, title, body })
    }

    push(
      'overdue-1h',
      OVERDUE_FOLLOWUP_1H_MS,
      `Still need ${label}?`,
      `Scheduled dose was 1 hour ago — tap “I took it” when done.`,
    )
    push(
      'overdue-3h',
      OVERDUE_FOLLOWUP_3H_MS,
      `${label} — 3 hours overdue`,
      `This dose was due 3 hours ago and is not logged yet.`,
    )
  }

  return out.sort((a, b) => a.atMs - b.atMs)
}
