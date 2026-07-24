import { type Baby, type BabyId, type HouseholdMember, type Medicine } from '../types'
import { firstBabyId } from './babyUtils'

/** `baby:ingrid` or `member:<firebase uid>` */
export type MedicineForPersonId = string

export interface MedicineSubject {
  id: MedicineForPersonId
  label: string
  kind: 'baby' | 'member'
}

export function babySubjectId(babyId: BabyId): MedicineForPersonId {
  return `baby:${babyId}`
}

export function memberSubjectId(uid: string): MedicineForPersonId {
  return `member:${uid}`
}

export function defaultMedicineForPersonId(babies: Baby[]): MedicineForPersonId {
  const first = firstBabyId(babies)
  return first ? babySubjectId(first) : 'baby:unknown'
}

function nicknameLabel(
  personId: MedicineForPersonId,
  fallback: string,
  personNicknames?: Record<string, string>,
): string {
  const nick = personNicknames?.[personId]?.trim()
  return nick || fallback
}

export function buildMedicineSubjects(
  babies: Baby[],
  members: HouseholdMember[],
  personNicknames?: Record<string, string>,
): MedicineSubject[] {
  const out: MedicineSubject[] = []
  for (const baby of babies) {
    const id = babySubjectId(baby.id)
    const fallback = baby.name || baby.id
    out.push({
      id,
      label: nicknameLabel(id, fallback, personNicknames),
      kind: 'baby',
    })
  }
  const seen = new Set(out.map((s) => s.id))
  for (const m of members) {
    const id = memberSubjectId(m.uid)
    if (seen.has(id)) continue
    seen.add(id)
    const fallback = (m.displayName ?? m.email ?? 'Household member').trim() || 'Household member'
    out.push({
      id,
      label: nicknameLabel(id, fallback, personNicknames),
      kind: 'member',
    })
  }
  return out
}

const ORDER_KEY_PREFIX = 'freifeed-medicine-subject-order-'

function orderKey(householdId: string): string {
  return `${ORDER_KEY_PREFIX}${householdId}`
}

export function readSubjectOrder(householdId: string): string[] {
  try {
    const raw = localStorage.getItem(orderKey(householdId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function writeSubjectOrder(householdId: string, orderedIds: string[]): void {
  try {
    localStorage.setItem(orderKey(householdId), JSON.stringify(orderedIds))
  } catch {
    /* ignore */
  }
}

/** Stable sort: known ids first (saved order), then any new subjects. */
export function sortSubjectsByOrder(
  subjects: MedicineSubject[],
  order: string[],
): MedicineSubject[] {
  if (order.length === 0) return subjects
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const out: MedicineSubject[] = []
  for (const id of order) {
    const s = byId.get(id)
    if (s) {
      out.push(s)
      byId.delete(id)
    }
  }
  for (const s of subjects) {
    if (byId.has(s.id)) out.push(s)
  }
  return out
}

export function subjectLabel(
  subjects: MedicineSubject[],
  forPersonId: MedicineForPersonId,
): string {
  return subjects.find((s) => s.id === forPersonId)?.label ?? 'Unknown'
}

export function medicinesForSubject(medicines: Medicine[], subjectId: MedicineForPersonId): Medicine[] {
  return medicines.filter((m) => m.forPersonId === subjectId)
}

export function subjectsWithMedicines(
  subjects: MedicineSubject[],
  medicines: Medicine[],
): MedicineSubject[] {
  const ids = new Set(medicines.map((m) => m.forPersonId))
  return subjects.filter((s) => ids.has(s.id))
}

const WATCH_KEY_PREFIX = 'freifeed-medicine-subject-watch-'

function watchKey(householdId: string): string {
  return `${WATCH_KEY_PREFIX}${householdId}`
}

function readWatchMap(householdId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(watchKey(householdId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeWatchMap(householdId: string, map: Record<string, boolean>): void {
  try {
    localStorage.setItem(watchKey(householdId), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function notifyMedicineSubjectWatchChanged(): void {
  window.dispatchEvent(new Event('freifeed-medicine-watch-changed'))
}

/** Per-person notification opt-in on this device (default on). */
export function isMedicineSubjectWatchEnabled(
  householdId: string,
  forPersonId: MedicineForPersonId,
): boolean {
  const map = readWatchMap(householdId)
  if (!(forPersonId in map)) return true
  return map[forPersonId] !== false
}

export function setMedicineSubjectWatchEnabled(
  householdId: string,
  forPersonId: MedicineForPersonId,
  enabled: boolean,
): void {
  const map = readWatchMap(householdId)
  map[forPersonId] = enabled
  writeWatchMap(householdId, map)
  notifyMedicineSubjectWatchChanged()
}

export function filterMedicinesForDeviceNotifications(
  householdId: string,
  medicines: Medicine[],
): Medicine[] {
  return medicines.filter((m) => isMedicineSubjectWatchEnabled(householdId, m.forPersonId))
}

const APPT_WATCH_KEY_PREFIX = 'freifeed-appointment-subject-watch-'

function apptWatchKey(householdId: string): string {
  return `${APPT_WATCH_KEY_PREFIX}${householdId}`
}

function readApptWatchMap(householdId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(apptWatchKey(householdId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeApptWatchMap(householdId: string, map: Record<string, boolean>): void {
  try {
    localStorage.setItem(apptWatchKey(householdId), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function notifyAppointmentSubjectWatchChanged(): void {
  window.dispatchEvent(new Event('freifeed-appointment-watch-changed'))
}

/** Per-person appointment notification opt-in on this device (default on). */
export function isAppointmentSubjectWatchEnabled(
  householdId: string,
  forPersonId: MedicineForPersonId,
): boolean {
  const map = readApptWatchMap(householdId)
  if (!(forPersonId in map)) return true
  return map[forPersonId] !== false
}

export function setAppointmentSubjectWatchEnabled(
  householdId: string,
  forPersonId: MedicineForPersonId,
  enabled: boolean,
): void {
  const map = readApptWatchMap(householdId)
  map[forPersonId] = enabled
  writeApptWatchMap(householdId, map)
  notifyAppointmentSubjectWatchChanged()
}

/** Stable string for notification sync debouncing (includes per-person watch toggles). */
export function appointmentWatchSignature(householdId: string): string {
  const map = readApptWatchMap(householdId)
  return JSON.stringify(
    Object.keys(map)
      .sort()
      .map((id) => [id, map[id]]),
  )
}
