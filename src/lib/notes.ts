import {
  apiArchiveNote,
  apiCreateNote,
  apiDeleteNote,
  apiListNotes,
  apiUnarchiveNote,
  apiUpdateNote,
  formatApiError,
  type NoteInput,
  type NoteUpdateInput,
} from './api'
import { computeNoteArchiveActions } from './noteArchive'
import { cancelAppointmentNotificationsForNote } from './appointmentNotifications'
import { isScheduledNoteKind } from './notePeople'
import type { BabyNote } from '../types'

export type { NoteInput, NoteUpdateInput }

export async function fetchNotes(householdId: string): Promise<BabyNote[]> {
  try {
    return await apiListNotes(householdId)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function createNote(householdId: string, input: NoteInput): Promise<string> {
  try {
    return await apiCreateNote(householdId, input)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function updateNote(
  householdId: string,
  noteId: string,
  input: NoteUpdateInput,
): Promise<void> {
  try {
    await apiUpdateNote(householdId, noteId, input)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function archiveNote(
  householdId: string,
  noteId: string,
  options?: { occurrenceAt?: string },
): Promise<void> {
  try {
    await apiArchiveNote(householdId, noteId, options)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function unarchiveNote(
  householdId: string,
  noteId: string,
  options?: { clearOccurrence?: boolean },
): Promise<void> {
  try {
    await apiUnarchiveNote(householdId, noteId, options)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function deleteNote(
  householdId: string,
  noteId: string,
  note?: Pick<BabyNote, 'id' | 'kind'>,
): Promise<void> {
  try {
    if (note && isScheduledNoteKind(note.kind)) {
      await cancelAppointmentNotificationsForNote(note.id)
    }
    await apiDeleteNote(householdId, noteId)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

/** Auto-archive past scheduled items (+2h grace). Returns true if anything changed. */
export async function syncAutoNoteArchives(
  householdId: string,
  notes: BabyNote[],
): Promise<boolean> {
  const actions = computeNoteArchiveActions(notes, Date.now())
  if (actions.length === 0) return false

  for (const action of actions) {
    if (action.type === 'full') {
      await archiveNote(householdId, action.noteId)
    } else {
      await archiveNote(householdId, action.noteId, {
        occurrenceAt: action.occurrenceAt,
      })
    }
  }
  return true
}
