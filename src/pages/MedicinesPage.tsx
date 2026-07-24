import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, Infinity as InfinityIcon, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { PageFab } from '../components/PageFab'
import { MedicineFormModal } from '../components/MedicineFormModal'
import { MedicineSubjectTabs } from '../components/MedicineSubjectTabs'
import { PillIcon } from '../components/PillIcon'
import {
  buildMedicineSubjects,
  defaultMedicineForPersonId,
  isMedicineSubjectWatchEnabled,
  medicinesForSubject,
  readSubjectOrder,
  setMedicineSubjectWatchEnabled,
  sortSubjectsByOrder,
  subjectsWithMedicines,
  writeSubjectOrder,
  type MedicineForPersonId,
} from '../lib/medicineSubjects'
import { useCountdown } from '../hooks/useCountdown'
import { deleteMedicine, markMedicineTaken, setMedicineActive } from '../lib/medicines'
import {
  daysRemaining,
  describeFrequency,
  formatCountdownMs,
  formatDoseDueLabel,
  formatLastTakenAt,
  formatNextDose,
  formatNextDosePrefix,
  formatPillCount,
  formatTakenCountdownLabel,
  isDoseDue,
  isMedicineActiveNow,
  nextDueAtMs,
} from '../lib/medicineSchedule'
import type { Baby, HouseholdMember, Medicine, MedicineCategory } from '../types'

interface MedicinesPageProps {
  householdId: string
  medicines: Medicine[]
  babies: Baby[]
  members: HouseholdMember[]
  personNicknames: Record<string, string>
  loading: boolean
  onBack: () => void
  onRefresh: () => void
}

function groupMedicinesForSubject(list: Medicine[]) {
  const now = new Date()
  const requiredActive: Medicine[] = []
  const asNeededActive: Medicine[] = []
  const inactive: Medicine[] = []
  for (const m of list) {
      if (!isMedicineActiveNow(m, now)) {
        inactive.push(m)
        continue
      }
      if (m.category === 'as_needed') asNeededActive.push(m)
      else requiredActive.push(m)
    }
  return { requiredActive, asNeededActive, inactive }
}

export function MedicinesPage({
  householdId,
  medicines,
  babies,
  members,
  personNicknames,
  loading,
  onBack,
  onRefresh,
}: MedicinesPageProps) {
  const [editing, setEditing] = useState<Medicine | null>(null)
  const [adding, setAdding] = useState(false)
  const [activeSubjectId, setActiveSubjectId] = useState<MedicineForPersonId | null>(null)
  const [watchTick, setWatchTick] = useState(0)
  const [orderTick, setOrderTick] = useState(0)

  const allSubjects = useMemo(
    () => buildMedicineSubjects(babies, members, personNicknames),
    [babies, members, personNicknames],
  )
  const tabSubjects = useMemo(() => {
    const withMeds = subjectsWithMedicines(allSubjects, medicines)
    const order = readSubjectOrder(householdId)
    return sortSubjectsByOrder(withMeds, order)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orderTick refreshes local order
  }, [allSubjects, medicines, householdId, orderTick])

  useEffect(() => {
    if (tabSubjects.length === 0) {
      setActiveSubjectId(null)
      return
    }
    if (!activeSubjectId || !tabSubjects.some((s) => s.id === activeSubjectId)) {
      setActiveSubjectId(tabSubjects[0].id)
    }
  }, [tabSubjects, activeSubjectId])

  const subjectMedicines = useMemo(
    () => (activeSubjectId ? medicinesForSubject(medicines, activeSubjectId) : []),
    [medicines, activeSubjectId],
  )

  const { requiredActive, asNeededActive, inactive } = useMemo(
    () => groupMedicinesForSubject(subjectMedicines),
    [subjectMedicines],
  )

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of tabSubjects) {
      counts[s.id] = medicinesForSubject(medicines, s.id).filter((m) =>
        isMedicineActiveNow(m),
      ).length
    }
    return counts
  }, [tabSubjects, medicines])

  const watchEnabled = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const s of tabSubjects) {
      map[s.id] = isMedicineSubjectWatchEnabled(householdId, s.id)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- watchTick refreshes prefs
  }, [tabSubjects, householdId, watchTick])

  const handleDelete = async (medicine: Medicine) => {
    if (!window.confirm(`Delete "${medicine.name}"?`)) return
    await deleteMedicine(householdId, medicine.id)
    onRefresh()
  }

  const handleReactivate = async (medicine: Medicine) => {
    const restart = medicine.durationDays != null
    await setMedicineActive(householdId, medicine.id, true, restart)
    onRefresh()
  }

  const handleMarkTaken = async (medicine: Medicine) => {
    await markMedicineTaken(householdId, medicine.id, new Date())
    onRefresh()
  }

  const hasAny = medicines.length > 0

  const sectionHandlers = {
    onEdit: (m: Medicine) => setEditing(m),
    onDelete: (m: Medicine) => void handleDelete(m),
    onReactivate: (m: Medicine) => void handleReactivate(m),
    onMarkTaken: (m: Medicine) => void handleMarkTaken(m),
  }

  return (
    <div className="page medicines-page">
      <header className="page__header page__header--row milk-storage-page__header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <h1>Medicines</h1>
        <span className="milk-storage-page__spacer" aria-hidden />
      </header>

      {tabSubjects.length > 0 && activeSubjectId && (
        <MedicineSubjectTabs
          subjects={tabSubjects}
          activeId={activeSubjectId}
          counts={tabCounts}
          watchEnabled={watchEnabled}
          onSelect={setActiveSubjectId}
          onToggleWatch={(id) => {
            const next = !isMedicineSubjectWatchEnabled(householdId, id)
            setMedicineSubjectWatchEnabled(householdId, id, next)
            setWatchTick((n) => n + 1)
          }}
          onReorder={(orderedIds) => {
            writeSubjectOrder(householdId, orderedIds)
            setOrderTick((n) => n + 1)
          }}
        />
      )}

      {loading && !hasAny ? (
        <p className="muted milk-storage-page__empty">Loading…</p>
      ) : !hasAny ? (
        <p className="muted medicines-page__below-tabs">
          No medicines yet. Tap the + pill button to track one with reminders.
        </p>
      ) : !activeSubjectId ? (
        <p className="muted medicines-page__below-tabs">Select a person above.</p>
      ) : (
        <div
          className="medicines-page__panel"
          role="tabpanel"
          id={`medicine-subject-panel-${activeSubjectId.replace(/[^a-z0-9]+/gi, '-')}`}
          aria-labelledby={`medicine-subject-tab-${activeSubjectId.replace(/[^a-z0-9]+/gi, '-')}`}
        >
          {requiredActive.length > 0 && (
            <MedicineSection
              title="Required"
              medicines={requiredActive}
              category="required"
              {...sectionHandlers}
            />
          )}
          {asNeededActive.length > 0 && (
            <MedicineSection
              title="As needed"
              medicines={asNeededActive}
              category="as_needed"
              {...sectionHandlers}
            />
          )}
          {inactive.length > 0 && (
            <MedicineSection title="Inactive" medicines={inactive} inactive {...sectionHandlers} />
          )}
          {requiredActive.length === 0 &&
            asNeededActive.length === 0 &&
            inactive.length === 0 && (
              <p className="muted medicines-page__below-tabs">No medicines for this person.</p>
            )}
        </div>
      )}

      {(adding || editing) && (
        <MedicineFormModal
          householdId={householdId}
          babies={babies}
          members={members}
          personNicknames={personNicknames}
          defaultForPersonId={activeSubjectId ?? defaultMedicineForPersonId(babies)}
          medicine={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSaved={onRefresh}
        />
      )}

      <PageFab kind="medicine" label="Add medicine" onClick={() => setAdding(true)} />
    </div>
  )
}

interface MedicineSectionProps {
  title: string
  medicines: Medicine[]
  category?: MedicineCategory
  inactive?: boolean
  onEdit: (m: Medicine) => void
  onDelete: (m: Medicine) => void
  onReactivate: (m: Medicine) => void
  onMarkTaken: (m: Medicine) => void
}

function MedicineSection({
  title,
  medicines,
  inactive = false,
  onEdit,
  onDelete,
  onReactivate,
  onMarkTaken,
}: MedicineSectionProps) {
  return (
    <section className="medicines-section">
      <h2 className="medicines-section__title">{title}</h2>
      <ul className="medicine-card-list">
        {medicines.map((m) => (
          <MedicineCard
            key={m.id}
            medicine={m}
            inactive={inactive}
            showDueAlerts={!inactive}
            onEdit={() => onEdit(m)}
            onDelete={() => onDelete(m)}
            onReactivate={() => onReactivate(m)}
            onMarkTaken={() => onMarkTaken(m)}
          />
        ))}
      </ul>
    </section>
  )
}

interface MedicineCardProps {
  medicine: Medicine
  inactive?: boolean
  showDueAlerts?: boolean
  onEdit: () => void
  onDelete: () => void
  onReactivate: () => void
  onMarkTaken: () => void
}

function MedicineCard({
  medicine,
  inactive = false,
  showDueAlerts = true,
  onEdit,
  onDelete,
  onReactivate,
  onMarkTaken,
}: MedicineCardProps) {
  const remaining = daysRemaining(medicine)
  const indefinite = medicine.durationDays == null
  const nextDose = inactive ? '' : formatNextDose(medicine)
  const doseDue = showDueAlerts && !inactive && isDoseDue(medicine)
  const showTakenOverlay = showDueAlerts && !inactive && !doseDue && medicine.lastTakenAt != null

  const nextMs = showTakenOverlay ? nextDueAtMs(medicine) : null
  const countdownMs = useCountdown(nextMs)
  const lastTakenLabel = formatLastTakenAt(medicine)
  const countdownLabel =
    countdownMs != null ? formatCountdownMs(countdownMs) : nextMs != null ? 'Due now' : ''

  return (
    <li
      className={[
        'medicine-card',
        inactive ? 'medicine-card--inactive' : '',
        doseDue ? 'medicine-card--due' : '',
        showTakenOverlay ? 'medicine-card--taken' : '',
        medicine.category === 'as_needed' ? 'medicine-card--as-needed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="milk-lot-card__top medicine-card__top">
        <span className="milk-lot-card__date medicine-card__name">
          <PillIcon size={18} />
          {medicine.name || 'Medicine'}
        </span>
        <div className="milk-lot-card__actions">
          {inactive && (
            <button
              type="button"
              className="milk-lot-card__action-btn"
              onClick={onReactivate}
              aria-label="Reactivate"
              title="Reactivate"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button
            type="button"
            className="milk-lot-card__action-btn"
            onClick={onEdit}
            aria-label="Edit medicine"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="milk-lot-card__action-btn milk-lot-card__action-btn--delete"
            onClick={onDelete}
            aria-label="Delete medicine"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="medicine-card__row">
        <span className="medicine-card__dosage">
          {medicine.totalPills > 0 ? formatPillCount(medicine.totalPills) : medicine.dosage || '—'}
          {medicine.totalPills > 0 && medicine.dosage && (
            <>
              {' '}
              <span className="muted">({medicine.dosage})</span>
            </>
          )}
        </span>
        <span className="medicine-card__days-left" aria-label="Days remaining">
          {indefinite ? <InfinityIcon size={20} /> : <span>{remaining}d left</span>}
        </span>
      </div>

      <span className="muted medicine-card__schedule">{describeFrequency(medicine.frequency)}</span>
      {!inactive && nextDose && (
        <span className="muted medicine-card__next">
          {formatNextDosePrefix(medicine, doseDue)}
          {nextDose}
        </span>
      )}
      {!inactive && doseDue && !nextDose && (
        <span className="muted medicine-card__next">{formatDoseDueLabel(medicine)}</span>
      )}
      {inactive && !indefinite && (
        <span className="muted medicine-card__next">Duration finished — reactivate to resume reminders</span>
      )}

      {doseDue && (
        <button type="button" className="btn btn-primary medicine-card__taken-btn" onClick={onMarkTaken}>
          <Check size={16} aria-hidden /> I took it!
        </button>
      )}

      {showTakenOverlay && (
        <div className="medicine-card__taken-overlay">
          <div className="medicine-card__taken-actions">
            <button
              type="button"
              className="medicine-card__taken-action-btn"
              onClick={onEdit}
              aria-label="Edit medicine"
              title="Edit"
            >
              <Pencil size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="medicine-card__taken-action-btn medicine-card__taken-action-btn--delete"
              onClick={onDelete}
              aria-label="Delete medicine"
              title="Delete"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
          <p className="medicine-card__taken-name">{medicine.name}</p>
          <Check size={44} strokeWidth={3} className="medicine-card__taken-check" aria-hidden />
          <div className="medicine-card__taken-meta">
            {lastTakenLabel && (
              <p className="medicine-card__last-taken">Last taken at {lastTakenLabel}</p>
            )}
            {countdownLabel && (
              <p className="medicine-card__countdown">
                {formatTakenCountdownLabel(medicine)} {countdownLabel}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
