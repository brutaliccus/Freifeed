import { useMemo, useState } from 'react'
import { updateFeedingOptimistic } from '../lib/feedings'
import { parseVolumeOzInput } from '../lib/feedingTypes'
import { timestampToDate } from '../lib/time'
import {
  buildPumpMilkStoragePayload,
  isPumpMilkStorageValid,
  PumpMilkStorageSection,
  usePumpMilkStorageForm,
} from './PumpMilkStorageSection'
import type { Feeding, MilkLot } from '../types'

interface AddPumpVolumeSheetProps {
  householdId: string
  feeding: Feeding
  lots: MilkLot[]
  onClose: () => void
  onSaved: () => void
}

export function AddPumpVolumeSheet({
  householdId,
  feeding,
  lots,
  onClose,
  onSaved,
}: AddPumpVolumeSheetProps) {
  const [volume, setVolume] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [existingLotId, setExistingLotId] = useState<string | null>(null)
  const [storage, setStorage] = useState(feeding.milkStorage ?? 'fridge')
  const [error, setError] = useState<string | null>(null)

  const parsedVolume = useMemo(() => parseVolumeOzInput(volume), [volume])
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

    setError(null)
    updateFeedingOptimistic(
      householdId,
      feeding.id,
      {
        type: 'pump',
        babyId: feeding.babyId,
        side: feeding.side,
        startAt: timestampToDate(feeding.startAt),
        endAt: timestampToDate(feeding.endAt),
        volumeOz: parsed,
        milkStorage: payload.storage,
        storedAt: timestampToDate(feeding.storedAt) ?? timestampToDate(feeding.endAt),
        weightLb: feeding.weightLb,
        weightOz: feeding.weightOz,
        note: feeding.note,
        milkBagVolumes: payload.addToLotId ? undefined : payload.bagVolumesOz,
        addToLotId: payload.addToLotId ?? null,
      },
      { onOptimistic: () => {} },
    )
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay add-volume-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet add-volume-sheet pump-volume-prompt"
        role="dialog"
        aria-labelledby="add-volume-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="add-volume-title">Add pumped volume</h2>
        </header>
        <p className="muted pump-volume-prompt__hint">
          Enter how many ounces you pumped, then choose how to store it in bags.
        </p>

        <label className="volume-field pump-volume-prompt__field add-volume-sheet__field">
          <span className="field-label">Ounces pumped</span>
          <input
            type="number"
            className="input"
            min={0}
            step="any"
            inputMode="decimal"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="0.0"
            autoFocus
          />
        </label>

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

        {error && <p className="error-text">{error}</p>}

        <footer className="modal__footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn--grow" onClick={handleSave}>
            Save volume
          </button>
        </footer>
      </div>
    </div>
  )
}
