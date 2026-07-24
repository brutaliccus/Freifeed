import type { BabyId, MilkDeduction, MilkStorage, NursingSide, SessionKind } from '../types'
import { defaultMilkStorage, parseVolumeOzInput } from './feedingTypes'
import { nursingSideToSides, type SideToggle } from './sides'
import { todayLocalDateString } from './time'

const STORAGE_KEY = 'freifeed-active-feeds'
const LEGACY_KEY = 'freifeed-active-feed'

export interface ActiveFeedDraft {
  sessionId: string
  householdId: string
  kind: SessionKind
  babyId: BabyId
  /** Multi-select sides; converted to `side` when saving. */
  sides: SideToggle[]
  side: NursingSide | null
  startTime: string
  endTime: string
  /** Calendar day for time fields (yyyy-MM-dd) */
  defaultDate: string
  /** Calendar day milk was stored (pump) */
  storedDate: string
  timerStartedAt: string | null
  /** Seconds counted before the current run segment (excludes pauses). */
  timerAccumulatedSec: number
  /** Timer paused locally; server endAt stays open until stop-and-save. */
  timerPaused: boolean
  feedingId: string | null
  note: string
  volumeOz: string
  milkStorage: MilkStorage
  awaitingVolume: boolean
  weightLb: string
  weightOz: string
  showWeight: boolean
  /** Bottle feeds: milk bag(s) to deduct when saving. */
  bottleMilkDeductions: MilkDeduction[]
}

export function newSessionId(): string {
  return crypto.randomUUID()
}

export function createEmptyDraft(
  householdId: string,
  kind: SessionKind = 'nursing',
  babyId: BabyId,
): ActiveFeedDraft {
  const today = todayLocalDateString()
  return {
    sessionId: newSessionId(),
    householdId,
    kind,
    babyId,
    sides: [],
    side: null,
    startTime: '',
    endTime: '',
    defaultDate: today,
    storedDate: today,
    timerStartedAt: null,
    timerAccumulatedSec: 0,
    timerPaused: false,
    feedingId: null,
    note: '',
    volumeOz: '',
    milkStorage: defaultMilkStorage(),
    awaitingVolume: false,
    weightLb: '',
    weightOz: '',
    showWeight: false,
    bottleMilkDeductions: [],
  }
}

export function isSessionInProgress(draft: ActiveFeedDraft): boolean {
  if (draft.kind === 'bottle') {
    return !!draft.startTime && !draft.endTime
  }
  if (draft.awaitingVolume) return true
  if (isTimerRunning(draft)) return true
  if (draft.timerPaused && draft.startTime && !draft.endTime) return true
  if (draft.startTime && !draft.endTime) return true
  return false
}

export function isTimerRunning(draft: ActiveFeedDraft): boolean {
  return !!draft.timerStartedAt && !draft.timerPaused
}

export function isTimerPaused(draft: ActiveFeedDraft): boolean {
  return !!draft.timerPaused && !!draft.startTime && !draft.endTime
}

export function isSessionStarted(draft: ActiveFeedDraft): boolean {
  return !!draft.feedingId || !!draft.startTime
}

export function isPumpSession(draft: ActiveFeedDraft): boolean {
  return draft.kind === 'pump'
}

function normalizeDraft(raw: unknown): ActiveFeedDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as ActiveFeedDraft
  if (!d.householdId) return null
  const kind = d.kind ?? 'nursing'
  const sides = d.sides?.length ? d.sides : nursingSideToSides(d.side)
  return {
    ...createEmptyDraft(d.householdId, kind, d.babyId ?? 'legacy'),
    ...d,
    kind,
    sides,
    storedDate: d.storedDate ?? d.defaultDate ?? todayLocalDateString(),
    volumeOz: d.volumeOz ?? '',
    milkStorage: d.milkStorage ?? defaultMilkStorage(),
    awaitingVolume: d.awaitingVolume ?? false,
    timerAccumulatedSec: d.timerAccumulatedSec ?? 0,
    timerPaused: d.timerPaused ?? false,
    sessionId: d.sessionId || newSessionId(),
    bottleMilkDeductions: (() => {
      if (Array.isArray(d.bottleMilkDeductions)) return d.bottleMilkDeductions
      const legacy = (d as { bottleMilkLotId?: string | null }).bottleMilkLotId
      if (legacy) {
        const vol = parseVolumeOzInput(d.volumeOz ?? '')
        if (vol != null && vol > 0) return [{ lotId: legacy, amountOz: vol }]
      }
      return []
    })(),
  }
}

export function loadActiveFeedSessions(): ActiveFeedDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeDraft).filter((d): d is ActiveFeedDraft => d != null)
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const one = normalizeDraft(JSON.parse(legacy))
      if (one) {
        saveActiveFeedSessions([one])
        localStorage.removeItem(LEGACY_KEY)
        return [one]
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function saveActiveFeedSessions(sessions: ActiveFeedDraft[]): void {
  const inProgress = sessions.filter(isSessionInProgress)
  if (inProgress.length === 0) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inProgress))
}

export function elapsedSeconds(timerStartedAt: string | null): number {
  if (!timerStartedAt) return 0
  const t = new Date(timerStartedAt).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 1000))
}

export function sessionElapsedSeconds(draft: ActiveFeedDraft): number {
  const base = draft.timerAccumulatedSec ?? 0
  if (isTimerRunning(draft)) {
    return base + elapsedSeconds(draft.timerStartedAt)
  }
  return base
}

export function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Prefer a baby without an active nursing session for tandem feeds. */
export function defaultBabyForNewSession(
  babyIds: BabyId[],
  sessions: ActiveFeedDraft[],
): BabyId | null {
  const busy = new Set(
    sessions.filter((s) => isSessionInProgress(s) && s.kind === 'nursing').map((s) => s.babyId),
  )
  return babyIds.find((id) => !busy.has(id)) ?? babyIds[0] ?? null
}

export function hasActivePumpSession(sessions: ActiveFeedDraft[]): boolean {
  return sessions.some((s) => isSessionInProgress(s) && s.kind === 'pump')
}

/** @deprecated Use loadActiveFeedSessions — first in-progress session only */
export function loadActiveFeedDraft(): ActiveFeedDraft | null {
  return loadActiveFeedSessions()[0] ?? null
}

/** @deprecated Use saveActiveFeedSessions */
export function saveActiveFeedDraft(draft: ActiveFeedDraft | null): void {
  saveActiveFeedSessions(draft ? [draft] : [])
}
