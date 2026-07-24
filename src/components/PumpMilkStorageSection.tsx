import { useState } from 'react'
import { FridgeIcon, IceCubeIcon } from './StorageIcons'
import { AddMilkBagsSheet } from './AddMilkBagsSheet'
import { MilkBagChip } from './MilkBagChip'
import { MilkBagSplitFields, useMilkBagSplitState } from './MilkBagSplitFields'
import { formatVolumeOz } from '../lib/feedingTypes'
import { fridgeLotsWithMilk } from '../lib/milkLotLabels'
import type { MilkLot, MilkStorage } from '../types'

export type PumpMilkStorageResult = {
  storage: MilkStorage
  bagVolumesOz: number[]
  addToLotId?: string | null
}

export function usePumpMilkStorageForm(totalOz: number) {
  const split = useMilkBagSplitState(totalOz)
  return { split }
}

interface PumpMilkStorageSectionProps {
  lots: MilkLot[]
  totalOz: number
  storage: MilkStorage
  onStorageChange: (storage: MilkStorage) => void
  mode: 'new' | 'existing'
  onModeChange: (mode: 'new' | 'existing') => void
  existingLotId: string | null
  onExistingLotIdChange: (lotId: string | null) => void
  split: ReturnType<typeof useMilkBagSplitState>
  disabled?: boolean
}

export function PumpMilkStorageSection({
  lots,
  totalOz,
  storage,
  onStorageChange,
  mode,
  onModeChange,
  existingLotId,
  onExistingLotIdChange,
  split,
  disabled,
}: PumpMilkStorageSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const fridgeLots = fridgeLotsWithMilk(lots)
  const existingLot = existingLotId ? lots.find((l) => l.id === existingLotId) : null

  return (
    <>
      <div className="pump-milk-storage__storage">
        <span className="field-label">Storage</span>
        <div className="storage-icon-toggle pump-milk-storage__icons" role="group">
          <button
            type="button"
            className={`storage-icon-btn storage-icon-btn--fridge${storage === 'fridge' ? ' storage-icon-btn--active' : ''}`}
            aria-label="Fridge"
            aria-pressed={storage === 'fridge'}
            onClick={() => onStorageChange('fridge')}
            disabled={disabled}
          >
            <FridgeIcon size={56} />
          </button>
          <button
            type="button"
            className={`storage-icon-btn storage-icon-btn--frozen${storage === 'frozen' ? ' storage-icon-btn--active' : ''}`}
            aria-label="Frozen"
            aria-pressed={storage === 'frozen'}
            onClick={() => onStorageChange('frozen')}
            disabled={disabled}
          >
            <IceCubeIcon size={56} />
          </button>
        </div>
      </div>

      {totalOz > 0 && (
        <section className="pump-milk-storage">
          <span className="field-label pump-milk-storage__heading">Bags</span>
          <div className="pump-milk-storage__mode" role="group" aria-label="Bag storage mode">
            <button
              type="button"
              className={`pump-milk-storage__mode-btn${mode === 'new' ? ' pump-milk-storage__mode-btn--active' : ''}`}
              aria-pressed={mode === 'new'}
              onClick={() => {
                onModeChange('new')
                onExistingLotIdChange(null)
              }}
              disabled={disabled}
            >
              New bag(s)
            </button>
            <button
              type="button"
              className={`pump-milk-storage__mode-btn${mode === 'existing' ? ' pump-milk-storage__mode-btn--active' : ''}`}
              aria-pressed={mode === 'existing'}
              onClick={() => {
                if (fridgeLots.length === 0) return
                onModeChange('existing')
                if (!existingLotId) setPickerOpen(true)
              }}
              disabled={disabled || fridgeLots.length === 0}
            >
              Add to bag
            </button>
          </div>

          {mode === 'existing' && existingLot && (
            <div className="pump-milk-storage__existing">
              <MilkBagChip lot={existingLot} variant="transfer" />
              <p className="muted pump-milk-storage__existing-hint">
                {formatVolumeOz(totalOz) || totalOz} oz will be added to this{' '}
                {formatVolumeOz(existingLot.remainingOz) || existingLot.remainingOz} oz bag.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn--compact"
                onClick={() => setPickerOpen(true)}
                disabled={disabled}
              >
                Choose different bag
              </button>
            </div>
          )}

          {mode === 'new' && (
            <div className="pump-milk-storage__split">
              <MilkBagSplitFields
                totalOz={totalOz}
                bagCount={split.bagCount}
                bagVolumes={split.bagVolumes}
                onBagCountChange={split.setBagCount}
                onBagVolumesChange={split.setBagVolumes}
                disabled={disabled}
              />
            </div>
          )}
        </section>
      )}

      {pickerOpen && (
        <AddMilkBagsSheet
          title="Add to existing bag"
          hint="Pick a fridge bag to top up with this milk."
          emptyMessage="No fridge bags available."
          availableLots={fridgeLots}
          onClose={() => setPickerOpen(false)}
          onAdd={(ids) => {
            if (ids[0]) {
              onModeChange('existing')
              onExistingLotIdChange(ids[0])
            }
          }}
        />
      )}
    </>
  )
}

export function buildPumpMilkStoragePayload(
  mode: 'new' | 'existing',
  storage: MilkStorage,
  totalOz: number,
  split: ReturnType<typeof useMilkBagSplitState>,
  existingLotId: string | null,
): PumpMilkStorageResult | null {
  if (totalOz <= 0) return null
  if (mode === 'existing' && existingLotId) {
    return {
      storage,
      bagVolumesOz: [totalOz],
      addToLotId: existingLotId,
    }
  }
  const volumes = split.parsedVolumes()
  if (!volumes) return null
  return { storage, bagVolumesOz: volumes, addToLotId: null }
}

export function isPumpMilkStorageValid(
  totalOz: number,
  mode: 'new' | 'existing',
  existingLotId: string | null,
  split: ReturnType<typeof useMilkBagSplitState>,
): boolean {
  if (totalOz <= 0) return false
  if (mode === 'existing') return !!existingLotId
  return split.validation.valid
}
