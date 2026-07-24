import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MilkBagChip } from './MilkBagChip'
import { formatVolumeOz } from '../lib/feedingTypes'
import {
  allocateBottleDeductions,
  deductionsMatchVolume,
  maxAvailableFromLots,
  suggestBottleBagIds,
  totalDeductionOz,
} from '../lib/milkBottleDeductions'
import { milkLotsForBottleDeduction } from '../lib/milkLotLabels'
import type { MilkDeduction, MilkLot } from '../types'

interface BottleMilkSourceSheetProps {
  lots: MilkLot[]
  volumeOz: number
  initialDeductions?: MilkDeduction[]
  onClose: () => void
  onConfirm: (deductions: MilkDeduction[]) => void
}

export function BottleMilkSourceSheet({
  lots,
  volumeOz,
  initialDeductions,
  onClose,
  onConfirm,
}: BottleMilkSourceSheetProps) {
  const options = useMemo(() => milkLotsForBottleDeduction(lots), [lots])
  const initialSelected = useMemo(() => {
    if (initialDeductions?.length) return initialDeductions.map((d) => d.lotId)
    return suggestBottleBagIds(lots, volumeOz)
  }, [initialDeductions, lots, volumeOz])

  const [pickedIds, setPickedIds] = useState<string[]>(initialSelected)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPickedIds(initialSelected)
    setError(null)
  }, [initialSelected, volumeOz])

  const volumeLabel = formatVolumeOz(volumeOz) || String(volumeOz)

  const allocation = useMemo(
    () => allocateBottleDeductions(lots, pickedIds, volumeOz),
    [lots, pickedIds, volumeOz],
  )
  const allocOzByLot = useMemo(
    () => new Map(allocation.map((d) => [d.lotId, d.amountOz])),
    [allocation],
  )
  const allocatedTotal = totalDeductionOz(allocation)
  const availableTotal = maxAvailableFromLots(lots, pickedIds)
  const matches = deductionsMatchVolume(allocation, volumeOz)
  const canConfirm = pickedIds.length > 0 && availableTotal + 0.01 >= volumeOz && matches

  const toggle = (lotId: string) => {
    setError(null)
    setPickedIds((prev) =>
      prev.includes(lotId) ? prev.filter((id) => id !== lotId) : [...prev, lotId],
    )
  }

  const handleConfirm = () => {
    setError(null)
    if (pickedIds.length === 0) {
      setError('Select at least one bag from storage')
      return
    }
    if (availableTotal + 0.01 < volumeOz) {
      setError(
        `Selected bags only have ${formatVolumeOz(availableTotal) || availableTotal} oz — pick more bags or lower the amount given`,
      )
      return
    }
    if (!matches || allocation.length === 0) {
      setError('Could not allocate the full amount from the selected bags')
      return
    }
    onConfirm(allocation)
  }

  const sheet = (
    <div
      className="modal-overlay bottle-source-overlay modal-overlay--above-drawer"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sheet bottle-source-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bottle-source-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header bottle-source-sheet__header">
          <h2 id="bottle-source-title">Milk from storage</h2>
        </header>

        <div className="bottle-source-sheet__scroll">
          <p className="bottle-source-sheet__hint muted">
            You logged {volumeLabel} oz. Tap the bag(s) you took it from (oldest fridge milk is
            used first).
          </p>

          {options.length === 0 ? (
            <p className="error-text">
              No stored milk with volume left. Add milk from the Milk tab first.
            </p>
          ) : (
            <div
              className="transfer-freezer-sheet__bag-grid bottle-source-sheet__bag-grid"
              role="listbox"
              aria-label="Stored milk bags"
              aria-multiselectable="true"
            >
              {options.map((lot) => {
                const selected = pickedIds.includes(lot.id)
                const takenOz = allocOzByLot.get(lot.id)
                const insufficientAlone = lot.remainingOz + 0.01 < volumeOz
                return (
                  <MilkBagChip
                    key={lot.id}
                    lot={lot}
                    variant="transfer"
                    selected={selected}
                    usedOz={selected ? takenOz : undefined}
                    onClick={() => toggle(lot.id)}
                    label={
                      insufficientAlone && !selected
                        ? `${lot.remainingOz} oz in bag — combine with another bag for ${volumeLabel} oz`
                        : undefined
                    }
                  />
                )
              })}
            </div>
          )}

          {pickedIds.length > 0 && (
            <p
              className={`bottle-source-sheet__total muted${matches ? '' : ' bottle-source-sheet__total--warn'}`}
              aria-live="polite"
            >
              Using{' '}
              <strong className="bottle-source-sheet__total-strong">
                {formatVolumeOz(allocatedTotal) || allocatedTotal}
              </strong>{' '}
              / {volumeLabel} oz from {allocation.length} bag
              {allocation.length === 1 ? '' : 's'}
            </p>
          )}

          {error && <p className="error-text">{error}</p>}
        </div>

        <footer className="modal__footer bottle-source-sheet__footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={options.length === 0 || !canConfirm}
          >
            Use selected bags
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(sheet, document.body)
}
