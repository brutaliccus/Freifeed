import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { formatVolumeOz } from '../lib/feedingTypes'
import {
  applyBagSplitVolumeChange,
  isAutoLastBag,
  maxBagsForVolume,
  maxOzForBag,
  resolveBagSplitVolumes,
  validateBagSplit,
} from '../lib/bagSplitValidation'

interface MilkBagSplitFieldsProps {
  totalOz: number
  bagCount: string
  bagVolumes: string[]
  onBagCountChange: (raw: string) => void
  onBagVolumesChange: (volumes: string[]) => void
  onError?: (message: string | null) => void
  bagLabel?: string
  countLabel?: string
  disabled?: boolean
}

export function MilkBagSplitFields({
  totalOz,
  bagCount,
  bagVolumes,
  onBagCountChange,
  onBagVolumesChange,
  onError,
  bagLabel = 'Bag',
  countLabel = 'Number of bags',
  disabled,
}: MilkBagSplitFieldsProps) {
  const maxBags = maxBagsForVolume(totalOz)
  const count = Math.max(1, Math.min(maxBags, Math.floor(Number(bagCount) || 1)))
  const ozLabel = formatVolumeOz(totalOz) || String(totalOz)

  useEffect(() => {
    if (count === 1 && !bagVolumes[0]?.trim() && totalOz > 0) {
      onBagVolumesChange([formatVolumeOz(totalOz) || String(totalOz)])
    }
  }, [count, totalOz, bagVolumes, onBagVolumesChange])

  const validation = useMemo(
    () => validateBagSplit(totalOz, count, bagVolumes),
    [totalOz, count, bagVolumes],
  )

  const handleBagCountChange = (raw: string) => {
    onError?.(null)
    onBagCountChange(raw)
    const n = Math.floor(Number(raw) || 1)
    if (n > maxBags) {
      onError?.(`Max ${maxBags} bag(s) for ${ozLabel} oz`)
    }
  }

  const handleBagVolumeChange = (index: number, raw: string) => {
    onError?.(null)
    const { volumes, error: capError } = applyBagSplitVolumeChange(
      index,
      raw,
      bagVolumes,
      count,
      totalOz,
    )
    onBagVolumesChange(volumes)
    if (capError) onError?.(capError)
  }

  return (
    <>
      <label className="transfer-freezer-sheet__field">
        <span className="field-label">{countLabel}</span>
        <input
          type="number"
          className="input"
          min={1}
          max={maxBags}
          step={1}
          inputMode="numeric"
          value={bagCount}
          onChange={(e) => handleBagCountChange(e.target.value)}
          disabled={disabled}
        />
      </label>

      <div className="transfer-freezer-sheet__bags">
        {Array.from({ length: count }, (_, i) => {
          const autoLast = isAutoLastBag(i, count)
          const max = maxOzForBag(i, bagVolumes, count, totalOz)
          return (
            <label key={i} className="transfer-freezer-sheet__field">
              <span className="field-label">
                {bagLabel} {i + 1} (oz)
                {autoLast ? (
                  <span className="transfer-freezer-sheet__max muted"> · auto (remainder)</span>
                ) : (
                  max < totalOz && (
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
                disabled={disabled}
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

      {validation.message && <p className="error-text">{validation.message}</p>}
    </>
  )
}

export function useMilkBagSplitState(totalOz: number) {
  const [bagCount, setBagCount] = useState('1')
  const [bagVolumes, setBagVolumes] = useState<string[]>([''])

  const maxBags = maxBagsForVolume(totalOz)
  const count = Math.max(1, Math.min(maxBags, Math.floor(Number(bagCount) || 1)))

  useEffect(() => {
    setBagVolumes((prev) => {
      const next = Array.from({ length: count }, (_, i) => prev[i] ?? '')
      if (count === 1 && !next[0]?.trim() && totalOz > 0) {
        next[0] = formatVolumeOz(totalOz) || String(totalOz)
      }
      return next
    })
  }, [count, totalOz])

  const validation = useMemo(
    () => validateBagSplit(totalOz, count, bagVolumes),
    [totalOz, count, bagVolumes],
  )

  const parsedVolumes = (): number[] | null => {
    if (!validation.valid) return null
    return resolveBagSplitVolumes(totalOz, count, bagVolumes)
  }

  return {
    bagCount,
    setBagCount,
    bagVolumes,
    setBagVolumes,
    count,
    validation,
    parsedVolumes,
  }
}

export function MilkBagAddRow({
  onAddBag,
  onAddToExisting,
  disabled,
}: {
  onAddBag: () => void
  onAddToExisting: () => void
  disabled?: boolean
}) {
  return (
    <div className="pump-milk-storage__add-row">
      <button
        type="button"
        className="icon-btn pump-milk-storage__add-btn"
        onClick={onAddBag}
        disabled={disabled}
        aria-label="Add another bag"
      >
        <Plus size={20} aria-hidden />
      </button>
      <button
        type="button"
        className="btn btn-secondary pump-milk-storage__add-existing"
        onClick={onAddToExisting}
        disabled={disabled}
      >
        Add to existing bag
      </button>
    </div>
  )
}
