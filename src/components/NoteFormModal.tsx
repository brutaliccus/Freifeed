import { addMonths, format, isValid } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { AlarmClock, CalendarClock, ChevronDown, ClipboardList, StickyNote } from 'lucide-react'
import { FeedDateButton } from './FeedDateButton'
import { TimePickerField } from './TimePickerField'
import { PersonPuck } from './PersonPuck'
import { AppointmentRecurrenceFields, type RecurrenceEndMode } from './AppointmentRecurrenceFields'
import { ReminderPickerField } from './ReminderPickerField'
import { createNote, updateNote, type NoteInput } from '../lib/notes'
import { buildNoteSubjects } from '../lib/noteSubjects'
import { isScheduledNoteKind, noteForPersonIds } from '../lib/notePeople'
import {
  combineDateAndTime,
  parseDayLocal,
  timestampToDate,
  todayLocalDateString,
} from '../lib/time'
import type { AppointmentRecurrence, Baby, BabyNote, HouseholdMember, NoteKind } from '../types'
import type { NoteForPersonId } from '../lib/noteSubjects'

interface NoteFormModalProps {
  householdId: string
  babies: Baby[]
  members: HouseholdMember[]
  personNicknames?: Record<string, string>
  defaultPersonId?: NoteForPersonId
  initialKind?: NoteKind
  editing?: BabyNote | null
  onClose: () => void
  onSaved: () => void
}

const KIND_OPTIONS: { kind: NoteKind; label: string; hint: string; Icon: typeof StickyNote }[] = [
  { kind: 'appointment', label: 'Appointment', hint: 'Date, time & reminder', Icon: CalendarClock },
  { kind: 'reminder', label: 'Reminder', hint: 'Don’t forget — with alert', Icon: AlarmClock },
  { kind: 'todo', label: 'To-do', hint: 'Check off when done', Icon: ClipboardList },
  { kind: 'general', label: 'Note', hint: 'Quick line to remember', Icon: StickyNote },
]

function initialFormFromNote(note: BabyNote | null | undefined, defaultPersonId: NoteForPersonId) {
  if (!note) {
    return {
      kind: 'todo' as NoteKind,
      personId: defaultPersonId,
      forPersonIds: [defaultPersonId] as string[],
      text: '',
      details: '',
      dateStr: todayLocalDateString(),
      timeStr: '09:00',
      reminderMinutes: 30,
      recurring: false,
      recurrenceFreq: 'weekly' as AppointmentRecurrence['frequency'],
      recurrenceEndMode: 'count' as RecurrenceEndMode,
      recurrenceCount: 4,
      recurrenceEndDate: todayLocalDateString(),
      inviteeIds: [] as string[],
    }
  }

  const scheduled = timestampToDate(note.scheduledAt)
  const safeScheduled = scheduled && isValid(scheduled) ? scheduled : null
  const recurrence = note.recurrence
  const forIds = noteForPersonIds(note)

  return {
    kind: note.kind,
    personId: (forIds[0] ?? note.forPersonId) as NoteForPersonId,
    forPersonIds: forIds.length > 0 ? forIds : [note.forPersonId],
    text: note.text,
    details: note.details ?? '',
    dateStr: safeScheduled ? format(safeScheduled, 'yyyy-MM-dd') : todayLocalDateString(),
    timeStr: safeScheduled ? format(safeScheduled, 'HH:mm') : '09:00',
    reminderMinutes: note.reminderMinutesBefore ?? 30,
    recurring: !!recurrence,
    recurrenceFreq: recurrence?.frequency ?? ('weekly' as AppointmentRecurrence['frequency']),
    recurrenceEndMode: (recurrence?.endAt ? 'until' : 'count') as RecurrenceEndMode,
    recurrenceCount: recurrence?.count ?? 4,
    recurrenceEndDate: recurrence?.endAt?.slice(0, 10) ?? todayLocalDateString(),
    inviteeIds: [...(note.inviteePersonIds ?? [])],
  }
}

export function NoteFormModal({
  householdId,
  babies,
  members,
  personNicknames,
  defaultPersonId,
  initialKind,
  editing,
  onClose,
  onSaved,
}: NoteFormModalProps) {
  const subjects = useMemo(
    () => buildNoteSubjects(babies, members, personNicknames),
    [babies, members, personNicknames],
  )

  const isEditing = !!editing
  const initial = useMemo(
    () =>
      initialFormFromNote(editing, defaultPersonId ?? subjects[0]?.id ?? 'baby:unknown'),
    [editing, defaultPersonId, subjects],
  )

  const [step, setStep] = useState<'type' | 'form'>(isEditing || initialKind ? 'form' : 'type')
  const [kind, setKind] = useState<NoteKind>(editing?.kind ?? initialKind ?? initial.kind)
  const [personId, setPersonId] = useState<NoteForPersonId>(initial.personId)
  const [forPersonIds, setForPersonIds] = useState<string[]>(initial.forPersonIds)
  const [text, setText] = useState(initial.text)
  const [details, setDetails] = useState(initial.details)
  const [dateStr, setDateStr] = useState(initial.dateStr)
  const [timeStr, setTimeStr] = useState(initial.timeStr)
  const [reminderMinutes, setReminderMinutes] = useState(initial.reminderMinutes)
  const [recurring, setRecurring] = useState(initial.recurring)
  const [recurrenceFreq, setRecurrenceFreq] = useState(initial.recurrenceFreq)
  const [recurrenceEndMode, setRecurrenceEndMode] = useState(initial.recurrenceEndMode)
  const [recurrenceCount, setRecurrenceCount] = useState(initial.recurrenceCount)
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(initial.recurrenceEndDate)
  const [inviteeIds, setInviteeIds] = useState<string[]>(initial.inviteeIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scheduledKind = isScheduledNoteKind(kind)

  useEffect(() => {
    if (!scheduledKind && !subjects.some((s) => s.id === personId) && subjects[0]) {
      setPersonId(subjects[0].id)
    }
  }, [personId, subjects, scheduledKind])

  useEffect(() => {
    if (scheduledKind) {
      setInviteeIds((prev) => prev.filter((id) => !forPersonIds.includes(id)))
    } else {
      setInviteeIds((prev) => prev.filter((id) => id !== personId))
    }
  }, [personId, forPersonIds, scheduledKind])

  const pickKind = (next: NoteKind) => {
    setKind(next)
    setStep('form')
    setError(null)
    if (isScheduledNoteKind(next) && forPersonIds.length === 0 && subjects[0]) {
      setForPersonIds([subjects[0].id])
    }
  }

  const toggleForPerson = (id: NoteForPersonId) => {
    setForPersonIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id)
        return next.length > 0 ? next : prev
      }
      return [...prev, id]
    })
  }

  const toggleInvitee = (id: NoteForPersonId) => {
    if (forPersonIds.includes(id)) return
    setInviteeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const buildScheduledInput = (scheduledKind: 'appointment' | 'reminder'): NoteInput | null => {
    const trimmed = text.trim()
    if (!trimmed) {
      setError('Enter a title')
      return null
    }
    if (forPersonIds.length === 0) {
      setError('Choose who this is for')
      return null
    }

    const scheduledAt = combineDateAndTime(parseDayLocal(dateStr), timeStr)
    if (!scheduledAt) {
      setError('Pick a valid date and time')
      return null
    }
    if (!isEditing && scheduledAt.getTime() <= Date.now() + 30_000) {
      setError(`${scheduledKind === 'reminder' ? 'Reminder' : 'Appointment'} must be in the future`)
      return null
    }

    let recurrence: AppointmentRecurrence | null = null
    if (recurring) {
      if (recurrenceEndMode === 'count') {
        if (recurrenceCount < 2) {
          setError('Need at least 2 visits for a recurring series')
          return null
        }
        recurrence = {
          frequency: recurrenceFreq,
          count: recurrenceCount,
          endAt: null,
        }
      } else {
        const endDay = parseDayLocal(recurrenceEndDate)
        if (!endDay) {
          setError('Pick a valid end date')
          return null
        }
        const startDay = parseDayLocal(dateStr)
        if (startDay && endDay.getTime() < startDay.getTime()) {
          setError('End date must be on or after the first occurrence')
          return null
        }
        recurrence = {
          frequency: recurrenceFreq,
          count: null,
          endAt: recurrenceEndDate.slice(0, 10),
        }
      }
    }

    return {
      kind: scheduledKind,
      forPersonIds,
      text: trimmed,
      details: details.trim() || null,
      scheduledAt: scheduledAt.toISOString(),
      reminderMinutesBefore: reminderMinutes,
      recurrence,
      inviteePersonIds: inviteeIds,
    }
  }

  const buildInput = (): NoteInput | null => {
    const trimmed = text.trim()
    if (!trimmed) {
      setError(kind === 'appointment' || kind === 'reminder' ? 'Enter a title' : 'Enter text')
      return null
    }

    if (kind === 'appointment' || kind === 'reminder') {
      return buildScheduledInput(kind)
    }

    if (!subjects.some((s) => s.id === personId)) {
      setError('Choose who this is for')
      return null
    }

    if (kind === 'general') {
      return { kind: 'general', forPersonId: personId, text: trimmed }
    }

    return { kind: 'todo', forPersonId: personId, text: trimmed }
  }

  const handleSave = async () => {
    if (kind === 'todo' && !isEditing) {
      const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (lines.length === 0) {
        setError('Enter at least one to-do')
        return
      }
      if (!subjects.some((s) => s.id === personId)) {
        setError('Choose who this is for')
        return
      }

      setSaving(true)
      setError(null)
      try {
        await Promise.all(
          lines.map((line) =>
            createNote(householdId, { kind: 'todo', forPersonId: personId, text: line }),
          ),
        )
        onSaved()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save')
      } finally {
        setSaving(false)
      }
      return
    }

    const input = buildInput()
    if (!input) return

    setSaving(true)
    setError(null)
    try {
      if (isEditing && editing) {
        await updateNote(householdId, editing.id, input)
      } else {
        await createNote(householdId, input)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const kindLabel = (k: NoteKind) => {
    if (k === 'appointment') return 'appointment'
    if (k === 'reminder') return 'reminder'
    if (k === 'todo') return 'to-do'
    return 'note'
  }

  const title =
    step === 'type'
      ? 'What are you adding?'
      : isEditing
        ? `Edit ${kindLabel(kind)}`
        : `New ${kindLabel(kind)}`

  return (
    <>
      <div className="feed-drawer-backdrop" onClick={onClose} role="presentation" />
      <div
        className="feed-drawer feed-drawer--open feed-drawer--notes"
        role="dialog"
        aria-labelledby="note-drawer-title"
      >
        <div className="feed-drawer__handle" aria-hidden />
        <header className="feed-drawer__header">
          <h2 id="note-drawer-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <ChevronDown size={24} />
          </button>
        </header>

        <div className="feed-drawer__body">
          {step === 'type' && !isEditing && (
            <div className="note-type-picker">
              {KIND_OPTIONS.map(({ kind: k, label, hint, Icon }) => (
                <button
                  key={k}
                  type="button"
                  className={`note-type-picker__btn note-type-picker__btn--${k}`}
                  onClick={() => pickKind(k)}
                >
                  <span className="note-type-picker__icon" aria-hidden>
                    <Icon size={22} />
                  </span>
                  <span className="note-type-picker__label">{label}</span>
                  <span className="note-type-picker__hint">{hint}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'form' && (
            <>
              {!scheduledKind && (
                <div className="baby-picker-row note-person-picker">
                  {subjects.map((subject) => (
                    <PersonPuck
                      key={subject.id}
                      subject={subject}
                      babies={babies}
                      members={members}
                      size="lg"
                      selected={personId === subject.id}
                      onClick={() => setPersonId(subject.id)}
                    />
                  ))}
                </div>
              )}

              {subjects.length === 0 && (
                <p className="muted">Add a baby or household member in Profile first.</p>
              )}

              <label className="note-field">
                <span className="field-label">
                  {scheduledKind ? 'Title' : kind === 'todo' ? 'To-dos' : 'Note'}
                </span>
                {kind === 'todo' && !isEditing && (
                  <span className="muted note-field__hint">One item per line</span>
                )}
                <textarea
                  className="input note-field__textarea"
                  rows={kind === 'todo' && !isEditing ? 6 : kind === 'general' ? 2 : 3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={kind === 'todo' && !isEditing ? 8000 : 2000}
                  placeholder={
                    kind === 'appointment'
                      ? 'Pediatric checkup, lactation consult…'
                      : kind === 'reminder'
                        ? 'Give vitamin D, call insurance…'
                        : kind === 'todo'
                          ? 'Buy diapers\nCall pediatrician\nPack hospital bag'
                          : 'Insurance called back — reference #…'
                  }
                  autoFocus
                  disabled={saving}
                />
              </label>

              {scheduledKind && (
                <>
                  {subjects.length > 0 && (
                    <div className="field-block">
                      <span className="field-label">For</span>
                      <div className="baby-picker-row note-person-picker note-invitee-picker">
                        {subjects.map((subject) => (
                          <PersonPuck
                            key={subject.id}
                            subject={subject}
                            babies={babies}
                            members={members}
                            size="lg"
                            selected={forPersonIds.includes(subject.id)}
                            onClick={() => toggleForPerson(subject.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="note-appt-when">
                    <FeedDateButton value={dateStr} onChange={setDateStr} disabled={saving} />
                    <TimePickerField
                      label="Time"
                      value={timeStr}
                      onChange={setTimeStr}
                      disabled={saving}
                    />
                  </div>

                  <ReminderPickerField
                    value={reminderMinutes}
                    onChange={setReminderMinutes}
                    disabled={saving}
                  />

                  <AppointmentRecurrenceFields
                    enabled={recurring}
                    onEnabledChange={(on) => {
                      setRecurring(on)
                      if (on) {
                        const start = parseDayLocal(dateStr)
                        if (start) {
                          setRecurrenceEndDate(format(addMonths(start, 3), 'yyyy-MM-dd'))
                        }
                      }
                    }}
                    frequency={recurrenceFreq}
                    onFrequencyChange={setRecurrenceFreq}
                    endMode={recurrenceEndMode}
                    onEndModeChange={setRecurrenceEndMode}
                    occurrenceCount={recurrenceCount}
                    onOccurrenceCountChange={setRecurrenceCount}
                    endDateStr={recurrenceEndDate}
                    onEndDateStrChange={setRecurrenceEndDate}
                    disabled={saving}
                  />

                  {subjects.length > 1 && (
                    <div className="field-block">
                      <span className="field-label">With (optional)</span>
                      <div className="baby-picker-row note-person-picker note-invitee-picker">
                        {subjects
                          .filter((s) => !forPersonIds.includes(s.id))
                          .map((subject) => (
                            <PersonPuck
                              key={subject.id}
                              subject={subject}
                              babies={babies}
                              members={members}
                              size="lg"
                              selected={inviteeIds.includes(subject.id)}
                              onClick={() => toggleInvitee(subject.id)}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  <label className="note-field">
                    <span className="field-label">Details (optional)</span>
                    <textarea
                      className="input note-field__textarea"
                      rows={3}
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      maxLength={2000}
                      placeholder="Address, what to bring, doctor name…"
                      disabled={saving}
                    />
                  </label>
                </>
              )}

              {error && <p className="error-text">{error}</p>}
            </>
          )}
        </div>

        {step === 'form' && (
          <footer className="modal__footer feed-drawer__footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                isEditing || initialKind ? onClose() : setStep('type')
              }
              disabled={saving}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary btn--grow feed-drawer__save--notes"
              onClick={() => void handleSave()}
              disabled={
                saving ||
                subjects.length === 0 ||
                (scheduledKind && forPersonIds.length === 0)
              }
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </footer>
        )}
      </div>
    </>
  )
}
