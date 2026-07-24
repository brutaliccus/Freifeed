import type { Timestamp } from 'firebase/firestore'

export type BabyId = string
export type NursingSide = 'left' | 'right' | 'both'
export type FeedingType = 'nursing' | 'pump' | 'bottle'
export type MilkStorage = 'fridge' | 'frozen'
export type SessionKind = FeedingType

export type MemberRole = 'owner' | 'admin' | 'member'

export type TrackerKey = 'nursing' | 'milk' | 'diaper' | 'medicine' | 'notes' | 'measurements'

/** Which tracker gets the large home-screen action button. */
export type HomePrimaryAction = 'nursing' | 'milk' | 'diaper' | 'medicine'

/** Quick-add actions on the home radial hub (includes notes & measurements). */
export type HomeHubAction = HomePrimaryAction | 'notes' | 'measurements'

export const DEFAULT_HOME_PRIMARY_ACTION: HomePrimaryAction = 'nursing'

export const DEFAULT_UI_SCALE = 1

export const UI_SCALE_MIN = 0.85

export const UI_SCALE_MAX = 1.25

export interface TrackerVisibility {
  nursing: boolean
  milk: boolean
  diaper: boolean
  medicine: boolean
  notes: boolean
  measurements: boolean
}

export const DEFAULT_TRACKER_VISIBILITY: TrackerVisibility = {
  nursing: true,
  milk: true,
  diaper: true,
  medicine: true,
  notes: true,
  measurements: true,
}

export type BabySex = 'male' | 'female'

export interface Baby {
  id: BabyId
  name: string
  birthDate: string | null
  birthWeightLb: number | null
  birthWeightOz: number | null
  birthHeightIn: number | null
  photoUrl: string | null
  borderColorId: string | null
  /** Used for WHO/CDC growth percentiles. */
  sex: BabySex | null
  trackerVisibility?: TrackerVisibility
  /** When false, hide this baby’s card on the home screen (default true). */
  showOnHome?: boolean
}

export type DiaperKind = 'wet' | 'poop' | 'both'

export interface Diaper {
  id: string
  babyId: BabyId
  kind: DiaperKind
  changedAt: Timestamp
  note: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Measurement {
  id: string
  babyId: BabyId
  measuredAt: Timestamp
  weightLb: number | null
  weightOz: number | null
  lengthIn: number | null
  headCircIn: number | null
  note: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type NoteKind = 'todo' | 'appointment' | 'reminder' | 'general'

export type AppointmentRecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface AppointmentRecurrence {
  frequency: AppointmentRecurrenceFrequency
  /** Total occurrences including the first visit. */
  count: number | null
  /** Last calendar day of the series (yyyy-MM-dd). */
  endAt: string | null
}

export interface BabyNote {
  id: string
  /** `baby:<id>` or `member:<uid>` — primary person (first in forPersonIds). */
  forPersonId: string
  /** People this item is for (appointments/reminders may list several). */
  forPersonIds: string[]
  /** @deprecated Use forPersonId */
  babyId: BabyId | null
  kind: NoteKind
  text: string
  details: string | null
  scheduledAt: Timestamp | null
  reminderMinutesBefore: number | null
  recurrence: AppointmentRecurrence | null
  /** Additional household members/babies on an appointment. */
  inviteePersonIds: string[]
  archived: boolean
  completedAt: Timestamp | null
  /** For recurring appointments/reminders: last past occurrence shown in archive. */
  lastArchivedOccurrenceAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export function resolveBaby(babies: Baby[], id: BabyId): Baby | BabyId {
  return babies.find((b) => b.id === id) ?? id
}

export interface MilkDeduction {
  lotId: string
  amountOz: number
}

export interface Feeding {
  id: string
  type: FeedingType
  babyId: BabyId
  side: NursingSide | null
  startAt: Timestamp | null
  endAt: Timestamp | null
  volumeOz: number | null
  milkStorage: MilkStorage | null
  storedAt: Timestamp | null
  milkLotId: string | null
  milkDeductions: MilkDeduction[]
  weightLb: number | null
  weightOz: number | null
  note: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface MilkLot {
  id: string
  pumpedAt: Timestamp
  storedAt: Timestamp
  volumeOz: number
  remainingOz: number
  storage: MilkStorage
  feedingId: string | null
  note: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface MilkSummary {
  totalRemainingOz: number
  fridgeOz: number
  frozenOz: number
}

export interface HouseholdMember {
  uid: string
  displayName: string | null
  email: string | null
}

export interface Household {
  id: string
  inviteCode: string
  /** @deprecated Use `memberProfiles` — kept for member count checks. */
  members: string[]
  memberProfiles: HouseholdMember[]
  ownerUid: string
  memberRoles: Record<string, MemberRole>
  /** Keys: `baby:<id>` or `member:<uid>` — household-specific display nicknames. */
  personNicknames: Record<string, string>
  /** Keys: member uid — when true, show parent/adult card on home screen. */
  memberShowOnHome?: Record<string, boolean>
  createdAt: Timestamp
}

export type AppThemeId = 'buba' | 'ocean' | 'sage'

export interface UserProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  householdId: string | null
  skippedBabyOnboarding: boolean
  skippedPhotoOnboarding: boolean
  navTrackers?: TrackerVisibility
  homePrimaryAction?: HomePrimaryAction
  /** UI scale multiplier (0.85–1.25); 1 = default. */
  uiScale?: number
  /** Color palette: buba (default), ocean, sage. */
  appTheme?: AppThemeId
}

export type MedicineFrequencyType = 'daily' | 'twice_daily' | 'three_times_daily' | 'periodic'

/** Required = fixed schedule alerts; as needed = minimum interval between optional doses. */
export type MedicineCategory = 'required' | 'as_needed'

export interface MedicineFrequency {
  type: MedicineFrequencyType
  /** "HH:mm" reminder times for scheduled frequencies (1, 2, or 3 entries). */
  times: string[]
  /** Hours between doses, used when type === 'periodic'. */
  intervalHours: number | null
}

export interface Medicine {
  id: string
  /** Who this medicine is for: `baby:<id>` or `member:<uid>`. */
  forPersonId: string
  name: string
  totalPills: number
  dosage: string
  category: MedicineCategory
  /** null means indefinite (permanent medicine). */
  durationDays: number | null
  frequency: MedicineFrequency
  startedAt: Timestamp
  /** When the user last marked a dose as taken. Drives the "I took it" state. */
  lastTakenAt: Timestamp | null
  /** User-controlled active flag. Auto computed-inactive once duration elapses. */
  active: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type AppView =
  | 'home'
  | 'daily'
  | 'weekly'
  | 'diapers'
  | 'diapers-weekly'
  | 'profile'
  | 'milk'
  | 'medicines'
  | 'measurements'
  | 'notes'
