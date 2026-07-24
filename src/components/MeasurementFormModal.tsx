import { useEffect, useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { BabyAvatar } from './BabyAvatar'
import { FeedDateButton } from './FeedDateButton'
import { TimePickerField } from './TimePickerField'
import {
  createMeasurement,
  deleteMeasurement,
  updateMeasurement,
  type MeasurementInput,
} from '../lib/measurements'
import {
  combineDateAndTime,
  dateToTimeInputValue,
  parseDayLocal,
  todayLocalDateString,
  timestampToDate,
} from '../lib/time'
import type { Baby, BabyId, Measurement } from '../types'
import { babyIdsFrom } from '../lib/babyUtils'
import { resolveBaby } from '../types'

interface MeasurementFormModalProps {
  householdId: string
  babies: Baby[]
  editing?: Measurement | null
  defaultBabyId?: BabyId
  onClose: () => void
  onSaved: () => void
}

export function MeasurementFormModal({
  householdId,
  babies,
  editing = null,
  defaultBabyId,
  onClose,
  onSaved,
}: MeasurementFormModalProps) {
  const babyIds = babyIdsFrom(babies)
  const openedAt = editing ? timestampToDate(editing.measuredAt) ?? new Date() : new Date()

  const [babyId, setBabyId] = useState<BabyId>(
    editing?.babyId ?? defaultBabyId ?? babyIds[0] ?? '',
  )
  const [dateStr, setDateStr] = useState(() => {
    const d = openedAt
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [timeStr, setTimeStr] = useState(() => dateToTimeInputValue(openedAt))
  const [weightLb, setWeightLb] = useState(
    editing?.weightLb != null ? String(editing.weightLb) : '',
  )
  const [weightOz, setWeightOz] = useState(
    editing?.weightOz != null ? String(editing.weightOz) : '',
  )
  const [lengthIn, setLengthIn] = useState(
    editing?.lengthIn != null ? String(editing.lengthIn) : '',
  )
  const [headCircIn, setHeadCircIn] = useState(
    editing?.headCircIn != null ? String(editing.headCircIn) : '',
  )
  const [note, setNote] = useState(editing?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!babyIds.includes(babyId) && babyIds[0]) setBabyId(babyIds[0])
  }, [babyId, babyIds])

  const buildInput = (): MeasurementInput | null => {
    const measuredAt = combineDateAndTime(parseDayLocal(dateStr || todayLocalDateString()), timeStr)
    if (!measuredAt) {
      setError('Pick a valid date and time')
      return null
    }
    const wLb = weightLb.trim() ? Number(weightLb) : null
    const wOz = weightOz.trim() ? Number(weightOz) : null
    const len = lengthIn.trim() ? Number(lengthIn) : null
    const head = headCircIn.trim() ? Number(headCircIn) : null
    if (wLb == null && wOz == null && len == null && head == null) {
      setError('Enter at least one measurement')
      return null
    }
    return {
      babyId,
      measuredAt,
      weightLb: wLb,
      weightOz: wOz,
      lengthIn: len,
      headCircIn: head,
      note: note.trim() || null,
    }
  }

  const handleSave = async () => {
    const input = buildInput()
    if (!input) return
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updateMeasurement(householdId, editing.id, input)
      } else {
        await createMeasurement(householdId, input)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    if (!window.confirm('Delete this measurement?')) return
    setSaving(true)
    try {
      await deleteMeasurement(householdId, editing.id)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="feed-drawer-backdrop" onClick={onClose} role="presentation" />
      <div
        className="feed-drawer feed-drawer--open feed-drawer--measurements"
        role="dialog"
        aria-labelledby="measurement-drawer-title"
      >
        <div className="feed-drawer__handle" aria-hidden />
        <header className="feed-drawer__header">
          <h2 id="measurement-drawer-title">{editing ? 'Edit measurement' : 'Add measurement'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <ChevronDown size={24} />
          </button>
        </header>

        <div className="feed-drawer__body">
          <div className="baby-picker-row">
            {babyIds.map((id) => {
              const baby = resolveBaby(babies, id)
              return (
                <BabyAvatar
                  key={id}
                  baby={baby}
                  size="lg"
                  showName
                  selected={babyId === id}
                  onClick={() => setBabyId(id)}
                />
              )
            })}
          </div>

          <div className="time-fields time-fields--inline-date">
            <TimePickerField label="Time" value={timeStr} onChange={setTimeStr} disabled={saving} />
            <FeedDateButton value={dateStr} onChange={setDateStr} disabled={saving} />
          </div>

          <div className="measurement-form-grid">
            <label className="field">
              <span className="field-label">Weight (lb)</span>
              <input
                type="number"
                className="input"
                inputMode="decimal"
                min={0}
                value={weightLb}
                onChange={(e) => setWeightLb(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="field">
              <span className="field-label">Weight (oz)</span>
              <input
                type="number"
                className="input"
                inputMode="decimal"
                min={0}
                max={15.9}
                step={0.1}
                value={weightOz}
                onChange={(e) => setWeightOz(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="field">
              <span className="field-label">Length / height (in)</span>
              <input
                type="number"
                className="input"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={lengthIn}
                onChange={(e) => setLengthIn(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="field">
              <span className="field-label">Head circ. (in)</span>
              <input
                type="number"
                className="input"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={headCircIn}
                onChange={(e) => setHeadCircIn(e.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <label className="note-field">
            <span className="field-label">Note (optional)</span>
            <input
              type="text"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              disabled={saving}
            />
          </label>

          {error && <p className="error-text">{error}</p>}
        </div>

        <footer className="modal__footer feed-drawer__footer">
          <button
            type="button"
            className="btn btn-primary btn--grow feed-drawer__save--measurements"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Log'}
          </button>
          {editing && (
            <button
              type="button"
              className="feed-discard-btn"
              onClick={() => void handleDelete()}
              disabled={saving}
              aria-label="Delete measurement"
            >
              <Trash2 size={18} aria-hidden />
            </button>
          )}
        </footer>
      </div>
    </>
  )
}
