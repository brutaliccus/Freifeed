import { useState } from 'react'
import { MilkBagSplitFields, useMilkBagSplitState } from './MilkBagSplitFields'
import { formatVolumeOz } from '../lib/feedingTypes'
import type { MilkLot } from '../types'

interface RedistributeMilkSheetProps {
  lots: MilkLot[]
  onClose: () => void
  onConfirm: (bagVolumesOz: number[]) => Promise<void>
}

export function RedistributeMilkSheet({ lots, onClose, onConfirm }: RedistributeMilkSheetProps) {
  const totalOz = lots.reduce((sum, lot) => sum + lot.remainingOz, 0)
  const sourceCount = lots.length
  const split = useMilkBagSplitState(totalOz)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ozLabel = formatVolumeOz(totalOz) || String(totalOz)

  const handleConfirm = async () => {
    setError(null)
    const volumes = split.parsedVolumes()
    if (!volumes || !split.validation.valid) {
      setError(split.validation.message ?? 'Enter a volume for each bag')
      return
    }
    setSaving(true)
    try {
      await onConfirm(volumes)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not redistribute milk')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay transfer-freezer-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet transfer-freezer-sheet"
        role="dialog"
        aria-labelledby="redistribute-milk-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header transfer-freezer-sheet__header">
          <h2 id="redistribute-milk-title">Redistribute milk</h2>
        </header>

        <div className="transfer-freezer-sheet__scroll">
          <p className="transfer-freezer-sheet__hint muted">
            {sourceCount === 1
              ? `Split ${ozLabel} oz from this bag into smaller bags. Original bag will be replaced.`
              : `Split ${ozLabel} oz from ${sourceCount} selected bags into smaller bags. Selected bags will be replaced.`}
          </p>

          <MilkBagSplitFields
            totalOz={totalOz}
            bagCount={split.bagCount}
            bagVolumes={split.bagVolumes}
            onBagCountChange={split.setBagCount}
            onBagVolumesChange={split.setBagVolumes}
            onError={setError}
            disabled={saving}
          />

          {error && <p className="error-text">{error}</p>}
        </div>

        <footer className="modal__footer transfer-freezer-sheet__footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleConfirm()}
            disabled={saving || !split.validation.valid}
          >
            {saving ? 'Saving…' : 'Redistribute'}
          </button>
        </footer>
      </div>
    </div>
  )
}
