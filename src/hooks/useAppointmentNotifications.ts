import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  appointmentScheduleSignature,
  clearNativeAppointmentNotifications,
  syncNativeAppointmentNotifications,
} from '../lib/appointmentNotifications'
import { appointmentWatchSignature, buildNoteSubjects } from '../lib/noteSubjects'
import type { Baby, BabyNote, HouseholdMember } from '../types'

interface UseAppointmentNotificationsOptions {
  householdId: string | null
  notes: BabyNote[]
  notesLoading: boolean
  babies: Baby[]
  members: HouseholdMember[]
  personNicknames?: Record<string, string>
  enabled: boolean
}

export function useAppointmentNotifications({
  householdId,
  notes,
  notesLoading,
  babies,
  members,
  personNicknames,
  enabled,
}: UseAppointmentNotificationsOptions) {
  const lastSigRef = useRef('')
  const prevNotesSigRef = useRef('')
  const notesRef = useRef(notes)
  const babiesRef = useRef(babies)
  const membersRef = useRef(members)
  const nicknamesRef = useRef(personNicknames)
  const householdIdRef = useRef(householdId)
  const [watchTick, setWatchTick] = useState(0)

  notesRef.current = notes
  babiesRef.current = babies
  membersRef.current = members
  nicknamesRef.current = personNicknames
  householdIdRef.current = householdId

  useEffect(() => {
    const bump = () => {
      lastSigRef.current = ''
      setWatchTick((n) => n + 1)
    }
    window.addEventListener('freifeed-appointment-watch-changed', bump)
    return () => window.removeEventListener('freifeed-appointment-watch-changed', bump)
  }, [])

  const runSync = useCallback(async (force = false) => {
    const hid = householdIdRef.current
    if (!hid || !enabled) return

    const watchSig = appointmentWatchSignature(hid)
    const sig = appointmentScheduleSignature(notesRef.current, watchSig)
    if (!force && sig === lastSigRef.current) return
    lastSigRef.current = sig

    const subjects = buildNoteSubjects(
      babiesRef.current,
      membersRef.current,
      nicknamesRef.current,
    )
    await syncNativeAppointmentNotifications(notesRef.current, subjects, hid, { force })
  }, [enabled])

  const notesSig = useMemo(() => {
    const hid = householdIdRef.current
    if (!hid) return ''
    return appointmentScheduleSignature(notes, appointmentWatchSignature(hid))
  }, [notes, householdId])

  useEffect(() => {
    if (!householdId || !enabled) {
      lastSigRef.current = ''
      prevNotesSigRef.current = ''
      void clearNativeAppointmentNotifications()
      return
    }
    if (notesLoading) return

    let cancelled = false
    const force =
      prevNotesSigRef.current !== '' && notesSig !== prevNotesSigRef.current
    prevNotesSigRef.current = notesSig

    const run = async () => {
      if (cancelled) return
      await runSync(force)
    }

    const startDelay = window.setTimeout(() => void run(), 3_000)
    const interval = window.setInterval(() => void runSync(), 60_000)

    return () => {
      cancelled = true
      window.clearTimeout(startDelay)
      window.clearInterval(interval)
    }
  }, [householdId, enabled, notesLoading, watchTick, runSync, notesSig])
}
