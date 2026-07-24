import { PoopIcon } from './PoopIcon'
import { WetIcon } from './WetIcon'
import { toggleDiaperKind, type DiaperKindToggle } from '../lib/diaperKinds'

interface DiaperKindTogglePickerProps {
  kinds: DiaperKindToggle[]
  onChange: (kinds: DiaperKindToggle[]) => void
  disabled?: boolean
}

export function DiaperKindTogglePicker({ kinds, onChange, disabled }: DiaperKindTogglePickerProps) {
  return (
    <div className="side-picker">
      <span className="field-label">Type</span>
      <div className="side-picker__btns">
        <button
          type="button"
          disabled={disabled}
          className={`breast-circle-btn breast-circle-btn--modal diaper-kind-toggle-btn diaper-kind-toggle-btn--wet side-toggle-btn${kinds.includes('wet') ? ' breast-circle-btn--active side-toggle-btn--active' : ''}`}
          onClick={() => onChange(toggleDiaperKind(kinds, 'wet'))}
          aria-label="Wet"
          aria-pressed={kinds.includes('wet')}
        >
          <WetIcon size={44} />
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`breast-circle-btn breast-circle-btn--modal diaper-kind-toggle-btn diaper-kind-toggle-btn--poop side-toggle-btn${kinds.includes('poop') ? ' breast-circle-btn--active side-toggle-btn--active' : ''}`}
          onClick={() => onChange(toggleDiaperKind(kinds, 'poop'))}
          aria-label="Poop"
          aria-pressed={kinds.includes('poop')}
        >
          <PoopIcon size={44} />
        </button>
      </div>
    </div>
  )
}
