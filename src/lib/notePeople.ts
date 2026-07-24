import type { BabyNote } from '../types'

export function noteForPersonIds(note: BabyNote): string[] {
  const extra = note.forPersonIds ?? []
  if (extra.length > 0) return [...new Set(extra)]
  return note.forPersonId ? [note.forPersonId] : []
}

export function noteInvolvedPersonIds(note: BabyNote): string[] {
  const invitees = note.inviteePersonIds ?? []
  return [...new Set([...noteForPersonIds(note), ...invitees])]
}

export function noteVisibleForPersonId(note: BabyNote, personId: string): boolean {
  if (note.kind === 'todo' || note.kind === 'general') {
    return note.forPersonId === personId
  }
  return noteInvolvedPersonIds(note).includes(personId)
}

export function isScheduledNoteKind(kind: BabyNote['kind']): boolean {
  return kind === 'appointment' || kind === 'reminder'
}
