import { useMemo, useState } from 'react'
import {
  buildPumpMilkStoragePayload,
  isPumpMilkStorageValid,
  PumpMilkStorageSection,
  usePumpMilkStorageForm,
} from './PumpMilkStorageSection'
import { parseVolumeOzInput } from '../lib/feedingTypes'
import type { MilkLot, MilkStorage } from '../types'

export type PumpVolumeConfirm = {
  volume: number
  storage: MilkStorage
  milkBagVolumes?: number[]
  addToLotId?: string | null
}

interface PumpVolumePromptProps {
  milkLots: MilkLot[]
  initialVolume: string
  initialStorage: MilkStorage
  saving?: boolean
  onCancel: () => void
  onConfirm: (result: PumpVolumeConfirm) => Promise<void>
  onAddLater: () => Promise<void>
}

export function PumpVolumePrompt({
  milkLots,
  initialVolume,
  initialStorage,
  saving = false,
  onCancel,
  onConfirm,
  onAddLater,
}: PumpVolumePromptProps) {
  const [volume, setVolume] = useState(initialVolume)
  const [storage, setStorage] = useState<MilkStorage>(initialStorage)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [existingLotId, setExistingLotId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parsedVolume = useMemo(() => parseVolumeOzInput(volume), [volume])
  const { split } = usePumpMilkStorageForm(parsedVolume ?? 0)

  const handleConfirm = async () => {
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

    setBusy(true)
    setError(null)
    try {
      await onConfirm({
        volume: parsed,
        storage: payload.storage,
        milkBagVolumes: payload.addToLotId ? undefined : payload.bagVolumesOz,
        addToLotId: payload.addToLotId ?? null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save volume')
    } finally {
      setBusy(false)
    }
  }

  const handleAddLater = async () => {
    setBusy(true)
    setError(null)
    try {
      await onAddLater()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || saving

  return (
    <div
      className="modal-overlay pump-volume-prompt-overlay modal-overlay--above-drawer"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="sheet pump-volume-prompt"
        role="dialog"
        aria-labelledby="pump-volume-prompt-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="pump-volume-prompt-title">Add pumped volume</h2>
        </header>
        <p className="muted pump-volume-prompt__hint">
          Enter how many ounces you pumped, then choose how to store it in bags.
        </p>

        <label className="volume-field pump-volume-prompt__field">
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
            disabled={disabled}
          />
        </label>

        <PumpMilkStorageSection
          lots={milkLots}
          totalOz={parsedVolume ?? 0}
          storage={storage}
          onStorageChange={setStorage}
          mode={mode}
          onModeChange={setMode}
          existingLotId={existingLotId}
          onExistingLotIdChange={setExistingLotId}
          split={split}
          disabled={disabled}
        />

        {error && <p className="error-text">{error}</p>}

        <footer className="modal__footer pump-volume-prompt__footer">
          <button
            type="button"
            className="btn btn-ghost pump-volume-prompt__later"
            onClick={() => void handleAddLater()}
            disabled={disabled}
          >
            Add later
          </button>
          <button
            type="button"
            className="btn btn-primary btn--grow"
            onClick={() => void handleConfirm()}
            disabled={disabled}
          >
            {busy ? 'Saving…' : 'Save with volume'}
          </button>
        </footer>
      </div>
    </div>
  )
}
