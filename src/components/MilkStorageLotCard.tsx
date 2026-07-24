import { format } from 'date-fns'
import { Pencil, Trash2 } from 'lucide-react'
import { useLongPress } from '../hooks/useLongPress'
import { MilkExpirationTimer } from './MilkExpirationTimer'
import { FridgeIcon, IceCubeIcon } from './StorageIcons'
import { formatVolumeOz } from '../lib/feedingTypes'
import { timestampToDate } from '../lib/time'
import type { MilkLot } from '../types'

function isCardActionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, label'))
}

interface MilkStorageLotCardProps {
  lot: MilkLot
  combineMode: boolean
  combineSelected: boolean
  onLongPressSelect: () => void
  onToggleCombineSelect: () => void
  onTransfer: () => void
  onEdit: () => void
  onDelete: () => void
}

export function MilkStorageLotCard({
  lot,
  combineMode,
  combineSelected,
  onLongPressSelect,
  onToggleCombineSelect,
  onTransfer,
  onEdit,
  onDelete,
}: MilkStorageLotCardProps) {
  const longPress = useLongPress(onLongPressSelect, { disabled: lot.remainingOz <= 0 })

  const stored = timestampToDate(lot.storedAt)
  const pumped = timestampToDate(lot.pumpedAt)
  const isFridge = lot.storage === 'fridge'

  const handlePointerDown = (e: React.PointerEvent<HTMLLIElement>) => {
    if (isCardActionTarget(e.target)) return
    longPress.onPointerDown(e)
  }

  const handleClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if (isCardActionTarget(e.target)) return
    if (longPress.shouldSuppressClick()) return
    if (combineMode) onToggleCombineSelect()
  }

  return (
    <li
      className={`milk-lot-card${combineMode ? ' milk-lot-card--combine-selectable' : ''}${
        combineSelected ? ' milk-lot-card--combine-selected' : ''
      }`}
      onPointerDown={handlePointerDown}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
      onClick={handleClick}
      aria-pressed={combineMode ? combineSelected : undefined}
    >
      <div className="milk-lot-card__top">
        <div className="milk-lot-card__leading">
          <span className="milk-lot-card__date">
            {stored ? format(stored, 'EEE, MMM d') : '—'}
          </span>
          <div className="milk-lot-card__storage-row">
            <span
              className={`milk-lot-card__storage-icon milk-lot-card__storage-icon--${lot.storage}`}
              aria-label={isFridge ? 'Refrigerated' : 'Frozen'}
              title={isFridge ? 'Refrigerated' : 'Frozen'}
            >
              {isFridge ? <FridgeIcon size={28} /> : <IceCubeIcon size={28} />}
            </span>
            <MilkExpirationTimer lot={lot} />
          </div>
        </div>
        <div className="milk-lot-card__actions">
          <button
            type="button"
            className="milk-lot-card__action-btn milk-lot-card__action-btn--edit"
            onClick={onEdit}
            aria-label="Edit bag volumes"
          >
            <Pencil size={17} aria-hidden />
          </button>
          {isFridge ? (
            <button
              type="button"
              className="milk-lot-card__action-btn milk-lot-card__action-btn--transfer"
              onClick={onTransfer}
              aria-label="Move to freezer"
            >
              <IceCubeIcon size={20} />
            </button>
          ) : (
            <button
              type="button"
              className="milk-lot-card__action-btn milk-lot-card__action-btn--transfer"
              onClick={onTransfer}
              aria-label="Move to fridge"
            >
              <FridgeIcon size={20} />
            </button>
          )}
          <button
            type="button"
            className="milk-lot-card__action-btn milk-lot-card__action-btn--delete"
            onClick={onDelete}
            aria-label="Delete stored milk"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
      </div>
      <div className="milk-lot-card__volume-row">
        <span className="milk-lot-card__volume">
          {formatVolumeOz(lot.remainingOz)} / {formatVolumeOz(lot.volumeOz)} oz
        </span>
      </div>
      {pumped && (
        <span className="milk-lot-card__meta muted">Pumped {format(pumped, 'h:mm a')}</span>
      )}
      {lot.note && <span className="milk-lot-card__meta muted">{lot.note}</span>}
    </li>
  )
}
