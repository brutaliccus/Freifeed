import { BreastIcon } from './BreastIcon'
import { BottleIcon } from './BottleIcon'
import { toggleSide, type SideToggle } from '../lib/sides'

interface SideTogglePickerProps {
  sides: SideToggle[]
  onChange: (sides: SideToggle[]) => void
  showBottle?: boolean
  bottleSelected?: boolean
  onBottleSelect?: () => void
  disabled?: boolean
}

export function SideTogglePicker({
  sides,
  onChange,
  showBottle,
  bottleSelected,
  onBottleSelect,
  disabled,
}: SideTogglePickerProps) {
  return (
    <div className="side-picker">
      <span className="field-label">{bottleSelected ? 'Feeding' : 'Side'}</span>
      <div className="side-picker__btns">
        <button
          type="button"
          disabled={disabled}
          className={`breast-circle-btn breast-circle-btn--modal breast-circle-btn--left side-toggle-btn${!bottleSelected && sides.includes('left') ? ' breast-circle-btn--active side-toggle-btn--active' : ''}`}
          onClick={() => onChange(toggleSide(sides, 'left'))}
          aria-label="Left side"
          aria-pressed={sides.includes('left')}
        >
          <BreastIcon variant="add" size={44} />
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`breast-circle-btn breast-circle-btn--modal breast-circle-btn--right side-toggle-btn${!bottleSelected && sides.includes('right') ? ' breast-circle-btn--active side-toggle-btn--active' : ''}`}
          onClick={() => onChange(toggleSide(sides, 'right'))}
          aria-label="Right side"
          aria-pressed={sides.includes('right')}
        >
          <BreastIcon variant="add" size={44} />
        </button>
        {showBottle && onBottleSelect && (
          <button
            type="button"
            disabled={disabled}
            className={`breast-circle-btn breast-circle-btn--modal feed-kind-btn feed-kind-btn--bottle side-toggle-btn${bottleSelected ? ' feed-kind-btn--active' : ''}`}
            onClick={onBottleSelect}
            aria-label="Bottle feeding"
            aria-pressed={!!bottleSelected}
          >
            <BottleIcon size={40} />
          </button>
        )}
      </div>
    </div>
  )
}
