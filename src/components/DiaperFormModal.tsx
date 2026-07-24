import { useEffect, useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { BabyAvatar } from './BabyAvatar'
import { DiaperKindTogglePicker } from './DiaperKindTogglePicker'
import { FeedDateButton } from './FeedDateButton'
import { TimePickerField } from './TimePickerField'
import {
  createDiaper,
  deleteDiaper,
  updateDiaper,
  type DiaperInput,
} from '../lib/diapers'
import {
  diaperKindToToggles,
  togglesToDiaperKind,
  type DiaperKindToggle,
} from '../lib/diaperKinds'
import {
  combineDateAndTime,
  dateToTimeInputValue,
  parseDayLocal,
  todayLocalDateString,
  timestampToDate,
} from '../lib/time'
import type { Baby, BabyId, Diaper } from '../types'
import { babyIdsFrom } from '../lib/babyUtils'
import { resolveBaby } from '../types'

interface DiaperFormModalProps {
  householdId: string
  babies: Baby[]
  editing?: Diaper | null
  defaultBabyId?: BabyId
  onClose: () => void
  onSaved: () => void
}

export function DiaperFormModal({
  householdId,
  babies,
  editing = null,
  defaultBabyId,
  onClose,
  onSaved,
}: DiaperFormModalProps) {
  const babyIds = babyIdsFrom(babies)
  const openedAt = editing ? timestampToDate(editing.changedAt) ?? new Date() : new Date()

  const [babyId, setBabyId] = useState<BabyId>(
    editing?.babyId ?? defaultBabyId ?? babyIds[0] ?? '',
  )
  const [kindToggles, setKindToggles] = useState<DiaperKindToggle[]>(() =>
    diaperKindToToggles(editing?.kind ?? 'wet'),
  )
  const [dateStr, setDateStr] = useState(() => {
    const d = openedAt
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [timeStr, setTimeStr] = useState(() => dateToTimeInputValue(openedAt))
  const [note, setNote] = useState(editing?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!babyIds.includes(babyId) && babyIds[0]) setBabyId(babyIds[0])
  }, [babyId, babyIds])

  const buildInput = (): DiaperInput | null => {
    const kind = togglesToDiaperKind(kindToggles)
    if (!kind) {
      setError('Select wet and/or poop')
      return null
    }
    const changedAt = combineDateAndTime(parseDayLocal(dateStr || todayLocalDateString()), timeStr)
    if (!changedAt) {
      setError('Pick a valid date and time')
      return null
    }
    return {
      babyId,
      kind,
      changedAt,
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
        await updateDiaper(householdId, editing.id, input)
      } else {
        await createDiaper(householdId, input)
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
    if (!window.confirm('Delete this diaper entry?')) return
    setSaving(true)
    setError(null)
    try {
      await deleteDiaper(householdId, editing.id)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setSaving(false)
    }
  }

  const canSave = togglesToDiaperKind(kindToggles) != null

  return (
    <>
      <div className="feed-drawer-backdrop" onClick={onClose} role="presentation" />
      <div
        className="feed-drawer feed-drawer--open"
        role="dialog"
        aria-labelledby="diaper-drawer-title"
      >
        <div className="feed-drawer__handle" aria-hidden />
        <header className="feed-drawer__header">
          <h2 id="diaper-drawer-title">{editing ? 'Edit diaper' : 'Log diaper'}</h2>
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

          <DiaperKindTogglePicker
            kinds={kindToggles}
            onChange={setKindToggles}
            disabled={saving}
          />

          <div className="time-fields time-fields--inline-date">
            <TimePickerField
              label="Time"
              value={timeStr}
              onChange={setTimeStr}
              disabled={saving}
            />
            <FeedDateButton value={dateStr} onChange={setDateStr} disabled={saving} />
          </div>

          <label className="note-field">
            <span className="field-label">Note</span>
            <input
              type="text"
              className="input"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              disabled={saving}
            />
          </label>

          {error && <p className="error-text">{error}</p>}
        </div>

        <footer className="modal__footer feed-drawer__footer">
          <button
            type="button"
            className="btn btn-primary btn--grow"
            onClick={() => void handleSave()}
            disabled={saving || !canSave}
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Log'}
          </button>
          <button
            type="button"
            className="feed-discard-btn"
            onClick={() => (editing ? void handleDelete() : onClose())}
            disabled={saving}
            aria-label={editing ? 'Delete entry' : 'Discard'}
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </footer>
      </div>
    </>
  )
}
