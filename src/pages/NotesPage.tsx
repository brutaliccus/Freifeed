import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  AlarmClock,
  Archive,
  Bell,
  BellOff,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Pencil,
  RotateCcw,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { AddNoteIcon } from '../components/AddNoteIcon'
import { LoadMoreButton } from '../components/LoadMoreButton'
import { IconPlusOverlay, TRACKER_PLUS_ICON_SIZE } from '../components/IconPlusOverlay'
import { NoteFormModal } from '../components/NoteFormModal'
import { NotesArchiveIcon } from '../components/NotesArchiveIcon'
import { PersonPuck } from '../components/PersonPuck'
import { ThemedCheckbox } from '../components/ThemedCheckbox'
import {
  describeRecurrence,
  nextAppointmentOccurrence,
} from '../lib/appointmentRecurrence'
import { archiveNote, deleteNote, unarchiveNote } from '../lib/notes'
import {
  archivedOccurrenceDisplayAt,
  hasOlderArchivedNotes,
  hasUpcomingOccurrences,
  isOccurrenceArchiveEntry,
  noteInArchiveWindow,
  noteShowsInArchivePanel,
} from '../lib/noteArchive'
import { DEFAULT_ARCHIVE_DAYS, LOAD_MORE_DAYS } from '../lib/listQueryClient'
import { noteForPersonIds, noteVisibleForPersonId } from '../lib/notePeople'
import { reminderLabel } from '../lib/noteReminders'
import {
  buildNoteSubjects,
  isAppointmentSubjectWatchEnabled,
  setAppointmentSubjectWatchEnabled,
  subjectLabel,
} from '../lib/noteSubjects'
import { timestampToDate } from '../lib/time'
import type { ReactNode } from 'react'
import type { Baby, BabyNote, HouseholdMember } from '../types'
import type { NoteForPersonId, NoteSubject } from '../lib/noteSubjects'

interface NotesPageProps {
  householdId: string
  babies: Baby[]
  members: HouseholdMember[]
  personNicknames?: Record<string, string>
  notes: BabyNote[]
  initialExpandedPersonId?: string | null
  onExpandedPersonConsumed?: () => void
  onRefresh: () => void
  archiveNoteOptimistic?: (noteId: string) => void
  unarchiveNoteOptimistic?: (noteId: string) => void
  revertNoteOptimistic?: (noteId: string) => void
}

const NOTES_LINE_GAP_PX = 7

function NotesRowConnector({
  personName,
  showArchive,
  watchEnabled,
  onToggleWatch,
}: {
  personName: string
  showArchive: boolean
  watchEnabled: boolean
  onToggleWatch: () => void
}) {
  const headerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return

    const row = header.closest('.notes-row') as HTMLElement | null
    if (!row) return

    const portraitBtn = row.querySelector<HTMLElement>('.notes-portrait-btn')
    if (!portraitBtn) return

    const update = () => {
      const title = header.querySelector<HTMLElement>('.notes-row__title')
      if (!title) return

      const portraitRect = portraitBtn.getBoundingClientRect()
      const titleRect = title.getBoundingClientRect()
      const startX = portraitRect.left + portraitRect.width / 2
      const endX = titleRect.left - NOTES_LINE_GAP_PX
      const width = Math.max(0, endX - startX)
      row.style.setProperty('--notes-line-width', `${width}px`)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(header)
    ro.observe(portraitBtn)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [personName, showArchive, watchEnabled])

  return (
    <div className="notes-row__connector">
      <div className="notes-row__header" ref={headerRef}>
        <span className="notes-row__line" aria-hidden />
        <h2 className="notes-row__title">
          {personName}&apos;s notes
          {showArchive ? ' — Archive' : ''}
        </h2>
        {!showArchive && (
          <button
            type="button"
            className={`notes-row__watch soft-glow-control${watchEnabled ? ' soft-glow-control--on' : ''}`}
            onClick={onToggleWatch}
            aria-label={
              watchEnabled
                ? `Mute appointment & reminder alerts for ${personName}`
                : `Enable appointment & reminder alerts for ${personName}`
            }
          >
            {watchEnabled ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
        )}
      </div>
    </div>
  )
}

function notesForPerson(notes: BabyNote[], personId: NoteForPersonId) {
  return notes.filter((n) => noteVisibleForPersonId(n, personId))
}

function partitionScheduledUpcoming(items: BabyNote[], now: number) {
  const upcoming = items.filter((n) => hasUpcomingOccurrences(n, now))
  upcoming.sort((a, b) => {
    const na = nextAppointmentOccurrence(a, now)?.getTime() ?? 0
    const nb = nextAppointmentOccurrence(b, now)?.getTime() ?? 0
    return na - nb
  })
  return upcoming
}

function sortArchiveScheduled(items: BabyNote[], now: number) {
  return [...items].sort((a, b) => {
    const ta = archivedOccurrenceDisplayAt(a, now)?.getTime() ?? 0
    const tb = archivedOccurrenceDisplayAt(b, now)?.getTime() ?? 0
    return tb - ta
  })
}

function NoteSection({
  title,
  icon: Icon,
  variant,
  empty,
  showEmpty,
  children,
}: {
  title: string
  icon: typeof CalendarClock
  variant: 'appointment' | 'reminder' | 'todo' | 'general'
  empty: string
  showEmpty?: boolean
  children?: ReactNode
}) {
  return (
    <section className={`notes-section notes-section--${variant}`}>
      <h3 className="notes-section__heading">
        <Icon size={16} aria-hidden />
        {title}
      </h3>
      {showEmpty ? <p className="notes-section__empty muted">{empty}</p> : children}
    </section>
  )
}

export function NotesPage({
  householdId,
  babies,
  members,
  personNicknames,
  notes,
  initialExpandedPersonId,
  onExpandedPersonConsumed,
  onRefresh,
  archiveNoteOptimistic,
  unarchiveNoteOptimistic,
  revertNoteOptimistic,
}: NotesPageProps) {
  const subjects = useMemo(
    () => buildNoteSubjects(babies, members, personNicknames),
    [babies, members, personNicknames],
  )

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedApptIds, setExpandedApptIds] = useState<Set<string>>(new Set())
  const [archiveView, setArchiveView] = useState<Set<string>>(new Set())
  const [archiveDaysLoaded, setArchiveDaysLoaded] = useState(DEFAULT_ARCHIVE_DAYS)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<BabyNote | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [watchRevision, setWatchRevision] = useState(0)

  useEffect(() => {
    const onWatchChange = () => setWatchRevision((r) => r + 1)
    window.addEventListener('freifeed-appointment-watch-changed', onWatchChange)
    return () => window.removeEventListener('freifeed-appointment-watch-changed', onWatchChange)
  }, [])

  useEffect(() => {
    if (!initialExpandedPersonId) return
    if (!subjects.some((s) => s.id === initialExpandedPersonId)) return
    setExpanded((prev) => new Set(prev).add(initialExpandedPersonId))
    onExpandedPersonConsumed?.()
  }, [initialExpandedPersonId, subjects, onExpandedPersonConsumed])

  const searchLower = search.trim().toLowerCase()
  const now = Date.now()
  const archiveHasMore = useMemo(
    () => hasOlderArchivedNotes(notes, now, archiveDaysLoaded),
    [notes, now, archiveDaysLoaded],
  )

  const loadMoreArchive = () => {
    setArchiveDaysLoaded((d) => d + LOAD_MORE_DAYS)
  }

  const matchingNoteIds = useMemo(() => {
    if (!searchLower) return null
    const ids = new Set<string>()
    for (const n of notes) {
      const hay = `${n.text} ${n.details ?? ''}`.toLowerCase()
      if (hay.includes(searchLower)) ids.add(n.id)
    }
    return ids
  }, [notes, searchLower])

  const togglePerson = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setArchiveView((a) => {
          const n = new Set(a)
          n.delete(id)
          return n
        })
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleArchiveView = (id: string) => {
    setArchiveView((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openCreate = () => {
    setEditingNote(null)
    setModalOpen(true)
  }

  const openEdit = (note: BabyNote) => {
    setEditingNote(note)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingNote(null)
  }

  const handleArchive = async (note: BabyNote, e?: React.MouseEvent) => {
    e?.stopPropagation()
    archiveNoteOptimistic?.(note.id)
    try {
      await archiveNote(householdId, note.id)
      onRefresh()
    } catch {
      revertNoteOptimistic?.(note.id)
    }
  }

  const handleRestore = async (note: BabyNote, e?: React.MouseEvent) => {
    e?.stopPropagation()
    unarchiveNoteOptimistic?.(note.id)
    try {
      await unarchiveNote(householdId, note.id, {
        clearOccurrence: isOccurrenceArchiveEntry(note),
      })
      onRefresh()
    } catch {
      revertNoteOptimistic?.(note.id)
    }
  }

  const handleCheck = async (note: BabyNote) => {
    archiveNoteOptimistic?.(note.id)
    try {
      await archiveNote(householdId, note.id)
      onRefresh()
    } catch {
      revertNoteOptimistic?.(note.id)
    }
  }

  const handleDelete = async (note: BabyNote, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!window.confirm('Delete this item permanently?')) return
    setBusyId(note.id)
    try {
      await deleteNote(householdId, note.id, note)
      onRefresh()
    } finally {
      setBusyId(null)
    }
  }

  const openFromSearch = (note: BabyNote) => {
    const personId =
      subjects.find((s) => noteVisibleForPersonId(note, s.id))?.id ?? note.forPersonId
    setExpanded((prev) => new Set(prev).add(personId))
    if (note.archived || noteShowsInArchivePanel(note)) {
      setArchiveView((prev) => new Set(prev).add(personId))
    }
    openEdit(note)
  }

  const toggleApptExpand = (noteId: string) => {
    setExpandedApptIds((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  const scheduledDetailLines = (note: BabyNote, displayAt: Date | null, seriesStart: Date | null) => {
    const forLabels = noteForPersonIds(note)
      .map((id) => subjectLabel(subjects, id))
      .filter(Boolean)
    const inviteeLabels = (note.inviteePersonIds ?? [])
      .map((id) => subjectLabel(subjects, id))
      .filter(Boolean)
    const lines: string[] = []
    if (displayAt) {
      lines.push(`When: ${format(displayAt, 'EEE, MMM d · h:mm a')}`)
    }
    if (note.recurrence && seriesStart) {
      lines.push(`Repeats: ${describeRecurrence(note.recurrence, seriesStart)}`)
    }
    if (note.reminderMinutesBefore != null) {
      lines.push(`Remind: ${reminderLabel(note.reminderMinutesBefore)}`)
    }
    if (forLabels.length > 0) {
      lines.push(`For: ${forLabels.join(', ')}`)
    }
    if (inviteeLabels.length > 0) {
      lines.push(`With: ${inviteeLabels.join(', ')}`)
    }
    if (note.details?.trim()) {
      lines.push(`Details: ${note.details.trim()}`)
    }
    return lines
  }

  const renderArchiveActions = (note: BabyNote, options?: { allowEdit?: boolean }) => (
    <>
      {options?.allowEdit && (
        <button
          type="button"
          className="notes-line-item__edit"
          onClick={() => openEdit(note)}
          disabled={busyId === note.id}
          aria-label="Edit"
        >
          <Pencil size={15} />
        </button>
      )}
      <button
        type="button"
        className="notes-line-item__restore"
        onClick={(e) => void handleRestore(note, e)}
        disabled={busyId === note.id}
        aria-label="Move back to active"
      >
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        className="notes-line-item__delete"
        onClick={(e) => void handleDelete(note, e)}
        disabled={busyId === note.id}
        aria-label="Delete"
      >
        <Trash2 size={16} />
      </button>
    </>
  )

  const renderArchivedScheduled = (note: BabyNote) => {
    const highlight = matchingNoteIds?.has(note.id) && searchLower.length > 0
    const occurredAt = archivedOccurrenceDisplayAt(note, now)
    const recurringSnapshot = isOccurrenceArchiveEntry(note)
    return (
      <li
        key={recurringSnapshot ? `${note.id}-occ` : note.id}
        className={`notes-line-item notes-archive-scheduled${highlight ? ' notes-line-item--highlight' : ''}`}
      >
        <div className="notes-archive-scheduled__body">
          <p className="notes-archive-scheduled__title">{note.text}</p>
          {occurredAt && (
            <p className="notes-archive-scheduled__when muted">
              Last occurred · {format(occurredAt, 'EEE, MMM d · h:mm a')}
              {recurringSnapshot && note.recurrence ? ' · still active' : ''}
            </p>
          )}
        </div>
        {renderArchiveActions(note, { allowEdit: !recurringSnapshot })}
      </li>
    )
  }

  const renderAppointment = (note: BabyNote) => {
    const seriesStart = timestampToDate(note.scheduledAt)
    const displayAt = nextAppointmentOccurrence(note, now) ?? seriesStart
    const highlight = matchingNoteIds?.has(note.id) && searchLower.length > 0
    const isOpen = expandedApptIds.has(note.id)
    const detailLines = scheduledDetailLines(note, displayAt, seriesStart)

    return (
      <li
        key={note.id}
        className={`notes-line-item notes-appt-item${highlight ? ' notes-line-item--highlight' : ''}${isOpen ? ' notes-appt-item--open' : ''}`}
      >
        <button
          type="button"
          className="notes-appt-item__toggle"
          onClick={() => toggleApptExpand(note.id)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse appointment' : 'Expand appointment'}
        >
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="notes-appt-item__body">
          <button
            type="button"
            className="notes-appt-item__summary notes-item-btn"
            onClick={() => toggleApptExpand(note.id)}
          >
            <p className="notes-appt-item__title">{note.text}</p>
            {displayAt && (
              <p className="notes-appt-item__when">
                {format(displayAt, 'EEE, MMM d · h:mm a')}
              </p>
            )}
          </button>
          {isOpen && detailLines.length > 0 && (
            <div className="notes-appt-item__details-block">
              {detailLines.map((line) => (
                <p key={line} className="notes-appt-item__detail-line">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="notes-line-item__edit"
          onClick={() => openEdit(note)}
          disabled={busyId === note.id}
          aria-label="Edit appointment"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="notes-line-item__delete"
          onClick={(e) => void handleDelete(note, e)}
          disabled={busyId === note.id}
          aria-label="Delete appointment"
        >
          <Trash2 size={16} />
        </button>
      </li>
    )
  }

  const renderReminder = (note: BabyNote) => {
    const highlight = matchingNoteIds?.has(note.id) && searchLower.length > 0
    return (
      <li
        key={note.id}
        className={`notes-line-item notes-reminder-item${highlight ? ' notes-line-item--highlight' : ''}`}
      >
        <p className="notes-reminder-item__title">{note.text}</p>
        <button
          type="button"
          className="notes-line-item__edit"
          onClick={() => openEdit(note)}
          disabled={busyId === note.id}
          aria-label="Edit reminder"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="notes-line-item__delete"
          onClick={(e) => void handleDelete(note, e)}
          disabled={busyId === note.id}
          aria-label="Delete reminder"
        >
          <Trash2 size={16} />
        </button>
      </li>
    )
  }

  const renderTodo = (note: BabyNote, archived: boolean) => {
    const highlight = matchingNoteIds?.has(note.id) && searchLower.length > 0
    return (
      <li
        key={note.id}
        className={`notes-line-item notes-todo-item${highlight ? ' notes-line-item--highlight' : ''}`}
      >
        {!archived && (
          <ThemedCheckbox
            className="notes-todo-item__check"
            disabled={busyId === note.id}
            onChange={() => void handleCheck(note)}
            aria-label="Mark to-do done"
          />
        )}
        <button
          type="button"
          className="notes-todo-item__text notes-item-btn"
          onClick={() => openEdit(note)}
        >
          {note.text}
        </button>
        {!archived && (
          <button
            type="button"
            className="notes-line-item__edit"
            onClick={() => openEdit(note)}
            disabled={busyId === note.id}
            aria-label="Edit to-do"
          >
            <Pencil size={15} />
          </button>
        )}
        <button
          type="button"
          className="notes-line-item__delete"
          onClick={(e) => void handleDelete(note, e)}
          disabled={busyId === note.id}
          aria-label="Delete to-do"
        >
          <Trash2 size={16} />
        </button>
      </li>
    )
  }

  const renderGeneral = (note: BabyNote) => {
    const highlight = matchingNoteIds?.has(note.id) && searchLower.length > 0
    return (
      <li
        key={note.id}
        className={`notes-line-item notes-general-item${highlight ? ' notes-line-item--highlight' : ''}`}
      >
        <button
          type="button"
          className="notes-general-item__text notes-item-btn"
          onClick={() => openEdit(note)}
        >
          {note.text}
        </button>
        <button
          type="button"
          className="notes-line-item__edit"
          onClick={() => openEdit(note)}
          disabled={busyId === note.id}
          aria-label="Edit note"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="notes-line-item__archive"
          onClick={(e) => void handleArchive(note, e)}
          disabled={busyId === note.id}
          aria-label="Archive note"
        >
          <Archive size={15} />
        </button>
        <button
          type="button"
          className="notes-line-item__delete"
          onClick={(e) => void handleDelete(note, e)}
          disabled={busyId === note.id}
          aria-label="Delete note"
        >
          <Trash2 size={16} />
        </button>
      </li>
    )
  }

  const renderArchivedTodo = (note: BabyNote) => {
    const highlight = matchingNoteIds?.has(note.id) && searchLower.length > 0
    return (
      <li
        key={note.id}
        className={`notes-line-item notes-todo-item${highlight ? ' notes-line-item--highlight' : ''}`}
      >
        <span className="notes-todo-item__text notes-todo-item__text--archived">{note.text}</span>
        {renderArchiveActions(note, { allowEdit: true })}
      </li>
    )
  }

  const renderArchivedGeneral = (note: BabyNote) => {
    const highlight = matchingNoteIds?.has(note.id) && searchLower.length > 0
    return (
      <li
        key={note.id}
        className={`notes-line-item notes-general-item${highlight ? ' notes-line-item--highlight' : ''}`}
      >
        <span className="notes-general-item__text">{note.text}</span>
        {renderArchiveActions(note, { allowEdit: true })}
      </li>
    )
  }

  const panelForSubject = (subject: NoteSubject, showArchive: boolean) => {
    const personNotes = notesForPerson(notes, subject.id)

    if (showArchive) {
      const inWindow = (n: BabyNote) => noteInArchiveWindow(n, now, archiveDaysLoaded)
      const archivedAppts = sortArchiveScheduled(
        personNotes.filter(
          (n) => n.kind === 'appointment' && noteShowsInArchivePanel(n) && inWindow(n),
        ),
        now,
      )
      const archivedReminders = sortArchiveScheduled(
        personNotes.filter(
          (n) => n.kind === 'reminder' && noteShowsInArchivePanel(n) && inWindow(n),
        ),
        now,
      )
      const todosArchived = personNotes.filter(
        (n) => n.kind === 'todo' && n.archived && inWindow(n),
      )
      const generalArchived = personNotes.filter(
        (n) => n.kind === 'general' && n.archived && inWindow(n),
      )
      const archiveEmpty =
        archivedAppts.length === 0 &&
        archivedReminders.length === 0 &&
        todosArchived.length === 0 &&
        generalArchived.length === 0

      return (
        <div className="notes-panel-sections">
          {archiveEmpty && (
            <p className="muted notes-panel-empty">Nothing archived yet.</p>
          )}

          <NoteSection
            title="Appointments"
            icon={CalendarClock}
            variant="appointment"
            empty="No archived appointments"
            showEmpty={archivedAppts.length === 0}
          >
            <ul className="notes-line-list">
              {archivedAppts.map((n) => renderArchivedScheduled(n))}
            </ul>
          </NoteSection>

          <NoteSection
            title="Reminders"
            icon={AlarmClock}
            variant="reminder"
            empty="No archived reminders"
            showEmpty={archivedReminders.length === 0}
          >
            <ul className="notes-line-list">
              {archivedReminders.map((n) => renderArchivedScheduled(n))}
            </ul>
          </NoteSection>

          <NoteSection
            title="To-dos"
            icon={ClipboardList}
            variant="todo"
            empty="No archived to-dos"
            showEmpty={todosArchived.length === 0}
          >
            <ul className="notes-line-list notes-todo-list">
              {todosArchived.map((n) => renderArchivedTodo(n))}
            </ul>
          </NoteSection>

          <NoteSection
            title="Notes"
            icon={StickyNote}
            variant="general"
            empty="No archived notes"
            showEmpty={generalArchived.length === 0}
          >
            <ul className="notes-line-list notes-general-list">
              {generalArchived.map((n) => renderArchivedGeneral(n))}
            </ul>
          </NoteSection>

          <LoadMoreButton
            hasMore={archiveHasMore}
            loading={false}
            onLoadMore={loadMoreArchive}
            daysLoaded={archiveDaysLoaded}
          />
        </div>
      )
    }

    const appointments = personNotes.filter(
      (n) => n.kind === 'appointment' && !n.archived && hasUpcomingOccurrences(n, now),
    )
    const reminders = personNotes.filter(
      (n) => n.kind === 'reminder' && !n.archived && hasUpcomingOccurrences(n, now),
    )
    const upcoming = partitionScheduledUpcoming(appointments, now)
    const remindersUpcoming = partitionScheduledUpcoming(reminders, now)
    const todosActive = personNotes.filter((n) => n.kind === 'todo' && !n.archived)
    const general = personNotes.filter((n) => n.kind === 'general' && !n.archived)

    const emptyAll =
      upcoming.length === 0 &&
      remindersUpcoming.length === 0 &&
      todosActive.length === 0 &&
      general.length === 0

    return (
      <div className="notes-panel-sections">
        {emptyAll && (
          <p className="muted notes-panel-empty">Nothing here yet — tap + to add.</p>
        )}

        <NoteSection
          title="Appointments"
          icon={CalendarClock}
          variant="appointment"
          empty="No upcoming appointments"
          showEmpty={upcoming.length === 0}
        >
          <ul className="notes-line-list notes-appt-list">
            {upcoming.map((n) => renderAppointment(n))}
          </ul>
        </NoteSection>

        <NoteSection
          title="Reminders"
          icon={AlarmClock}
          variant="reminder"
          empty="No reminders"
          showEmpty={remindersUpcoming.length === 0}
        >
          <ul className="notes-line-list">
            {remindersUpcoming.map((n) => renderReminder(n))}
          </ul>
        </NoteSection>

        <NoteSection
          title="To-dos"
          icon={ClipboardList}
          variant="todo"
          empty="No open to-dos"
          showEmpty={todosActive.length === 0}
        >
          <ul className="notes-line-list notes-todo-list">
            {todosActive.map((n) => renderTodo(n, false))}
          </ul>
        </NoteSection>

        <NoteSection
          title="Notes"
          icon={StickyNote}
          variant="general"
          empty="No general notes"
          showEmpty={general.length === 0}
        >
          <ul className="notes-line-list notes-general-list">
            {general.map((n) => renderGeneral(n))}
          </ul>
        </NoteSection>
      </div>
    )
  }

  void watchRevision

  return (
    <>
      <div className="page notes-page">
        <header className="page__header">
          <h1>Notes</h1>
        </header>

        {searchLower && matchingNoteIds && (
          <div className="notes-search-results card">
            <p className="notes-search-results__title">Search matches</p>
            {notes
              .filter((n) => matchingNoteIds.has(n.id))
              .slice(0, 12)
              .map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="notes-search-hit"
                  onClick={() => openFromSearch(n)}
                >
                  <span className="notes-search-hit__name">
                    {subjectLabel(subjects, n.forPersonId)}
                  </span>
                  <span className="notes-search-hit__text">{n.text}</span>
                </button>
              ))}
            {matchingNoteIds.size === 0 && (
              <p className="muted">No notes match &ldquo;{search}&rdquo;</p>
            )}
          </div>
        )}

        <div className="notes-rows">
          {subjects.length === 0 && (
            <p className="muted" style={{ padding: '0 1rem' }}>
              Add babies or invite household members in Profile to start tracking notes.
            </p>
          )}
          {subjects.map((subject) => {
            const isOpen = expanded.has(subject.id)
            const showArchive = archiveView.has(subject.id)
            const hasArchive = notesForPerson(notes, subject.id).some((n) =>
              noteShowsInArchivePanel(n),
            )
            const watchEnabled = isAppointmentSubjectWatchEnabled(householdId, subject.id)

            return (
              <div
                key={subject.id}
                className={`notes-row${isOpen ? ' notes-row--open' : ''}${showArchive ? ' notes-row--archive' : ''}`}
              >
                <div className="notes-row__rail">
                  <button
                    type="button"
                    className={`notes-portrait-btn${isOpen ? ' notes-portrait-btn--open' : ''}`}
                    onClick={() => togglePerson(subject.id)}
                    aria-expanded={isOpen}
                    aria-label={`${subject.label}'s notes`}
                  >
                    <PersonPuck
                      subject={subject}
                      babies={babies}
                      members={members}
                      size="lg"
                    />
                  </button>
                  {isOpen && hasArchive && (
                    <button
                      type="button"
                      className={`notes-archive-btn soft-glow-control${showArchive ? ' soft-glow-control--on' : ''}`}
                      onClick={() => toggleArchiveView(subject.id)}
                      aria-label={
                        showArchive
                          ? `Back to ${subject.label}'s active notes`
                          : `${subject.label}'s archive`
                      }
                    >
                      <NotesArchiveIcon size={22} variant={showArchive ? 'todo' : 'archive'} />
                    </button>
                  )}
                </div>

                {isOpen && (
                  <NotesRowConnector
                    personName={subject.label}
                    showArchive={showArchive}
                    watchEnabled={watchEnabled}
                    onToggleWatch={() =>
                      setAppointmentSubjectWatchEnabled(
                        householdId,
                        subject.id,
                        !watchEnabled,
                      )
                    }
                  />
                )}

                <div className="notes-row__panel">
                  {isOpen && panelForSubject(subject, showArchive)}
                </div>
              </div>
            )
          })}
        </div>

        <div className="notes-search-bar">
          <input
            type="search"
            className="notes-search-input"
            placeholder="Search all notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search notes"
          />
        </div>
      </div>

      <button
        type="button"
        className="page-fab page-fab--notes soft-glow-control"
        onClick={openCreate}
        aria-label="Add note"
      >
        <IconPlusOverlay>
          <AddNoteIcon size={TRACKER_PLUS_ICON_SIZE} />
        </IconPlusOverlay>
      </button>

      {modalOpen && (
        <NoteFormModal
          key={editingNote?.id ?? 'create'}
          householdId={householdId}
          babies={babies}
          members={members}
          personNicknames={personNicknames}
          editing={editingNote}
          onClose={closeModal}
          onSaved={onRefresh}
        />
      )}
    </>
  )
}
