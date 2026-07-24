import { Minus } from 'lucide-react'
import { MilkBagIcon } from './MilkBagIcon'
import { formatVolumeOz } from '../lib/feedingTypes'
import { milkBagDisplay } from '../lib/milkBagFormat'
import type { MilkLot } from '../types'

interface MilkBagChipProps {
  lot: MilkLot
  selected?: boolean
  onRemove?: () => void
  onClick?: () => void
  /** aria-label for the chip button */
  label?: string
  /** Transfer modal: larger bag, oz on icon, date below, no time. */
  variant?: 'default' | 'transfer'
  /** Oz taken from this bag — shows as "used / total" on the transfer-style chip. */
  usedOz?: number | null
}

export function MilkBagChip({
  lot,
  selected,
  onRemove,
  onClick,
  label,
  variant = 'default',
  usedOz,
}: MilkBagChipProps) {
  const { date, time, oz } = milkBagDisplay(lot)
  const interactive = Boolean(onClick)
  const isTransfer = variant === 'transfer'

  const ozOnIcon =
    usedOz != null
      ? `${formatVolumeOz(usedOz) || usedOz} / ${oz}`
      : oz

  const ariaDefault = isTransfer
    ? `${ozOnIcon} oz, stored ${date}`
    : `${ozOnIcon} oz, stored ${date} at ${time}`

  return (
    <div
      className={[
        'milk-bag-chip',
        isTransfer ? 'milk-bag-chip--transfer' : '',
        selected ? 'milk-bag-chip--selected' : '',
        interactive ? 'milk-bag-chip--interactive' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="milk-bag-chip__body"
        onClick={onClick}
        disabled={!interactive}
        aria-label={label ?? ariaDefault}
        aria-pressed={selected}
      >
        {isTransfer ? (
          <>
            <span className="milk-bag-chip__visual" aria-hidden>
              <MilkBagIcon className="milk-bag-chip__icon" />
              <span className="milk-bag-chip__oz milk-bag-chip__oz--on-icon">{ozOnIcon} oz</span>
            </span>
            <span className="milk-bag-chip__date-below">{date}</span>
          </>
        ) : (
          <>
            <MilkBagIcon className="milk-bag-chip__icon" />
            <span className="milk-bag-chip__meta">
              <span className="milk-bag-chip__date">{date}</span>
              <span className="milk-bag-chip__time">{time}</span>
              <span className="milk-bag-chip__oz">{ozOnIcon} oz</span>
            </span>
          </>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          className="milk-bag-chip__remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label="Remove bag"
        >
          <Minus size={14} strokeWidth={3} aria-hidden />
        </button>
      )}
    </div>
  )
}
