import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { AddMilkBagsSheet } from './AddMilkBagsSheet'
import { MilkBagChip } from './MilkBagChip'
import { formatVolumeOz, roundVolumeOz } from '../lib/feedingTypes'
import {
  applyBagSplitVolumeChange,
  isAutoLastBag,
  maxBagsForVolume,
  maxOzForBag,
  resolveBagSplitVolumes,
  validateBagSplit,
} from '../lib/bagSplitValidation'
import type { MilkLot } from '../types'

export type MilkTransferDirection = 'to-freezer' | 'to-fridge'

const CONFIG = {
  'to-freezer': {
    title: 'Transfer to freezer',
    hint: (oz: string) =>
      `Combine fridge bags, then split ${oz} oz into freezer bags. Each freezer bag becomes its own entry dated today.`,
    sourceFieldLabel: 'Fridge bags to freeze',
    addMoreLabel: 'Add more bags',
    targetCountLabel: 'Number of freezer bags',
    targetBagLabel: 'Freezer bag',
    confirmLabel: 'Freeze bags',
    emptySourceError: 'Select at least one fridge bag',
    transferError: 'Could not transfer to freezer',
    pickerTitle: 'Add fridge bags',
    pickerHint:
      'Tap bags from your milk log to include in this freeze. Selected bags show a highlight.',
    pickerEmpty: 'No more fridge bags available.',
  },
  'to-fridge': {
    title: 'Transfer to fridge',
    hint: (oz: string) =>
      `Combine frozen bags, then split ${oz} oz into fridge bags. Each fridge bag becomes its own entry dated today.`,
    sourceFieldLabel: 'Freezer bags to thaw',
    addMoreLabel: 'Add more bags',
    targetCountLabel: 'Number of fridge bags',
    targetBagLabel: 'Fridge bag',
    confirmLabel: 'Move to fridge',
    emptySourceError: 'Select at least one freezer bag',
    transferError: 'Could not transfer to fridge',
    pickerTitle: 'Add freezer bags',
    pickerHint:
      'Tap frozen bags from your milk log to include in this transfer. Selected bags show a highlight.',
    pickerEmpty: 'No more freezer bags available.',
  },
} as const

interface TransferMilkSheetProps {
  direction: MilkTransferDirection
  initialLot: MilkLot
  sourceLots: MilkLot[]
  onClose: () => void
  onConfirm: (lotIds: string[], bagVolumesOz: number[]) => void | Promise<void>
}

export function TransferMilkSheet({
  direction,
  initialLot,
  sourceLots,
  onClose,
  onConfirm,
}: TransferMilkSheetProps) {
  const cfg = CONFIG[direction]
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [initialLot.id])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [bagCount, setBagCount] = useState('1')
  const [bagVolumes, setBagVolumes] = useState<string[]>([''])
  const [error, setError] = useState<string | null>(null)

  const lotById = useMemo(() => new Map(sourceLots.map((l) => [l.id, l])), [sourceLots])

  const selectedLots = useMemo(
    () =>
      selectedIds
        .map((id) => lotById.get(id))
        .filter((l): l is MilkLot => l != null),
    [selectedIds, lotById],
  )

  const remainingOz = useMemo(
    () => roundVolumeOz(selectedLots.reduce((sum, l) => sum + l.remainingOz, 0)),
    [selectedLots],
  )

  const addableLots = useMemo(
    () => sourceLots.filter((l) => !selectedIds.includes(l.id)),
    [sourceLots, selectedIds],
  )

  const maxBags = maxBagsForVolume(remainingOz)
  const count = Math.max(1, Math.min(maxBags, Math.floor(Number(bagCount) || 1)))
  const ozLabel = formatVolumeOz(remainingOz) || String(remainingOz)

  useEffect(() => {
    setBagVolumes((prev) => {
      const next = Array.from({ length: count }, (_, i) => prev[i] ?? '')
      if (count === 1 && !next[0]?.trim() && remainingOz > 0) {
        next[0] = formatVolumeOz(remainingOz) || String(remainingOz)
      }
      return next
    })
  }, [count, remainingOz, selectedIds.join(',')])

  const validation = useMemo(
    () => validateBagSplit(remainingOz, count, bagVolumes),
    [remainingOz, count, bagVolumes],
  )

  const removeLot = (lotId: string) => {
    setError(null)
    setSelectedIds((prev) => (prev.length > 1 ? prev.filter((id) => id !== lotId) : prev))
  }

  const addLots = (ids: string[]) => {
    setError(null)
    setSelectedIds((prev) => [...new Set([...prev, ...ids])])
  }

  const handleBagCountChange = (raw: string) => {
    setError(null)
    setBagCount(raw)
    const n = Math.floor(Number(raw) || 1)
    if (n > maxBags) {
      setError(`Max ${maxBags} bag(s) for ${ozLabel} oz`)
    }
  }

  const handleBagVolumeChange = (index: number, raw: string) => {
    setError(null)
    const { volumes, error: capError } = applyBagSplitVolumeChange(
      index,
      raw,
      bagVolumes,
      count,
      remainingOz,
    )
    setBagVolumes(volumes)
    if (capError) setError(capError)
  }

  const handleConfirm = () => {
    setError(null)
    if (selectedLots.length === 0) {
      setError(cfg.emptySourceError)
      return
    }
    const parsed = resolveBagSplitVolumes(remainingOz, count, bagVolumes)
    if (!parsed) {
      const result = validateBagSplit(remainingOz, count, bagVolumes)
      setError(result.message ?? 'Enter a volume for each bag')
      return
    }

    try {
      void onConfirm(selectedIds, parsed)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : cfg.transferError)
    }
  }

  const displayError = error ?? validation.message
  const titleId = `transfer-milk-title-${direction}`

  return (
    <>
      <div className="modal-overlay transfer-freezer-overlay" onClick={onClose} role="presentation">
        <div
          className="sheet transfer-freezer-sheet"
          role="dialog"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="modal__header transfer-freezer-sheet__header">
            <h2 id={titleId}>{cfg.title}</h2>
          </header>

          <div className="transfer-freezer-sheet__scroll">
            <p className="transfer-freezer-sheet__hint muted">{cfg.hint(ozLabel)}</p>

            <section className="transfer-freezer-sheet__sources">
              <div className="transfer-freezer-sheet__sources-head">
                <span className="field-label">{cfg.sourceFieldLabel}</span>
                {addableLots.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary transfer-freezer-sheet__add-btn"
                    onClick={() => setPickerOpen(true)}
                  >
                    <Plus size={16} aria-hidden /> {cfg.addMoreLabel}
                  </button>
                )}
              </div>

              <div className="transfer-freezer-sheet__bag-grid" role="list">
                {selectedLots.map((lot) => (
                  <MilkBagChip
                    key={lot.id}
                    lot={lot}
                    variant="transfer"
                    onRemove={selectedIds.length > 1 ? () => removeLot(lot.id) : undefined}
                  />
                ))}
              </div>
            </section>

            <label className="transfer-freezer-sheet__field">
              <span className="field-label">{cfg.targetCountLabel}</span>
              <input
                type="number"
                className="input"
                min={1}
                max={maxBags}
                step={1}
                inputMode="numeric"
                value={bagCount}
                onChange={(e) => handleBagCountChange(e.target.value)}
              />
            </label>

            <div className="transfer-freezer-sheet__bags">
              {Array.from({ length: count }, (_, i) => {
                const autoLast = isAutoLastBag(i, count)
                const max = maxOzForBag(i, bagVolumes, count, remainingOz)
                return (
                  <label key={i} className="transfer-freezer-sheet__field">
                    <span className="field-label">
                      {cfg.targetBagLabel} {i + 1} (oz)
                      {autoLast ? (
                        <span className="transfer-freezer-sheet__max muted"> · auto (remainder)</span>
                      ) : (
                        max < remainingOz && (
                          <span className="transfer-freezer-sheet__max muted">
                            {' '}
                            · max {formatVolumeOz(max) || max}
                          </span>
                        )
                      )}
                    </span>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      max={autoLast ? undefined : max}
                      step="any"
                      inputMode="decimal"
                      value={bagVolumes[i] ?? ''}
                      onChange={(e) => handleBagVolumeChange(i, e.target.value)}
                      placeholder={autoLast ? 'Remainder' : '0.0'}
                      readOnly={autoLast}
                      aria-readonly={autoLast}
                    />
                  </label>
                )
              })}
            </div>

            <p
              className={`transfer-freezer-sheet__total${validation.valid ? '' : ' transfer-freezer-sheet__total--warn'}`}
            >
              Total: {formatVolumeOz(validation.totalOz) || '0'} / {ozLabel} oz
            </p>

            {displayError && <p className="error-text">{displayError}</p>}
          </div>

          <footer className="modal__footer transfer-freezer-sheet__footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={!validation.valid || selectedLots.length === 0}
            >
              {cfg.confirmLabel}
            </button>
          </footer>
        </div>
      </div>

      {pickerOpen && (
        <AddMilkBagsSheet
          title={cfg.pickerTitle}
          hint={cfg.pickerHint}
          emptyMessage={cfg.pickerEmpty}
          availableLots={addableLots}
          onClose={() => setPickerOpen(false)}
          onAdd={addLots}
        />
      )}
    </>
  )
}
