import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { createFeeding, updateFeeding, type FeedingInput } from '../lib/feedings'
import {
  createEmptyDraft,
  defaultBabyForNewSession,
  elapsedSeconds,
  hasActivePumpSession,
  isSessionInProgress,
  loadActiveFeedSessions,
  saveActiveFeedSessions,
  sessionElapsedSeconds,
  type ActiveFeedDraft,
} from '../lib/activeFeedSession'
import { parseVolumeOzInput, resolvePumpBabyId } from '../lib/feedingTypes'
import { feedingToDraft } from '../lib/feedingDraft'
import { markFeedingOwnedByThisDevice, clearFeedingOwnership } from '../lib/feedOwnership'
import { reconcileSessionsWithFeedings, sessionsReconcileChanged } from '../lib/feedingSync'
import { sidesToNursingSide } from '../lib/sides'
import { combineDateAndTime, parseDayLocal, timestampToDate } from '../lib/time'
import { parseLbOz } from '../lib/weight'
import type { BabyId, Feeding, SessionKind } from '../types'

function pumpStoredAt(d: ActiveFeedDraft): Date {
  const day = parseDayLocal(d.storedDate || d.defaultDate)
  const nowTime = format(new Date(), 'HH:mm')
  const time = d.endTime?.trim() || d.startTime?.trim() || nowTime
  return combineDateAndTime(day, time) ?? day
}

function draftToInput(d: ActiveFeedDraft): FeedingInput {
  const defaultDate = parseDayLocal(d.defaultDate)
  const w = d.showWeight && d.kind !== 'pump' ? parseLbOz(d.weightLb, d.weightOz) : { lb: null, oz: null }
  const volumeOz = parseVolumeOzInput(d.volumeOz)
  const side = sidesToNursingSide(d.sides) ?? d.side
  const nowTime = format(new Date(), 'HH:mm')
  const bottleTime = d.startTime || nowTime
  const bottleAt = combineDateAndTime(defaultDate, bottleTime)

  // Pump sessions can save without explicit start/end times — default to now
  // so the entry still anchors on the timeline + milk storage.
  const pumpStartTime = d.kind === 'pump' ? d.startTime || nowTime : d.startTime
  const pumpEndTime = d.kind === 'pump' ? d.endTime || nowTime : d.endTime
  const startTime = d.kind === 'pump' ? pumpStartTime : d.startTime
  const endTime = d.kind === 'pump' ? pumpEndTime : d.endTime

  const volumeForOutput = volumeOz != null && volumeOz > 0 ? volumeOz : null

  const milkDeductions =
    d.kind === 'bottle' && volumeForOutput != null && d.bottleMilkDeductions.length > 0
      ? d.bottleMilkDeductions
      : undefined

  return {
    type: d.kind,
    babyId: d.babyId,
    side,
    startAt: d.kind === 'bottle' ? bottleAt : combineDateAndTime(defaultDate, startTime),
    endAt: d.kind === 'bottle' ? bottleAt : combineDateAndTime(defaultDate, endTime),
    volumeOz: d.kind === 'pump' || d.kind === 'bottle' ? volumeForOutput : null,
    milkStorage: d.kind === 'pump' && volumeForOutput != null ? d.milkStorage : null,
    storedAt: d.kind === 'pump' ? pumpStoredAt(d) : combineDateAndTime(defaultDate, startTime),
    weightLb: w.lb,
    weightOz: w.oz,
    note: d.note.trim() || null,
    milkDeductions,
  }
}

export function useActiveFeedSessions(
  householdId: string | null,
  babyIds: BabyId[],
  feedings: Feeding[],
  onFeedingsChanged: () => void,
  onMilkChanged?: () => void,
) {
  const [sessions, setSessionsState] = useState<ActiveFeedDraft[]>(() => loadActiveFeedSessions())
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  const persist = useCallback((next: ActiveFeedDraft[] | ((prev: ActiveFeedDraft[]) => ActiveFeedDraft[])) => {
    setSessionsState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      const forHousehold = householdId ? resolved.filter((s) => s.householdId === householdId) : []
      saveActiveFeedSessions(forHousehold)
      return forHousehold
    })
  }, [householdId])

  useEffect(() => {
    if (!householdId) {
      setSessionsState([])
      return
    }
    const stored = loadActiveFeedSessions().filter((s) => s.householdId === householdId)
    setSessionsState(stored)
  }, [householdId])

  useEffect(() => {
    if (!householdId) return
    const current = sessionsRef.current.filter((s) => s.householdId === householdId)
    const next = reconcileSessionsWithFeedings(current, feedings)
    if (!sessionsReconcileChanged(current, next)) return

    for (const session of current) {
      if (!next.some((s) => s.sessionId === session.sessionId) && session.feedingId) {
        clearFeedingOwnership(session.feedingId)
      }
    }
    saveActiveFeedSessions(next)
    setSessionsState(next)
  }, [householdId, feedings])

  const inProgressSessions = sessions.filter(isSessionInProgress)

  const getElapsed = useCallback(
    (sessionId: string) => {
      const s = sessions.find((x) => x.sessionId === sessionId)
      return s ? sessionElapsedSeconds(s) : 0
    },
    [sessions],
  )

  const createSession = useCallback(
    (
      kind: SessionKind = 'nursing',
      babyId?: BabyId,
      initialPatch?: Partial<ActiveFeedDraft>,
    ): ActiveFeedDraft => {
      if (!householdId) {
        throw new Error('Household not ready')
      }
      const resolvedBaby =
        kind === 'pump'
          ? resolvePumpBabyId(babyIds)
          : babyId ?? defaultBabyForNewSession(babyIds, sessionsRef.current)
      if (!resolvedBaby) {
        throw new Error('Add a baby before starting a feed session')
      }
      const d = { ...createEmptyDraft(householdId, kind, resolvedBaby), ...initialPatch }
      persist((prev) => [...prev, d])
      return d
    },
    [householdId, babyIds, persist],
  )

  const upsertSession = useCallback(
    (draft: ActiveFeedDraft) => {
      persist((prev) => {
        const idx = prev.findIndex((s) => s.sessionId === draft.sessionId)
        return idx >= 0 ? prev.map((s, i) => (i === idx ? draft : s)) : [...prev, draft]
      })
    },
    [persist],
  )

  const patchSession = useCallback(
    (sessionId: string, patch: Partial<ActiveFeedDraft>) => {
      persist((prev) => prev.map((s) => (s.sessionId === sessionId ? { ...s, ...patch } : s)))
    },
    [persist],
  )

  const removeSession = useCallback(
    (sessionId: string) => {
      persist((prev) => {
        const removed = prev.find((s) => s.sessionId === sessionId)
        if (removed?.feedingId) clearFeedingOwnership(removed.feedingId)
        return prev.filter((s) => s.sessionId !== sessionId)
      })
    },
    [persist],
  )

  const getSession = useCallback(
    (sessionId: string) => sessions.find((s) => s.sessionId === sessionId) ?? null,
    [sessions],
  )

  const hasActiveBaby = useCallback(
    (babyId: BabyId) =>
      sessions.some((s) => s.kind === 'nursing' && s.babyId === babyId && isSessionInProgress(s)),
    [sessions],
  )

  const hasActivePump = useCallback(() => hasActivePumpSession(sessions), [sessions])

  const buildInput = useCallback((d: ActiveFeedDraft): FeedingInput => draftToInput(d), [])

  const pushStopToServer = useCallback(
    async (current: ActiveFeedDraft, endStr: string) => {
      if (!householdId || !current.feedingId) return
      const defaultDate = parseDayLocal(current.defaultDate)
      const side = sidesToNursingSide(current.sides) ?? current.side
      const startAt =
        combineDateAndTime(defaultDate, current.startTime) ??
        (current.timerStartedAt ? new Date(current.timerStartedAt) : null)
      await updateFeeding(householdId, current.feedingId, {
        type: current.kind,
        babyId: current.babyId,
        side,
        startAt: startAt ?? new Date(),
        endAt: combineDateAndTime(defaultDate, endStr) ?? new Date(),
        volumeOz: null,
        milkStorage: current.kind === 'pump' ? current.milkStorage : null,
        storedAt: pumpStoredAt(current),
        weightLb: null,
        weightOz: null,
        note: current.note.trim() || null,
      })
      onFeedingsChanged()
    },
    [householdId, onFeedingsChanged],
  )

  const startTimer = useCallback(
    async (sessionId: string) => {
      const current = sessions.find((s) => s.sessionId === sessionId)
      if (!current || !householdId || current.kind === 'bottle') return
      const now = new Date()
      const presetStart = current.startTime?.trim()
        ? combineDateAndTime(
            parseDayLocal(current.defaultDate || format(now, 'yyyy-MM-dd')),
            current.startTime.trim(),
          )
        : null
      const startAt = presetStart ?? now
      setSyncingId(sessionId)
      try {
        const draft = {
          ...current,
          startTime: format(startAt, 'HH:mm'),
          endTime: '',
          defaultDate: format(startAt, 'yyyy-MM-dd'),
          timerStartedAt: startAt.toISOString(),
          storedDate: current.kind === 'pump' ? format(startAt, 'yyyy-MM-dd') : current.storedDate,
        }
        const input = draftToInput(draft)
        input.startAt = startAt
        input.endAt = null
        input.volumeOz = null
        input.milkStorage = current.kind === 'pump' ? current.milkStorage : null

        let feedingId = current.feedingId
        if (feedingId) {
          await updateFeeding(householdId, feedingId, input)
        } else {
          feedingId = await createFeeding(householdId, input)
        }

        patchSession(sessionId, {
          startTime: format(startAt, 'HH:mm'),
          endTime: '',
          defaultDate: format(startAt, 'yyyy-MM-dd'),
          timerStartedAt: startAt.toISOString(),
          timerAccumulatedSec: 0,
          timerPaused: false,
          feedingId,
          awaitingVolume: false,
          storedDate: draft.storedDate,
        })
        markFeedingOwnedByThisDevice(feedingId)
        onFeedingsChanged()
      } finally {
        setSyncingId(null)
      }
    },
    [sessions, householdId, patchSession, onFeedingsChanged],
  )

  const pauseTimer = useCallback(
    (sessionId: string) => {
      const current = sessions.find((s) => s.sessionId === sessionId)
      if (!current?.timerStartedAt || current.timerPaused) return
      const accumulated = (current.timerAccumulatedSec ?? 0) + elapsedSeconds(current.timerStartedAt)
      patchSession(sessionId, {
        timerAccumulatedSec: accumulated,
        timerStartedAt: null,
        timerPaused: true,
      })
    },
    [sessions, patchSession],
  )

  const resumeTimer = useCallback(
    (sessionId: string) => {
      const current = sessions.find((s) => s.sessionId === sessionId)
      if (!current?.timerPaused || current.timerStartedAt) return
      patchSession(sessionId, {
        timerStartedAt: new Date().toISOString(),
        timerPaused: false,
      })
    },
    [sessions, patchSession],
  )

  const stopTimer = useCallback(
    async (sessionId: string, endTimeOverride?: string) => {
      const current = sessions.find((s) => s.sessionId === sessionId)
      if (!current || !householdId) return
      const endStr = endTimeOverride?.trim() || current.endTime?.trim() || format(new Date(), 'HH:mm')
      setSyncingId(sessionId)
      try {
        const awaitingVolume = current.kind === 'pump'
        patchSession(sessionId, {
          endTime: endStr,
          timerStartedAt: null,
          timerPaused: false,
          awaitingVolume,
        })

        if (current.feedingId) {
          await pushStopToServer({ ...current, endTime: endStr }, endStr)
        }
      } finally {
        setSyncingId(null)
      }
    },
    [sessions, householdId, patchSession, pushStopToServer],
  )

  const syncEndTime = useCallback(
    async (sessionId: string, endTime: string) => {
      const current = sessions.find((s) => s.sessionId === sessionId)
      if (!current || !householdId || current.kind === 'bottle' || !endTime.trim()) return
      if (!current.feedingId && !current.timerStartedAt && !current.startTime) return

      const awaitingVolume = current.kind === 'pump'
      patchSession(sessionId, {
        endTime,
        timerStartedAt: null,
        timerPaused: false,
        awaitingVolume,
      })

      if (current.feedingId) {
        setSyncingId(sessionId)
        try {
          await pushStopToServer({ ...current, endTime }, endTime)
        } finally {
          setSyncingId(null)
        }
      }
    },
    [sessions, householdId, patchSession, pushStopToServer],
  )

  const stopFeedingRecord = useCallback(
    async (feeding: Feeding): Promise<ActiveFeedDraft | null> => {
      if (!householdId || !feeding.startAt || feeding.endAt) return null
      const now = new Date()
      const endStr = format(now, 'HH:mm')
      const existing = sessions.find((s) => s.feedingId === feeding.id)
      const draft = existing ?? feedingToDraft(householdId, feeding)
      const syncKey = existing?.sessionId ?? feeding.id

      setSyncingId(syncKey)
      try {
        const defaultDate = parseDayLocal(draft.defaultDate)
        const startAt = timestampToDate(feeding.startAt)
        const side = sidesToNursingSide(draft.sides) ?? feeding.side
        await updateFeeding(householdId, feeding.id, {
          type: feeding.type,
          babyId: feeding.babyId,
          side,
          startAt: startAt ?? combineDateAndTime(defaultDate, draft.startTime)!,
          endAt: combineDateAndTime(defaultDate, endStr) ?? now,
          volumeOz: null,
          milkStorage: feeding.type === 'pump' ? draft.milkStorage : null,
          storedAt: pumpStoredAt({ ...draft, endTime: endStr }),
          weightLb: null,
          weightOz: null,
          note: (existing?.note ?? feeding.note ?? '').trim() || null,
        })

        const stopped: ActiveFeedDraft = {
          ...draft,
          feedingId: feeding.id,
          endTime: endStr,
          timerStartedAt: null,
          timerPaused: false,
          awaitingVolume: feeding.type === 'pump',
        }
        persist((prev) => {
          const i = prev.findIndex(
            (s) => s.sessionId === stopped.sessionId || s.feedingId === feeding.id,
          )
          if (i >= 0) return prev.map((s, j) => (j === i ? stopped : s))
          return [...prev, stopped]
        })
        markFeedingOwnedByThisDevice(feeding.id)
        onFeedingsChanged()
        return stopped
      } finally {
        setSyncingId(null)
      }
    },
    [sessions, householdId, persist, onFeedingsChanged],
  )

  const ensureSessionForFeeding = useCallback(
    (feeding: Feeding): ActiveFeedDraft | null => {
      if (!householdId) return null
      const existing = sessions.find((s) => {
        if (s.feedingId === feeding.id) return true
        if (feeding.type === 'pump') {
          return isSessionInProgress(s) && s.kind === 'pump'
        }
        return isSessionInProgress(s) && s.kind === feeding.type && s.babyId === feeding.babyId
      })
      if (existing) {
        const linked = { ...existing, feedingId: feeding.id }
        if (!existing.feedingId) {
          patchSession(existing.sessionId, { feedingId: feeding.id })
          markFeedingOwnedByThisDevice(feeding.id)
        }
        return linked
      }
      const draft = feedingToDraft(householdId, feeding)
      upsertSession(draft)
      markFeedingOwnedByThisDevice(feeding.id)
      return draft
    },
    [householdId, sessions, patchSession, upsertSession],
  )

  const notifySaved = useCallback(() => {
    onFeedingsChanged()
    onMilkChanged?.()
  }, [onFeedingsChanged, onMilkChanged])

  return {
    sessions,
    inProgressSessions,
    syncingId,
    getElapsed,
    createSession,
    upsertSession,
    patchSession,
    removeSession,
    getSession,
    hasActiveBaby,
    hasActivePump,
    ensureSessionForFeeding,
    stopFeedingRecord,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    syncEndTime,
    buildInput,
    notifySaved,
  }
}
