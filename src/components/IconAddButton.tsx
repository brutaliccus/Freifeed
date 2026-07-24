import { Plus } from 'lucide-react'
import { MilkBagIcon } from './MilkBagIcon'
import { DiaperIcon } from './DiaperIcon'
import { PillIcon } from './PillIcon'

type IconAddKind = 'milk' | 'medicine' | 'diaper'

interface IconAddButtonProps {
  kind: IconAddKind
  /** Accessible name (no visible label). */
  label: string
  onClick: () => void
  className?: string
}

export function IconAddButton({ kind, label, onClick, className }: IconAddButtonProps) {
  return (
    <button
      type="button"
      className={['icon-add-btn', 'btn', 'btn-primary', className].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={label}
    >
      <span className="icon-add-btn__graphic" aria-hidden>
        {kind === 'milk' ? (
          <MilkBagIcon size={28} />
        ) : kind === 'diaper' ? (
          <DiaperIcon size={28} />
        ) : (
          <PillIcon size={28} />
        )}
        <span className="icon-add-btn__plus">
          <Plus size={13} strokeWidth={3} />
        </span>
      </span>
    </button>
  )
}
