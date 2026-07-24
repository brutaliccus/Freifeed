import { httpsCallable } from 'firebase/functions'
import { Timestamp } from 'firebase/firestore'
import { functions } from '../firebase'
import { withCallableRetry } from './callableRetry'
import { enqueueMutation, isLikelyOfflineError } from './offlineQueue'
import type {
  Baby,
  BabyId,
  BabyNote,
  Feeding,
  FeedingType,
  Household,
  Measurement,
  Medicine,
  MedicineCategory,
  MedicineFrequency,
  MilkLot,
  MilkStorage,
  MilkDeduction,
  MilkSummary,
  NursingSide,
  UserProfile,
  Diaper,
  DiaperKind,
  TrackerVisibility,
  HomePrimaryAction,
  MemberRole,
  AppThemeId,
} from '../types'

function isoToTimestamp(iso: string | null | undefined): Timestamp | null {
  if (!iso) return null
  return Timestamp.fromDate(new Date(iso))
}

function call<TReq, TRes>(name: string, options?: { queueOnFailure?: boolean }) {
  const fn = httpsCallable<TReq, TRes>(functions, name)
  return async (payload?: TReq) => {
    return withCallableRetry(async () => {
      try {
        return await fn(payload as TReq)
      } catch (err) {
        if (options?.queueOnFailure !== false && isLikelyOfflineError(err)) {
          enqueueMutation(name, payload)
        }
        throw err
      }
    })
  }
}

const mutate = <TReq, TRes>(name: string) => call<TReq, TRes>(name, { queueOnFailure: true })
const read = <TReq, TRes>(name: string) => call<TReq, TRes>(name, { queueOnFailure: false })

export async function apiGetUserProfile(): Promise<UserProfile | null> {
  const res = await read<undefined, { profile: UserProfile | null }>('getUserProfile')()
  return res.data.profile
}

export async function apiUpsertUserProfile(
  data: Partial<Pick<UserProfile, 'email' | 'displayName' | 'photoURL'>>,
): Promise<void> {
  await mutate<typeof data, { ok: boolean }>('upsertUserProfile')(data)
}

export async function apiUpdateNavTrackers(navTrackers: TrackerVisibility): Promise<void> {
  await call<{ navTrackers: TrackerVisibility }, { ok: boolean }>('updateNavTrackers')({
    navTrackers,
  })
}

export async function apiUpdateAppSettings(data: {
  navTrackers?: TrackerVisibility
  homePrimaryAction?: HomePrimaryAction
  uiScale?: number
  appTheme?: AppThemeId
}): Promise<void> {
  await call<typeof data, { ok: boolean }>('updateAppSettings')(data)
}

export async function apiRegisterPushToken(token: string): Promise<void> {
  await call<{ token: string }, { ok: boolean }>('registerPushToken')({ token })
}

export async function apiCreateHousehold(): Promise<{ householdId: string; inviteCode: string }> {
  const res = await mutate<undefined, { householdId: string; inviteCode: string }>('createHousehold')()
  return res.data
}

export async function apiJoinHousehold(code: string): Promise<string> {
  const res = await mutate<{ code: string }, { householdId: string }>('joinHousehold')({ code })
  return res.data.householdId
}

export async function apiGetHousehold(householdId: string): Promise<Household | null> {
  const res = await read<{ householdId: string }, { household: RawHousehold | null }>('getHousehold')({
    householdId,
  })
  const h = res.data.household
  if (!h) return null
  const personNicknames: Record<string, string> = {}
  if (h.personNicknames) {
    for (const [key, val] of Object.entries(h.personNicknames)) {
      if (typeof val === 'string' && val.trim()) personNicknames[key] = val.trim()
    }
  }
  const memberShowOnHome: Record<string, boolean> = {}
  if (h.memberShowOnHome) {
    for (const [uid, val] of Object.entries(h.memberShowOnHome)) {
      if (val === true) memberShowOnHome[uid] = true
    }
  }
  return {
    id: h.id,
    inviteCode: h.inviteCode,
    members: h.members,
    memberProfiles:
      h.memberProfiles ??
      h.members.map((uid) => ({ uid, displayName: null, email: null })),
    ownerUid: h.ownerUid ?? h.members[0] ?? '',
    memberRoles: h.memberRoles ?? Object.fromEntries(
      h.members.map((uid) => [uid, (h.ownerUid ?? h.members[0]) === uid ? 'owner' : 'member' as MemberRole]),
    ),
    personNicknames,
    memberShowOnHome,
    createdAt: isoToTimestamp(h.createdAt) as Timestamp,
  }
}

export async function apiSetPersonNickname(
  householdId: string,
  personId: string,
  nickname: string,
): Promise<void> {
  await call<{ householdId: string; personId: string; nickname: string }, { ok: boolean }>(
    'setPersonNickname',
  )({ householdId, personId, nickname })
}

export async function apiSetMemberShowOnHome(
  householdId: string,
  memberUid: string,
  showOnHome: boolean,
): Promise<void> {
  await call<{ householdId: string; memberUid: string; showOnHome: boolean }, { ok: boolean }>(
    'setMemberShowOnHome',
  )({ householdId, memberUid, showOnHome })
}

interface RawHouseholdMember {
  uid: string
  displayName: string | null
  email: string | null
}

interface RawHousehold {
  id: string
  inviteCode: string
  members: string[]
  memberProfiles?: RawHouseholdMember[]
  personNicknames?: Record<string, string>
  memberShowOnHome?: Record<string, boolean>
  ownerUid?: string
  memberRoles?: Record<string, MemberRole>
  createdAt: string | null
}

export async function apiSkipPhotoOnboarding(): Promise<void> {
  await call<undefined, { ok: boolean }>('skipPhotoOnboarding')()
}

export async function apiSkipBabyOnboarding(): Promise<void> {
  await call<undefined, { ok: boolean }>('skipBabyOnboarding')()
}

export async function apiGetBabies(householdId: string): Promise<Baby[]> {
  const res = await read<{ householdId: string }, { babies: Baby[] }>('getBabies')({ householdId })
  return res.data.babies
}

export async function apiUpdateBaby(
  householdId: string,
  babyId: BabyId,
  data: Partial<Omit<Baby, 'id'>>,
): Promise<void> {
  await mutate('updateBaby')({ householdId, babyId, data })
}

export async function apiAddBaby(householdId: string, name: string): Promise<string> {
  const res = await mutate<{ householdId: string; name: string }, { babyId: string }>('addBaby')({
    householdId,
    name,
  })
  return res.data.babyId
}

export async function apiDeleteBaby(householdId: string, babyId: BabyId): Promise<void> {
  await mutate<{ householdId: string; babyId: string }, { ok: boolean }>('deleteBaby')({
    householdId,
    babyId,
  })
}

interface RawFeeding {
  id: string
  type?: FeedingType
  babyId: BabyId
  side: NursingSide | null
  startAt: string | null
  endAt: string | null
  volumeOz: number | null
  milkStorage: MilkStorage | null
  storedAt: string | null
  milkLotId: string | null
  milkDeductions?: MilkDeduction[]
  weightLb: number | null
  weightOz: number | null
  note: string | null
  createdAt: string
  updatedAt: string
}

interface RawMilkLot {
  id: string
  pumpedAt: string
  storedAt: string
  volumeOz: number
  remainingOz: number
  storage: MilkStorage
  feedingId: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

function parseFeeding(raw: RawFeeding): Feeding {
  return {
    id: raw.id,
    type: raw.type ?? 'nursing',
    babyId: raw.babyId,
    side: raw.side,
    startAt: isoToTimestamp(raw.startAt),
    endAt: isoToTimestamp(raw.endAt),
    volumeOz: raw.volumeOz,
    milkStorage: raw.milkStorage,
    storedAt: isoToTimestamp(raw.storedAt),
    milkLotId: raw.milkLotId,
    milkDeductions: Array.isArray(raw.milkDeductions) ? raw.milkDeductions : [],
    weightLb: raw.weightLb,
    weightOz: raw.weightOz,
    note: raw.note,
    createdAt: isoToTimestamp(raw.createdAt) as Timestamp,
    updatedAt: isoToTimestamp(raw.updatedAt) as Timestamp,
  }
}

function parseMilkLot(raw: RawMilkLot): MilkLot {
  return {
    id: raw.id,
    pumpedAt: isoToTimestamp(raw.pumpedAt) as Timestamp,
    storedAt: isoToTimestamp(raw.storedAt) as Timestamp,
    volumeOz: raw.volumeOz,
    remainingOz: raw.remainingOz,
    storage: raw.storage,
    feedingId: raw.feedingId ?? null,
    note: raw.note,
    createdAt: isoToTimestamp(raw.createdAt) as Timestamp,
    updatedAt: isoToTimestamp(raw.updatedAt) as Timestamp,
  }
}

export async function apiListFeedings(householdId: string): Promise<Feeding[]> {
  const res = await read<{ householdId: string }, { feedings: RawFeeding[] }>('listFeedings')({
    householdId,
  })
  return res.data.feedings.map(parseFeeding)
}

export interface FeedingInput {
  type: FeedingType
  babyId: BabyId
  side: NursingSide | null
  startAt: Date | null
  endAt: Date | null
  volumeOz: number | null
  milkStorage: MilkStorage | null
  storedAt: Date | null
  weightLb: number | null
  weightOz: number | null
  note: string | null
  milkDeductions?: MilkDeduction[]
  milkBagVolumes?: number[]
  addToLotId?: string | null
}

function inputToPayload(input: FeedingInput) {
  return {
    type: input.type,
    babyId: input.babyId,
    side: input.side,
    startAt: input.startAt?.toISOString() ?? null,
    endAt: input.endAt?.toISOString() ?? null,
    volumeOz: input.volumeOz,
    milkStorage: input.milkStorage,
    storedAt: input.storedAt?.toISOString() ?? null,
    weightLb: input.weightLb,
    weightOz: input.weightOz,
    note: input.note,
    milkDeductions: input.milkDeductions,
    milkBagVolumes: input.milkBagVolumes,
    addToLotId: input.addToLotId ?? null,
  }
}

export async function apiCreateFeeding(householdId: string, input: FeedingInput): Promise<string> {
  const res = await mutate<{ householdId: string; input: ReturnType<typeof inputToPayload> }, { feedingId: string }>(
    'createFeeding',
  )({ householdId, input: inputToPayload(input) })
  return res.data.feedingId
}

export async function apiUpdateFeeding(
  householdId: string,
  feedingId: string,
  input: FeedingInput,
): Promise<void> {
  await mutate('updateFeeding')({ householdId, feedingId, input: inputToPayload(input) })
}

export async function apiDeleteFeeding(householdId: string, feedingId: string): Promise<void> {
  await mutate('deleteFeeding')({ householdId, feedingId })
}

export async function apiListMilkLots(householdId: string): Promise<MilkLot[]> {
  const res = await read<{ householdId: string }, { lots: RawMilkLot[] }>('listMilkLots')({ householdId })
  return res.data.lots.map(parseMilkLot)
}

export async function apiGetMilkSummary(householdId: string): Promise<MilkSummary> {
  const res = await read<{ householdId: string }, { summary: MilkSummary }>('getMilkSummary')({ householdId })
  return res.data.summary
}

export async function apiDeleteMilkLot(householdId: string, lotId: string): Promise<void> {
  await mutate('deleteMilkLot')({ householdId, lotId })
}

export async function apiUpdateMilkLot(
  householdId: string,
  lotId: string,
  payload: {
    volumeOz: number
    remainingOz: number
    note?: string | null
    storedAt?: Date | null
  },
): Promise<void> {
  await mutate('updateMilkLot')({
    householdId,
    lotId,
    volumeOz: payload.volumeOz,
    remainingOz: payload.remainingOz,
    note: payload.note ?? null,
    ...(payload.storedAt != null ? { storedAt: payload.storedAt.toISOString() } : {}),
  })
}

export async function apiTransferMilkLotToFreezer(
  householdId: string,
  lotIds: string[],
  bags: number[],
): Promise<void> {
  await mutate('transferMilkLotToFreezer')({ householdId, lotIds, bags })
}

export async function apiTransferMilkLotToFridge(
  householdId: string,
  lotIds: string[],
  bags: number[],
): Promise<void> {
  await mutate('transferMilkLotToFridge')({ householdId, lotIds, bags })
}

export async function apiCombineMilkLots(
  householdId: string,
  lotIds: string[],
  addOz?: number | null,
): Promise<{ lotId: string; totalOz: number }> {
  const res = await mutate<
    { householdId: string; lotIds: string[]; addOz?: number | null },
    { ok: boolean; lotId: string; totalOz: number }
  >('combineMilkLots')({ householdId, lotIds, addOz: addOz ?? null })
  return { lotId: res.data.lotId, totalOz: res.data.totalOz }
}

export async function apiRedistributeMilkLot(
  householdId: string,
  lotIds: string[],
  bags: number[],
): Promise<void> {
  await mutate('redistributeMilkLot')({ householdId, lotIds, bags })
}

interface RawMedicine {
  id: string
  forPersonId?: string
  name: string
  totalPills: number
  dosage: string
  category?: MedicineCategory
  durationDays: number | null
  frequency: MedicineFrequency
  startedAt: string | null
  lastTakenAt: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface MedicineInput {
  forPersonId: string
  name: string
  totalPills: number
  dosage: string
  category: MedicineCategory
  durationDays: number | null
  frequency: MedicineFrequency
  startedAt?: Date | null
  lastTakenAt?: Date | null
  active?: boolean
}

function parseMedicine(raw: RawMedicine): Medicine {
  const forPersonId =
    typeof raw.forPersonId === 'string' && raw.forPersonId.includes(':')
      ? raw.forPersonId
      : 'baby:unknown'
  return {
    id: raw.id,
    forPersonId,
    name: raw.name,
    totalPills: raw.totalPills,
    dosage: raw.dosage,
    category: raw.category === 'as_needed' ? 'as_needed' : 'required',
    durationDays: raw.durationDays,
    frequency: raw.frequency,
    startedAt: isoToTimestamp(raw.startedAt) as Timestamp,
    lastTakenAt: isoToTimestamp(raw.lastTakenAt),
    active: raw.active,
    createdAt: isoToTimestamp(raw.createdAt) as Timestamp,
    updatedAt: isoToTimestamp(raw.updatedAt) as Timestamp,
  }
}

function medicineInputToPayload(input: MedicineInput) {
  const payload: Record<string, unknown> = {
    forPersonId: input.forPersonId,
    name: input.name,
    totalPills: input.totalPills,
    dosage: input.dosage,
    category: input.category,
    durationDays: input.durationDays,
    frequency: input.frequency,
    startedAt: input.startedAt?.toISOString() ?? null,
    active: input.active ?? true,
  }
  // Only include `lastTakenAt` when the caller explicitly chose to set it.
  if (input.lastTakenAt !== undefined) {
    payload.lastTakenAt = input.lastTakenAt?.toISOString() ?? null
  }
  return payload
}

export async function apiListMedicines(householdId: string): Promise<Medicine[]> {
  const res = await read<{ householdId: string }, { medicines: RawMedicine[] }>('listMedicines')({
    householdId,
  })
  return res.data.medicines.map(parseMedicine)
}

export async function apiCreateMedicine(householdId: string, input: MedicineInput): Promise<string> {
  const res = await mutate<
    { householdId: string; input: ReturnType<typeof medicineInputToPayload> },
    { medicineId: string }
  >('createMedicine')({ householdId, input: medicineInputToPayload(input) })
  return res.data.medicineId
}

export async function apiUpdateMedicine(
  householdId: string,
  medicineId: string,
  input: MedicineInput,
): Promise<void> {
  await mutate('updateMedicine')({
    householdId,
    medicineId,
    input: medicineInputToPayload(input),
  })
}

export async function apiDeleteMedicine(householdId: string, medicineId: string): Promise<void> {
  await mutate('deleteMedicine')({ householdId, medicineId })
}

export async function apiSetMedicineActive(
  householdId: string,
  medicineId: string,
  active: boolean,
  restartDuration = false,
): Promise<void> {
  await mutate('setMedicineActive')({ householdId, medicineId, active, restartDuration })
}

export async function apiMarkMedicineTaken(
  householdId: string,
  medicineId: string,
  takenAt?: Date | null,
): Promise<void> {
  await mutate('markMedicineTaken')({
    householdId,
    medicineId,
    takenAt: takenAt?.toISOString() ?? null,
  })
}

interface RawDiaper {
  id: string
  babyId: BabyId
  kind: DiaperKind
  changedAt: string
  note: string | null
  createdAt: string
  updatedAt: string
}

function parseDiaper(raw: RawDiaper): Diaper {
  return {
    id: raw.id,
    babyId: raw.babyId,
    kind: raw.kind,
    changedAt: isoToTimestamp(raw.changedAt) as Timestamp,
    note: raw.note,
    createdAt: isoToTimestamp(raw.createdAt) as Timestamp,
    updatedAt: isoToTimestamp(raw.updatedAt) as Timestamp,
  }
}

export interface DiaperInput {
  babyId: BabyId
  kind: DiaperKind
  changedAt: Date
  note?: string | null
}

function diaperInputToPayload(input: DiaperInput) {
  return {
    babyId: input.babyId,
    kind: input.kind,
    changedAt: input.changedAt.toISOString(),
    note: input.note ?? null,
  }
}

export async function apiListDiapers(householdId: string): Promise<Diaper[]> {
  const res = await read<{ householdId: string }, { diapers: RawDiaper[] }>('listDiapers')({
    householdId,
  })
  return res.data.diapers.map(parseDiaper)
}

export async function apiCreateDiaper(householdId: string, input: DiaperInput): Promise<string> {
  const res = await mutate<
    { householdId: string; input: ReturnType<typeof diaperInputToPayload> },
    { diaperId: string }
  >('createDiaper')({ householdId, input: diaperInputToPayload(input) })
  return res.data.diaperId
}

export async function apiUpdateDiaper(
  householdId: string,
  diaperId: string,
  input: DiaperInput,
): Promise<void> {
  await mutate('updateDiaper')({ householdId, diaperId, input: diaperInputToPayload(input) })
}

export async function apiDeleteDiaper(householdId: string, diaperId: string): Promise<void> {
  await mutate('deleteDiaper')({ householdId, diaperId })
}

interface RawMeasurement {
  id: string
  babyId: BabyId
  measuredAt: string
  weightLb: number | null
  weightOz: number | null
  lengthIn: number | null
  headCircIn: number | null
  note: string | null
  createdAt: string
  updatedAt: string
}

function parseMeasurement(raw: RawMeasurement): Measurement {
  return {
    id: raw.id,
    babyId: raw.babyId,
    measuredAt: isoToTimestamp(raw.measuredAt) as Timestamp,
    weightLb: raw.weightLb,
    weightOz: raw.weightOz,
    lengthIn: raw.lengthIn,
    headCircIn: raw.headCircIn,
    note: raw.note,
    createdAt: isoToTimestamp(raw.createdAt) as Timestamp,
    updatedAt: isoToTimestamp(raw.updatedAt) as Timestamp,
  }
}

export interface MeasurementInput {
  babyId: BabyId
  measuredAt: Date
  weightLb?: number | null
  weightOz?: number | null
  lengthIn?: number | null
  headCircIn?: number | null
  note?: string | null
}

function measurementInputToPayload(input: MeasurementInput) {
  return {
    babyId: input.babyId,
    measuredAt: input.measuredAt.toISOString(),
    weightLb: input.weightLb ?? null,
    weightOz: input.weightOz ?? null,
    lengthIn: input.lengthIn ?? null,
    headCircIn: input.headCircIn ?? null,
    note: input.note ?? null,
  }
}

export async function apiListMeasurements(householdId: string): Promise<Measurement[]> {
  const res = await read<{ householdId: string }, { measurements: RawMeasurement[] }>(
    'listMeasurements',
  )({ householdId })
  return res.data.measurements.map(parseMeasurement)
}

export async function apiCreateMeasurement(
  householdId: string,
  input: MeasurementInput,
): Promise<string> {
  const res = await mutate<
    { householdId: string; input: ReturnType<typeof measurementInputToPayload> },
    { measurementId: string }
  >('createMeasurement')({ householdId, input: measurementInputToPayload(input) })
  return res.data.measurementId
}

export async function apiUpdateMeasurement(
  householdId: string,
  measurementId: string,
  input: MeasurementInput,
): Promise<void> {
  await mutate('updateMeasurement')({
    householdId,
    measurementId,
    input: measurementInputToPayload(input),
  })
}

export async function apiDeleteMeasurement(
  householdId: string,
  measurementId: string,
): Promise<void> {
  await mutate('deleteMeasurement')({ householdId, measurementId })
}

interface RawNote {
  id: string
  forPersonId?: string
  babyId?: BabyId | null
  kind?: string
  text: string
  details?: string | null
  scheduledAt?: string | null
  reminderMinutesBefore?: number | null
  recurrence?: {
    frequency: string
    count: number | null
    endAt: string | null
  } | null
  forPersonIds?: string[]
  inviteePersonIds?: string[]
  archived: boolean
  completedAt: string | null
  lastArchivedOccurrenceAt?: string | null
  createdAt: string
  updatedAt: string
}

function parseRecurrence(
  raw: RawNote['recurrence'],
): import('../types').AppointmentRecurrence | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw.frequency
  if (f !== 'daily' && f !== 'weekly' && f !== 'biweekly' && f !== 'monthly') return null
  return {
    frequency: f,
    count: typeof raw.count === 'number' ? raw.count : null,
    endAt: typeof raw.endAt === 'string' ? raw.endAt : null,
  }
}

function parseForPersonIdsFromRaw(raw: RawNote, fallback: string): string[] {
  if (Array.isArray(raw.forPersonIds) && raw.forPersonIds.length > 0) {
    return raw.forPersonIds.filter((id): id is string => typeof id === 'string' && id.includes(':'))
  }
  return fallback ? [fallback] : []
}

function parseNote(raw: RawNote): BabyNote {
  const forPersonId =
    raw.forPersonId && raw.forPersonId.includes(':')
      ? raw.forPersonId
      : raw.babyId
        ? `baby:${raw.babyId}`
        : ''
  const forPersonIds = parseForPersonIdsFromRaw(raw, forPersonId)
  const kind =
    raw.kind === 'appointment' ||
    raw.kind === 'reminder' ||
    raw.kind === 'general' ||
    raw.kind === 'todo'
      ? raw.kind
      : 'todo'
  return {
    id: raw.id,
    forPersonId: forPersonIds[0] ?? forPersonId,
    forPersonIds,
    babyId:
      raw.babyId ??
      (forPersonIds[0]?.startsWith('baby:') ? forPersonIds[0].slice(5) : null),
    kind,
    text: raw.text,
    details: raw.details ?? null,
    scheduledAt: raw.scheduledAt ? (isoToTimestamp(raw.scheduledAt) as Timestamp) : null,
    reminderMinutesBefore:
      typeof raw.reminderMinutesBefore === 'number' ? raw.reminderMinutesBefore : null,
    recurrence: parseRecurrence(raw.recurrence),
    inviteePersonIds: Array.isArray(raw.inviteePersonIds)
      ? raw.inviteePersonIds.filter((id): id is string => typeof id === 'string')
      : [],
    archived: raw.archived,
    completedAt: raw.completedAt ? (isoToTimestamp(raw.completedAt) as Timestamp) : null,
    lastArchivedOccurrenceAt: raw.lastArchivedOccurrenceAt
      ? (isoToTimestamp(raw.lastArchivedOccurrenceAt) as Timestamp)
      : null,
    createdAt: isoToTimestamp(raw.createdAt) as Timestamp,
    updatedAt: isoToTimestamp(raw.updatedAt) as Timestamp,
  }
}

type ScheduledNoteInput = {
  kind: 'appointment' | 'reminder'
  forPersonIds: string[]
  text: string
  details?: string | null
  scheduledAt: string
  reminderMinutesBefore: number
  recurrence?: import('../types').AppointmentRecurrence | null
  inviteePersonIds?: string[]
}

export type NoteInput =
  | { kind: 'todo'; forPersonId: string; text: string }
  | { kind: 'general'; forPersonId: string; text: string }
  | ScheduledNoteInput

export type NoteUpdateInput = NoteInput

export async function apiListNotes(householdId: string): Promise<BabyNote[]> {
  const res = await read<{ householdId: string }, { notes: RawNote[] }>('listNotes')({
    householdId,
  })
  return res.data.notes.map(parseNote)
}

export async function apiCreateNote(householdId: string, input: NoteInput): Promise<string> {
  const res = await mutate<
    { householdId: string; input: NoteInput },
    { noteId: string }
  >('createNote')({ householdId, input })
  return res.data.noteId
}

export async function apiUpdateNote(
  householdId: string,
  noteId: string,
  input: NoteUpdateInput,
): Promise<void> {
  await mutate<
    { householdId: string; noteId: string; input: NoteUpdateInput },
    { ok: boolean }
  >('updateNote')({ householdId, noteId, input })
}

export async function apiArchiveNote(
  householdId: string,
  noteId: string,
  options?: { occurrenceAt?: string },
): Promise<void> {
  await mutate('archiveNote')({ householdId, noteId, occurrenceAt: options?.occurrenceAt })
}

export async function apiUnarchiveNote(
  householdId: string,
  noteId: string,
  options?: { clearOccurrence?: boolean },
): Promise<void> {
  await mutate('unarchiveNote')({
    householdId,
    noteId,
    clearOccurrence: options?.clearOccurrence ?? false,
  })
}

export async function apiDeleteNote(householdId: string, noteId: string): Promise<void> {
  await mutate('deleteNote')({ householdId, noteId })
}

export interface AndroidAppUpdateInfo {
  fileName: string
  sizeBytes: number | null
  /** ISO publish time from the GitHub release. */
  releasedAt: string | null
  /** @deprecated alias of releasedAt for older builds */
  driveModifiedTime: string | null
  versionCode: number | null
  versionName: string | null
  downloadUrl: string
  releaseTag?: string | null
  releaseUrl?: string | null
  /** @deprecated unused; older clients expected this field */
  driveFileId?: string | null
}

export async function apiGetAndroidAppUpdate(): Promise<AndroidAppUpdateInfo> {
  const res = await read<undefined, AndroidAppUpdateInfo>('getAndroidAppUpdate')()
  return res.data
}

export async function apiRotateHouseholdInviteCode(
  householdId: string,
): Promise<{ inviteCode: string }> {
  const res = await mutate<{ householdId: string }, { ok: boolean; inviteCode: string }>(
    'rotateHouseholdInviteCode',
  )({ householdId })
  return { inviteCode: res.data.inviteCode }
}

export async function apiRemoveHouseholdMember(
  householdId: string,
  memberUid: string,
): Promise<void> {
  await mutate('removeHouseholdMember')({ householdId, memberUid })
}

export async function apiSetHouseholdMemberRole(
  householdId: string,
  memberUid: string,
  role: MemberRole,
): Promise<void> {
  await mutate('setHouseholdMemberRole')({ householdId, memberUid, role })
}

export async function apiTransferHouseholdOwnership(
  householdId: string,
  newOwnerUid: string,
): Promise<void> {
  await mutate('transferHouseholdOwnership')({ householdId, newOwnerUid })
}

export async function apiLeaveHousehold(householdId: string): Promise<void> {
  await mutate('leaveHousehold')({ householdId })
}

export async function apiExportHouseholdData(householdId: string): Promise<Record<string, unknown>> {
  const res = await read<{ householdId: string }, Record<string, unknown>>('exportHouseholdData')({
    householdId,
  })
  return res.data
}

export function formatApiError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : ''
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : err instanceof Error
        ? err.message
        : 'Request failed'

  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') {
    return 'Cannot reach the server. Check your connection and tap Retry.'
  }
  if (code === 'functions/permission-denied') {
    return 'Permission denied calling the API. Try signing out and back in.'
  }
  if (code === 'functions/unauthenticated') {
    return 'Session expired. Please sign in again.'
  }
  if (code === 'functions/internal') {
    return 'Something went wrong on the server. Tap Retry or sign in again.'
  }
  return message
}
