import { useMemo, useState } from 'react'
import { createFeedingOptimistic } from '../lib/feedings'
import { parseVolumeOzInput } from '../lib/feedingTypes'
import {
  combineDateAndTime,
  parseDayLocal,
  todayLocalDateString,
} from '../lib/time'
import { TimePickerField } from './TimePickerField'
import {
  buildPumpMilkStoragePayload,
  isPumpMilkStorageValid,
  PumpMilkStorageSection,
  usePumpMilkStorageForm,
} from './PumpMilkStorageSection'
import type { MilkLot } from '../types'

interface QuickAddMilkSheetProps {
  householdId: string
  lots: MilkLot[]
  pumpBabyId: string
  onClose: () => void
  onSaved: () => void
}

export function QuickAddMilkSheet({ householdId, lots, pumpBabyId, onClose, onSaved }: QuickAddMilkSheetProps) {
  const [volume, setVolume] = useState('')
  const [storedDate, setStoredDate] = useState(todayLocalDateString)
  const [storedTime, setStoredTime] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [existingLotId, setExistingLotId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parsedVolume = useMemo(() => parseVolumeOzInput(volume), [volume])
  const [storage, setStorage] = useState<'fridge' | 'frozen'>('fridge')
  const { split } = usePumpMilkStorageForm(parsedVolume ?? 0)

  const handleSave = () => {
    const parsed = parseVolumeOzInput(volume)
    if (parsed == null || parsed <= 0) {
      setError('Enter a volume greater than 0')
      return
    }
    if (!isPumpMilkStorageValid(parsed, mode, existingLotId, split)) {
      setError(mode === 'existing' ? 'Choose a bag to add to' : 'Enter a volume for each bag')
      return
    }
    const payload = buildPumpMilkStoragePayload(mode, storage, parsed, split, existingLotId)
    if (!payload) {
      setError('Check bag volumes')
      return
    }
    const storedAt = combineDateAndTime(parseDayLocal(storedDate), storedTime)
    if (!storedAt) {
      setError('Choose when this milk was stored')
      return
    }

    setError(null)
    createFeedingOptimistic(
      householdId,
      {
        type: 'pump',
        babyId: pumpBabyId,
        side: null,
        startAt: storedAt,
        endAt: storedAt,
        volumeOz: parsed,
        milkStorage: payload.storage,
        storedAt,
        weightLb: null,
        weightOz: null,
        note: note.trim() || null,
        milkBagVolumes: payload.addToLotId ? undefined : payload.bagVolumesOz,
        addToLotId: payload.addToLotId ?? null,
      },
      { onOptimistic: () => {} },
    )
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay quick-add-milk-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet quick-add-milk-sheet"
        role="dialog"
        aria-labelledby="quick-add-milk-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="quick-add-milk-title">Add milk to storage</h2>
          <p className="muted quick-add-milk-sheet__subtitle">
            Log milk you already pumped and bagged — no feed session required.
          </p>
        </header>

        <label className="quick-add-milk-sheet__volume-field">
          <span className="field-label">Ounces</span>
          <input
            type="number"
            className="input quick-add-milk-sheet__volume-input"
            min={0}
            step="any"
            inputMode="decimal"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="0.0"
            autoFocus
          />
        </label>

        <div className="quick-add-milk-sheet__when">
          <span className="field-label">Stored</span>
          <div className="quick-add-milk-sheet__datetime">
            <input
              type="date"
              className="input"
              value={storedDate}
              onChange={(e) => setStoredDate(e.target.value)}
            />
            <TimePickerField
              label="Time"
              showLabel={false}
              className="input quick-add-milk-sheet__time"
              value={storedTime}
              onChange={setStoredTime}
            />
          </div>
        </div>

        <PumpMilkStorageSection
          lots={lots}
          totalOz={parsedVolume ?? 0}
          storage={storage}
          onStorageChange={setStorage}
          mode={mode}
          onModeChange={setMode}
          existingLotId={existingLotId}
          onExistingLotIdChange={setExistingLotId}
          split={split}
        />

        <label className="field-block quick-add-milk-sheet__note">
          <span className="field-label">Note (optional)</span>
          <input
            type="text"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. morning pump"
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <footer className="modal__footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn--grow" onClick={handleSave}>
            Add to storage
          </button>
        </footer>
      </div>
    </div>
  )
}
