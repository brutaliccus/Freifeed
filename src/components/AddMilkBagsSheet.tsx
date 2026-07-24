import { useMemo, useState } from 'react'
import { formatVolumeOz } from '../lib/feedingTypes'
import { formatMilkLotOption } from '../lib/milkLotLabels'
import type { MilkLot } from '../types'

interface AddMilkBagsSheetProps {
  title: string
  hint: string
  emptyMessage: string
  availableLots: MilkLot[]
  onClose: () => void
  onAdd: (lotIds: string[]) => void
}

export function AddMilkBagsSheet({
  title,
  hint,
  emptyMessage,
  availableLots,
  onClose,
  onAdd,
}: AddMilkBagsSheetProps) {
  const [pickedIds, setPickedIds] = useState<string[]>([])

  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds])

  const toggle = (lotId: string) => {
    setPickedIds((prev) =>
      prev.includes(lotId) ? prev.filter((id) => id !== lotId) : [...prev, lotId],
    )
  }

  const handleAdd = () => {
    if (pickedIds.length === 0) return
    onAdd(pickedIds)
    onClose()
  }

  const titleId = 'add-milk-bags-title'

  return (
    <div className="modal-overlay add-fridge-bags-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet add-fridge-bags-sheet"
        role="dialog"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header add-fridge-bags-sheet__header">
          <h2 id={titleId}>{title}</h2>
        </header>

        <div className="add-fridge-bags-sheet__scroll">
          <p className="add-fridge-bags-sheet__hint muted">{hint}</p>

          {availableLots.length === 0 ? (
            <p className="muted milk-storage-page__empty">{emptyMessage}</p>
          ) : (
            <ul className="milk-lot-list add-fridge-bags-sheet__list">
              {availableLots.map((lot) => {
                const selected = pickedSet.has(lot.id)
                return (
                  <li key={lot.id}>
                    <button
                      type="button"
                      className={[
                        'milk-lot-card',
                        'add-fridge-bags-sheet__card',
                        selected ? 'add-fridge-bags-sheet__card--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => toggle(lot.id)}
                      aria-pressed={selected}
                    >
                      <div className="milk-lot-card__top">
                        <span className="milk-lot-card__date">{formatMilkLotOption(lot)}</span>
                        {selected && (
                          <span className="add-fridge-bags-sheet__selected-badge" aria-hidden>
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="milk-lot-card__volume-row">
                        <span className="milk-lot-card__volume">
                          {formatVolumeOz(lot.remainingOz)} / {formatVolumeOz(lot.volumeOz)} oz
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="modal__footer add-fridge-bags-sheet__footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAdd}
            disabled={pickedIds.length === 0}
          >
            Add {pickedIds.length > 0 ? `${pickedIds.length} bag${pickedIds.length === 1 ? '' : 's'}` : 'bags'}
          </button>
        </footer>
      </div>
    </div>
  )
}
