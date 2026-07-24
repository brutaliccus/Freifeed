import { useCallback, useEffect, useRef, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { syncAutoNoteArchives } from '../lib/notes'
import { mapNote } from '../lib/firestoreMappers'
import { writeCachedCollection } from '../lib/householdCollectionCache'
import type { BabyNote } from '../types'
import { timestampMs } from '../lib/time'
import { useHouseholdCollection } from './useHouseholdCollection'

const ARCHIVE_SWEEP_MS = 300_000

type NotePatch = Partial<Pick<BabyNote, 'archived' | 'completedAt' | 'updatedAt'>>

function mergeNotes(serverNotes: BabyNote[], patches: Map<string, NotePatch>): BabyNote[] {
  if (patches.size === 0) return serverNotes
  return serverNotes.map((note) => {
    const patch = patches.get(note.id)
    if (!patch) return note
    if (patch.archived && note.archived) {
      patches.delete(note.id)
      return note
    }
    return { ...note, ...patch }
  })
}

export function useNotes(householdId: string | null, enabled = true) {
  const {
    data: serverNotes,
    loading,
    error,
    refresh,
  } = useHouseholdCollection(
    householdId,
    'notes',
    'updatedAt',
    mapNote,
    (n) => timestampMs(n.updatedAt),
    { sinceDays: null, limit: 500 },
  )

  const [notes, setNotes] = useState<BabyNote[]>([])
  const patchesRef = useRef<Map<string, NotePatch>>(new Map())
  const notesRef = useRef<BabyNote[]>([])
  const sweepingRef = useRef(false)

  useEffect(() => {
    setNotes(mergeNotes(serverNotes, patchesRef.current))
  }, [serverNotes])

  notesRef.current = notes

  const flushNotesCache = useCallback(
    (nextNotes: BabyNote[]) => {
      if (!householdId) return
      writeCachedCollection(householdId, 'notes', nextNotes)
    },
    [householdId],
  )

  const applyOptimisticPatch = useCallback(
    (noteId: string, patch: NotePatch) => {
      patchesRef.current.set(noteId, { ...patchesRef.current.get(noteId), ...patch })
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n))
        flushNotesCache(next)
        return next
      })
    },
    [flushNotesCache],
  )

  const archiveNoteOptimistic = useCallback(
    (noteId: string) => {
      const now = Timestamp.now()
      applyOptimisticPatch(noteId, { archived: true, completedAt: now, updatedAt: now })
    },
    [applyOptimisticPatch],
  )

  const unarchiveNoteOptimistic = useCallback(
    (noteId: string) => {
      const now = Timestamp.now()
      patchesRef.current.delete(noteId)
      applyOptimisticPatch(noteId, { archived: false, completedAt: null, updatedAt: now })
    },
    [applyOptimisticPatch],
  )

  const revertNoteOptimistic = useCallback(
    (noteId: string) => {
      patchesRef.current.delete(noteId)
      setNotes(mergeNotes(serverNotes, patchesRef.current))
    },
    [serverNotes],
  )

  const addNotesOptimistic = useCallback(
    (drafts: BabyNote[]) => {
      if (drafts.length === 0) return
      setNotes((prev) => {
        const next = [...drafts, ...prev]
        flushNotesCache(next)
        return next
      })
    },
    [flushNotesCache],
  )

  const sweepArchives = useCallback(async () => {
    if (!householdId || !enabled || sweepingRef.current) return
    if (notesRef.current.length === 0) return
    sweepingRef.current = true
    try {
      await syncAutoNoteArchives(householdId, notesRef.current)
    } catch {
      /* non-fatal */
    } finally {
      sweepingRef.current = false
    }
  }, [householdId, enabled])

  useEffect(() => {
    if (!householdId || !enabled) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sweepArchives()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sweepArchives()
    }, ARCHIVE_SWEEP_MS)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [householdId, enabled, sweepArchives])

  return {
    notes,
    loading,
    error,
    refresh,
    archiveNoteOptimistic,
    unarchiveNoteOptimistic,
    revertNoteOptimistic,
    addNotesOptimistic,
  }
}
