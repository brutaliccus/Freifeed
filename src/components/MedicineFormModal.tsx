import { useEffect, useMemo, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { PillIcon } from './PillIcon'
import { TimePickerField } from './TimePickerField'
import { createMedicine, updateMedicine, type MedicineInput } from '../lib/medicines'
import {
  DEFAULT_TIMES_BY_FREQUENCY,
  DOSAGE_UNITS,
  FREQUENCY_LABELS,
  composeDosage,
  customTimeToDate,
  expectedTimeCount,
  formatDoseTime,
  lastDoseOptions,
  parseDosageString,
  type DosageUnit,
  type LastDoseOption,
} from '../lib/medicineSchedule'
import { timestampToDate } from '../lib/time'
import { buildMedicineSubjects } from '../lib/medicineSubjects'
import type {
  Baby,
  HouseholdMember,
  Medicine,
  MedicineCategory,
  MedicineFrequency,
  MedicineFrequencyType,
} from '../types'

interface MedicineFormModalProps {
  householdId: string
  babies: Baby[]
  members: HouseholdMember[]
  personNicknames?: Record<string, string>
  defaultForPersonId: string
  medicine: Medicine | null
  onClose: () => void
  onSaved: () => void
}

const FREQ_OPTIONS: MedicineFrequencyType[] = [
  'daily',
  'twice_daily',
  'three_times_daily',
  'periodic',
]

interface FormState {
  forPersonId: string
  name: string
  category: MedicineCategory
  totalPills: string
  dosageAmount: string
  dosageUnit: DosageUnit
  durationDays: string
  indefinite: boolean
  freqType: MedicineFrequencyType
  times: string[]
  intervalHours: string
  lastDoseId: string
  /** HH:mm string used when `lastDoseId === 'custom'` (periodic only). */
  customTime: string
}

function initialFormState(medicine: Medicine | null, defaultForPersonId: string): FormState {
  if (!medicine) {
    return {
      forPersonId: defaultForPersonId,
      name: '',
      category: 'required',
      totalPills: '',
      dosageAmount: '',
      dosageUnit: 'mg',
      durationDays: '7',
      indefinite: false,
      freqType: 'daily',
      times: [...DEFAULT_TIMES_BY_FREQUENCY.daily],
      intervalHours: '4',
      lastDoseId: 'none',
      customTime: defaultCustomTime(),
    }
  }
  const { amount, unit } = parseDosageString(medicine.dosage)
  return {
    forPersonId: medicine.forPersonId,
    name: medicine.name,
    category: medicine.category,
    totalPills: String(medicine.totalPills ?? ''),
    dosageAmount: amount,
    dosageUnit: unit,
    durationDays: medicine.durationDays != null ? String(medicine.durationDays) : '7',
    indefinite: medicine.durationDays == null,
    freqType: medicine.frequency.type,
    times: medicine.frequency.times.length
      ? [...medicine.frequency.times]
      : [...DEFAULT_TIMES_BY_FREQUENCY[medicine.frequency.type]],
    intervalHours:
      medicine.frequency.intervalHours != null ? String(medicine.frequency.intervalHours) : '4',
    lastDoseId: 'unchanged',
    customTime: defaultCustomTime(),
  }
}

function defaultCustomTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function savedLastTakenLabel(medicine: Medicine): string {
  const at = timestampToDate(medicine.lastTakenAt)
  return at ? formatDoseTime(at) : 'Not yet taken.'
}

function lastTakenPreview(
  lastDoseId: string,
  lastDoseChoices: LastDoseOption[],
  customTime: string,
  medicine: Medicine | null,
): string {
  if (lastDoseId === 'unchanged' && medicine) {
    return savedLastTakenLabel(medicine)
  }
  if (lastDoseId === 'none') return 'Not yet taken.'
  if (lastDoseId === 'now') return 'Just now'
  if (lastDoseId === 'custom') {
    const at = customTimeToDate(customTime)
    return at ? formatDoseTime(at) : '—'
  }
  const match = lastDoseChoices.find((opt) => opt.id === lastDoseId)
  if (match) return match.label
  return medicine ? savedLastTakenLabel(medicine) : 'Not yet taken.'
}

export function MedicineFormModal({
  householdId,
  babies,
  members,
  personNicknames,
  defaultForPersonId,
  medicine,
  onClose,
  onSaved,
}: MedicineFormModalProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialFormState(medicine, defaultForPersonId),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Edit mode: full last-dose picker hidden until pencil is tapped. */
  const [lastDoseEditorOpen, setLastDoseEditorOpen] = useState(false)

  const editing = !!medicine
  const assignees = useMemo(
    () => buildMedicineSubjects(babies, members, personNicknames),
    [babies, members, personNicknames],
  )

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const setFreqType = (type: MedicineFrequencyType) => {
    setForm((prev) => {
      const next: FormState = { ...prev, freqType: type }
      if (type !== 'periodic') {
        const count = expectedTimeCount(type)
        const defaults = DEFAULT_TIMES_BY_FREQUENCY[type]
        const carry = prev.times.slice(0, count)
        while (carry.length < count) carry.push(defaults[carry.length])
        next.times = carry
      }
      return next
    })
  }

  const setTimeAt = (index: number, value: string) => {
    setForm((prev) => {
      const times = [...prev.times]
      times[index] = value
      return { ...prev, times }
    })
  }

  const slotLabels = useMemo<string[]>(() => {
    if (form.freqType === 'twice_daily') return ['Morning', 'Evening']
    if (form.freqType === 'three_times_daily') return ['Morning', 'Midday', 'Evening']
    if (form.freqType === 'daily') return ['Time']
    return []
  }, [form.freqType])

  const computedFrequency = useMemo<MedicineFrequency>(() => {
    if (form.freqType === 'periodic') {
      const hours = Number(form.intervalHours)
      return {
        type: 'periodic',
        times: [],
        intervalHours: Number.isFinite(hours) && hours > 0 ? hours : 0,
      }
    }
    return {
      type: form.freqType,
      times: form.times,
      intervalHours: null,
    }
  }, [form.freqType, form.intervalHours, form.times])

  const lastDoseChoices = useMemo<LastDoseOption[]>(
    () => lastDoseOptions(computedFrequency),
    [computedFrequency],
  )

  const showLastDosePicker = !editing || lastDoseEditorOpen
  const unchangedLabel = medicine
    ? `Unchanged (${savedLastTakenLabel(medicine)})`
    : 'Unchanged'

  const lastTakenSummary = useMemo(
    () => lastTakenPreview(form.lastDoseId, lastDoseChoices, form.customTime, medicine),
    [form.lastDoseId, form.customTime, lastDoseChoices, medicine],
  )

  useEffect(() => {
    if (editing) return
    const validIds = new Set([...lastDoseChoices.map((opt) => opt.id), 'custom'])
    if (!validIds.has(form.lastDoseId)) {
      setForm((prev) => ({ ...prev, lastDoseId: 'none' }))
    }
  }, [lastDoseChoices, editing, form.lastDoseId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Enter a medicine name')
      return
    }
    const totalPills = Number(form.totalPills)
    if (!Number.isFinite(totalPills) || totalPills < 0) {
      setError('Enter a valid pill count')
      return
    }

    let durationDays: number | null = null
    if (!form.indefinite) {
      const d = Number(form.durationDays)
      if (!Number.isFinite(d) || d <= 0) {
        setError('Enter how many days you take it (or mark indefinite)')
        return
      }
      durationDays = Math.round(d)
    }

    let frequency
    if (form.freqType === 'periodic') {
      const hours = Number(form.intervalHours)
      if (!Number.isFinite(hours) || hours <= 0) {
        setError('Enter hours between doses')
        return
      }
      frequency = {
        type: 'periodic' as const,
        times: [],
        intervalHours: Math.round(hours * 100) / 100,
      }
    } else {
      const count = expectedTimeCount(form.freqType)
      if (form.times.length !== count || form.times.some((t) => !/^\d{2}:\d{2}$/.test(t))) {
        setError('Pick a valid reminder time for each dose')
        return
      }
      frequency = {
        type: form.freqType,
        times: form.times,
        intervalHours: null,
      }
    }

    // Resolve last-taken from the picker. Default behavior:
    //  - "unchanged" → don't send `lastTakenAt` at all (preserve saved value)
    //  - "custom" (periodic) → use the typed time-of-day, snapped to the most recent past
    //  - everything else → use the matching option's `takenAt`
    let lastTakenSelection: { takenAt: Date | null } | null = null
    if (form.lastDoseId === 'unchanged') {
      lastTakenSelection = null
    } else if (form.lastDoseId === 'custom') {
      const at = customTimeToDate(form.customTime)
      if (!at) {
        setError('Pick a valid time for the last dose')
        return
      }
      lastTakenSelection = { takenAt: at }
    } else {
      const match = lastDoseChoices.find((opt) => opt.id === form.lastDoseId)
      lastTakenSelection = match ? { takenAt: match.takenAt } : { takenAt: null }
    }

    const dosage = composeDosage(form.dosageAmount, form.dosageUnit)

    const input: MedicineInput = {
      forPersonId: form.forPersonId,
      name: form.name.trim(),
      category: form.category,
      totalPills: Math.round(totalPills),
      dosage,
      durationDays,
      frequency,
      active: true,
    }

    setSaving(true)
    try {
      if (editing && medicine) {
        // Preserve the original start time when editing so duration math doesn't reset.
        const startedAt = timestampToDate(medicine.startedAt) ?? new Date()
        const payload: MedicineInput = { ...input, startedAt }
        if (lastTakenSelection) {
          payload.lastTakenAt = lastTakenSelection.takenAt
        }
        await updateMedicine(householdId, medicine.id, payload)
      } else {
        const lastTakenAt = lastTakenSelection?.takenAt ?? null
        await createMedicine(householdId, { ...input, startedAt: new Date(), lastTakenAt })
      }
      onSaved()
      onClose()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    setForm(initialFormState(medicine, defaultForPersonId))
    setLastDoseEditorOpen(false)
  }, [medicine, defaultForPersonId])

  return (
    <div className="modal-overlay medicine-modal-overlay" onClick={onClose} role="presentation">
      <form
        className="sheet medicine-modal"
        role="dialog"
        aria-labelledby="medicine-modal-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="modal__header medicine-modal__header">
          <h2 id="medicine-modal-title" className="medicine-modal__title">
            <PillIcon size={22} /> {editing ? 'Edit medicine' : 'Add medicine'}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="field-block medicine-modal__assignee">
          <span className="field-label">Who is this for?</span>
          <div className="medicine-modal__assignee-list" role="group" aria-label="Who is this medicine for">
            {assignees.map((person) => (
              <button
                key={person.id}
                type="button"
                className={`medicine-modal__assignee-btn${form.forPersonId === person.id ? ' medicine-modal__assignee-btn--active' : ''}`}
                aria-pressed={form.forPersonId === person.id}
                onClick={() => setField('forPersonId', person.id)}
                disabled={saving}
              >
                {person.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field-block">
          <span className="field-label">Medicine name</span>
          <input
            type="text"
            className="input"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g. Ibuprofen"
            autoFocus
            required
          />
        </label>

        <fieldset className="medicine-modal__category">
          <legend className="field-label">Schedule type</legend>
          <div className="medicine-modal__radial">
            <label
              className={`medicine-modal__freq-option${form.category === 'required' ? ' medicine-modal__freq-option--active' : ''}`}
            >
              <input
                type="radio"
                name="medicine-category"
                value="required"
                checked={form.category === 'required'}
                onChange={() => setField('category', 'required')}
              />
              <span>Required</span>
            </label>
            <label
              className={`medicine-modal__freq-option${form.category === 'as_needed' ? ' medicine-modal__freq-option--active' : ''}`}
            >
              <input
                type="radio"
                name="medicine-category"
                value="as_needed"
                checked={form.category === 'as_needed'}
                onChange={() => setField('category', 'as_needed')}
              />
              <span>As needed</span>
            </label>
          </div>
          <p className="muted medicine-modal__category-hint">
            Required medicines alert on a fixed schedule. As needed alerts once when you may take another dose
            (based on the minimum interval you set).
          </p>
        </fieldset>

        <div className="field-row">
          <label className="field-block">
            <span className="field-label"># of pills</span>
            <input
              type="number"
              className="input"
              min={0}
              step={1}
              inputMode="numeric"
              value={form.totalPills}
              onChange={(e) => setField('totalPills', e.target.value)}
              placeholder="30"
            />
          </label>
          <div className="field-block">
            <span className="field-label">Dosage</span>
            <div className="medicine-modal__dosage">
              <input
                type="number"
                className="input medicine-modal__dosage-amount"
                min={0}
                step="any"
                inputMode="decimal"
                value={form.dosageAmount}
                onChange={(e) => setField('dosageAmount', e.target.value)}
                placeholder="500"
              />
              <select
                className="input medicine-modal__dosage-unit"
                value={form.dosageUnit}
                onChange={(e) => setField('dosageUnit', e.target.value as DosageUnit)}
                aria-label="Dosage unit"
              >
                {DOSAGE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="field-row">
          <label className="field-block">
            <span className="field-label">Days to take</span>
            <input
              type="number"
              className="input"
              min={1}
              step={1}
              inputMode="numeric"
              value={form.durationDays}
              onChange={(e) => setField('durationDays', e.target.value)}
              disabled={form.indefinite}
              placeholder="7"
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.indefinite}
              onChange={(e) => setField('indefinite', e.target.checked)}
            />
            <span>Indefinitely</span>
          </label>
        </div>

        <fieldset className="medicine-modal__frequency">
          <legend className="field-label">Frequency</legend>
          <div className="medicine-modal__radial">
            {FREQ_OPTIONS.map((opt) => (
              <label key={opt} className={`medicine-modal__freq-option${form.freqType === opt ? ' medicine-modal__freq-option--active' : ''}`}>
                <input
                  type="radio"
                  name="frequency"
                  value={opt}
                  checked={form.freqType === opt}
                  onChange={() => setFreqType(opt)}
                />
                <span>{FREQUENCY_LABELS[opt]}</span>
              </label>
            ))}
          </div>

          {form.freqType !== 'periodic' && (
            <div className="medicine-modal__times">
              {form.times.map((value, i) => (
                <TimePickerField
                  key={i}
                  label={slotLabels[i] ?? 'Time'}
                  value={value}
                  onChange={(next) => setTimeAt(i, next)}
                  required
                />
              ))}
            </div>
          )}

          {form.freqType === 'periodic' && (
            <label className="field-block">
              <span className="field-label">Hours between doses</span>
              <input
                type="number"
                className="input"
                min={1}
                step={1}
                inputMode="numeric"
                value={form.intervalHours}
                onChange={(e) => setField('intervalHours', e.target.value)}
                placeholder="4"
              />
            </label>
          )}
        </fieldset>

        <fieldset className="medicine-modal__frequency medicine-modal__last-dose">
          <legend className="field-label">
            {editing ? 'Last taken' : 'When did you last take it?'}
          </legend>

          {editing && !showLastDosePicker ? (
            <div className="medicine-modal__last-dose-summary">
              <p className="medicine-modal__last-dose-value">{lastTakenSummary}</p>
              <button
                type="button"
                className="icon-btn medicine-modal__last-dose-edit"
                onClick={() => setLastDoseEditorOpen(true)}
                aria-label="Change last taken time"
              >
                <Pencil size={18} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="medicine-modal__last-dose-list">
              {editing && (
                <label
                  className={`medicine-modal__freq-option${form.lastDoseId === 'unchanged' ? ' medicine-modal__freq-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="last-dose"
                    value="unchanged"
                    checked={form.lastDoseId === 'unchanged'}
                    onChange={() => setField('lastDoseId', 'unchanged')}
                  />
                  <span>{unchangedLabel}</span>
                </label>
              )}
              {lastDoseChoices.map((opt) => (
                <label
                  key={opt.id}
                  className={`medicine-modal__freq-option${form.lastDoseId === opt.id ? ' medicine-modal__freq-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="last-dose"
                    value={opt.id}
                    checked={form.lastDoseId === opt.id}
                    onChange={() => setField('lastDoseId', opt.id)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}

              {form.freqType === 'periodic' && (
                <label
                  className={`medicine-modal__freq-option medicine-modal__freq-option--custom${form.lastDoseId === 'custom' ? ' medicine-modal__freq-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="last-dose"
                    value="custom"
                    checked={form.lastDoseId === 'custom'}
                    onChange={() => setField('lastDoseId', 'custom')}
                  />
                  <span>Pick a time</span>
                  {form.lastDoseId === 'custom' && (
                    <TimePickerField
                      label="Last dose time"
                      value={form.customTime}
                      onChange={(customTime) => {
                        setField('customTime', customTime)
                        setField('lastDoseId', 'custom')
                      }}
                    />
                  )}
                </label>
              )}

              {editing && (
                <button
                  type="button"
                  className="btn btn-ghost medicine-modal__last-dose-done"
                  onClick={() => setLastDoseEditorOpen(false)}
                >
                  Done
                </button>
              )}
            </div>
          )}
        </fieldset>

        {error && <p className="error-text">{error}</p>}

        <footer className="modal__footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn--grow" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add medicine'}
          </button>
        </footer>
      </form>
    </div>
  )
}
