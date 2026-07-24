import { Timestamp } from 'firebase/firestore'
import type { Feeding, BabyId } from '../types'
import { isFeedingOwnedByThisDevice } from './feedOwnership'
import {
  isSessionInProgress,
  isSessionStarted,
  type ActiveFeedDraft,
  elapsedSeconds,
} from './activeFeedSession'
import { feedingAnchorTime, getLastFeedForBaby } from './feedings'
import { sidesToNursingSide, type SideToggle } from './sides'
import { timestampToDate } from './time'

export function nursingBusyBabyIds(
  localSessions: ActiveFeedDraft[],
  remoteFeedings: Feeding[] = [],
): Set<BabyId> {
  const busy = new Set<BabyId>()
  for (const session of localSessions) {
    if (isSessionInProgress(session) && session.kind === 'nursing') {
      busy.add(session.babyId)
    }
  }
  for (const feeding of remoteFeedings) {
    if ((feeding.type ?? 'nursing') === 'nursing') {
      busy.add(feeding.babyId)
    }
  }
  return busy
}

function singleSideFromDraft(session: {
  sides: SideToggle[]
  side: ActiveFeedDraft['side']
}): 'left' | 'right' | null {
  const side = sidesToNursingSide(session.sides) ?? session.side
  if (side === 'left') return 'left'
  if (side === 'right') return 'right'
  return null
}

function isActivePumpSession(session: ActiveFeedDraft): boolean {
  return session.kind === 'pump' && (isSessionInProgress(session) || isSessionStarted(session))
}

/** Pump on one breast only (e.g. haakaa) — opposite breast is free for nursing. */
function activePumpSingleSide(
  localSessions: ActiveFeedDraft[],
  focusDraft?: ActiveFeedDraft | null,
): 'left' | 'right' | null {
  for (const session of localSessions) {
    if (!isActivePumpSession(session)) continue
    const side = singleSideFromDraft(session)
    if (side) return side
  }
  if (focusDraft?.kind === 'pump' && isActivePumpSession(focusDraft)) {
    return singleSideFromDraft(focusDraft)
  }
  return null
}

export function canStartTandemFeed(
  babyIds: BabyId[],
  localSessions: ActiveFeedDraft[],
  remoteFeedings: Feeding[] = [],
  focusDraft?: ActiveFeedDraft | null,
): boolean {
  const busy = nursingBusyBabyIds(localSessions, remoteFeedings)
  const ids = babyIds

  // Two-baby tandem: one baby nursing, start the other.
  if (busy.size > 0 && busy.size < ids.length) return true

  // Pump on one side + nurse on the other (same or another baby).
  const pumpSide = activePumpSingleSide(localSessions, focusDraft)
  if (pumpSide == null) return false
  return ids.some((id) => !busy.has(id))
}

export function defaultBabyForTandem(
  babyIds: BabyId[],
  localSessions: ActiveFeedDraft[],
  remoteFeedings: Feeding[] = [],
  feedings: Feeding[] = [],
): BabyId | null {
  const busy = nursingBusyBabyIds(localSessions, remoteFeedings)
  const available = babyIds.filter((id) => !busy.has(id))
  if (available.length === 0) return babyIds[0] ?? null

  const pumpSession = localSessions.find((s) => isActivePumpSession(s) && singleSideFromDraft(s))
  if (pumpSession && available.includes(pumpSession.babyId)) {
    return pumpSession.babyId
  }

  if (available.length === 1) return available[0]!

  let pick = available[0]!
  let oldestMs = Number.POSITIVE_INFINITY
  for (const id of available) {
    const last = getLastFeedForBaby(feedings, id)
    const anchorMs = last ? feedingAnchorTime(last)?.getTime() ?? 0 : 0
    if (anchorMs < oldestMs) {
      oldestMs = anchorMs
      pick = id
    }
  }
  return pick
}

function activeNursingSideInUse(
  localSessions: ActiveFeedDraft[],
  remoteFeedings: Feeding[] = [],
): 'left' | 'right' | null {
  for (const session of localSessions) {
    if (!isSessionInProgress(session) || session.kind !== 'nursing') continue
    const side = sidesToNursingSide(session.sides) ?? session.side
    if (side === 'left' || side === 'right') return side
  }
  for (const feeding of remoteFeedings) {
    if ((feeding.type ?? 'nursing') !== 'nursing' || !isFeedingInProgress(feeding)) continue
    if (feeding.side === 'left' || feeding.side === 'right') return feeding.side
  }
  return null
}

/** Default tandem nursing to the breast not used by nursing or single-side pump. */
export function defaultTandemSidePatch(
  localSessions: ActiveFeedDraft[],
  remoteFeedings: Feeding[] = [],
  focusDraft?: ActiveFeedDraft | null,
): { sides: SideToggle[]; side: 'left' | 'right' | null } {
  const inUse = activeNursingSideInUse(localSessions, remoteFeedings)
  if (inUse === 'left') return { sides: ['right'], side: 'right' }
  if (inUse === 'right') return { sides: ['left'], side: 'left' }

  const pumpSide = activePumpSingleSide(localSessions, focusDraft)
  if (pumpSide === 'left') return { sides: ['right'], side: 'right' }
  if (pumpSide === 'right') return { sides: ['left'], side: 'left' }

  return { sides: [], side: null }
}

export function isBabyNursingInProgress(
  babyId: BabyId,
  localSessions: ActiveFeedDraft[],
  remoteFeedings: Feeding[] = [],
): boolean {
  return nursingBusyBabyIds(localSessions, remoteFeedings).has(babyId)
}

export function isFeedingInProgress(feeding: Feeding): boolean {
  if ((feeding.type ?? 'nursing') === 'bottle') return false
  return !!feeding.startAt && !feeding.endAt
}

export function getInProgressFeedings(feedings: Feeding[]): Feeding[] {
  return feedings.filter(isFeedingInProgress)
}

function parsePartnerSide(side?: string | null): Feeding['side'] {
  if (side === 'Left') return 'left'
  if (side === 'Right') return 'right'
  return null
}

/** Optimistic local update when partner starts (FCM → native bridge, before listFeedings). */
export function applyPartnerFeedStarted(
  feedings: Feeding[],
  opts: { babyId: BabyId; feedingId: string; startAtMs: number; side?: string | null },
): Feeding[] {
  const startAt = Timestamp.fromMillis(opts.startAtMs)
  const side = parsePartnerSide(opts.side)
  const existing = feedings.find((f) => f.id === opts.feedingId)
  if (existing) {
    return feedings.map((f) =>
      f.id === opts.feedingId ? { ...f, startAt, endAt: null, side: side ?? f.side } : f,
    )
  }
  const now = Timestamp.now()
  const placeholder: Feeding = {
    id: opts.feedingId,
    type: 'nursing',
    babyId: opts.babyId,
    side,
    startAt,
    endAt: null,
    volumeOz: null,
    milkStorage: null,
    storedAt: null,
    milkLotId: null,
    milkDeductions: [],
    weightLb: null,
    weightOz: null,
    note: null,
    createdAt: now,
    updatedAt: now,
  }
  return [placeholder, ...feedings]
}

/** Partner ended via FCM; keep UI ended until listFeedings catches up. */
export type PartnerEndMarker = {
  babyId: BabyId
  feedingId?: string
  endedAt: number
}

const PARTNER_END_GUARD_MS = 90_000

export function prunePartnerEndMarkers(
  fetched: Feeding[],
  markers: PartnerEndMarker[],
): PartnerEndMarker[] {
  const now = Date.now()
  return markers.filter((m) => {
    if (now - m.endedAt > PARTNER_END_GUARD_MS) return false
    const stillOpen = fetched.some((f) => {
      if (m.feedingId) return f.id === m.feedingId && isFeedingInProgress(f)
      return f.babyId === m.babyId && isFeedingInProgress(f)
    })
    return stillOpen
  })
}

/** Apply server list without undoing a recent partner-end (stale listFeedings race). */
export function mergeFetchedFeedings(
  fetched: Feeding[],
  local: Feeding[],
  markers: PartnerEndMarker[],
): Feeding[] {
  const now = Date.now()
  const active = markers.filter((m) => now - m.endedAt <= PARTNER_END_GUARD_MS)
  if (active.length === 0) return fetched

  return fetched.map((f) => {
    const hit = active.some((m) =>
      m.feedingId ? m.feedingId === f.id : m.babyId === f.babyId,
    )
    if (!hit || !isFeedingInProgress(f)) return f
    const prev = local.find((l) => l.id === f.id)
    if (prev?.endAt) return prev
    return markFeedingsEndedByPartner([f], f.babyId, f.id)[0] ?? f
  })
}

/** Optimistic local update when partner ends a session (before listFeedings returns). */
export function markFeedingsEndedByPartner(
  feedings: Feeding[],
  babyId: BabyId,
  feedingId?: string,
): Feeding[] {
  const now = Timestamp.now()
  return feedings.map((f) => {
    if (feedingId) {
      if (f.id !== feedingId) return f
    } else if (f.babyId !== babyId) {
      return f
    }
    if (!isFeedingInProgress(f)) return f
    return { ...f, endAt: now }
  })
}

export function feedingElapsedSeconds(feeding: Feeding): number {
  const start = timestampToDate(feeding.startAt)
  if (!start) return 0
  return elapsedSeconds(start.toISOString())
}

export function remoteInProgressFeedings(
  feedings: Feeding[],
  localSessions: ActiveFeedDraft[],
): Feeding[] {
  const ownedFeedIds = new Set(
    localSessions.map((s) => s.feedingId).filter(Boolean) as string[],
  )
  const trackedBabyIds = new Set(
    localSessions
      .filter((s) => isSessionInProgress(s) && s.kind === 'nursing')
      .map((s) => s.babyId),
  )
  const localPumpActive = localSessions.some((s) => isSessionInProgress(s) && s.kind === 'pump')
  return getInProgressFeedings(feedings).filter((f) => {
    if (ownedFeedIds.has(f.id) || isFeedingOwnedByThisDevice(f.id)) return false
    if ((f.type ?? 'nursing') === 'pump') return !localPumpActive
    return !trackedBabyIds.has(f.babyId)
  })
}

export function findLocalSessionForFeeding(
  sessions: ActiveFeedDraft[],
  feeding: Feeding,
): ActiveFeedDraft | null {
  return (
    sessions.find((s) => {
      if (s.feedingId === feeding.id) return true
      if ((feeding.type ?? 'nursing') === 'pump') {
        return isSessionInProgress(s) && s.kind === 'pump'
      }
      return (
        isSessionInProgress(s) &&
        s.kind === (feeding.type ?? 'nursing') &&
        s.babyId === feeding.babyId &&
        !s.feedingId
      )
    }) ?? null
  )
}
