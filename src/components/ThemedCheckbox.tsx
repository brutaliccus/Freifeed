import { Check } from 'lucide-react'

interface ThemedCheckboxProps {
  checked?: boolean
  disabled?: boolean
  onChange: () => void
  className?: string
  'aria-label'?: string
}

export function ThemedCheckbox({
  checked = false,
  disabled,
  onChange,
  className,
  'aria-label': ariaLabel,
}: ThemedCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`themed-checkbox${checked ? ' themed-checkbox--checked' : ''}${className ? ` ${className}` : ''}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
    >
      <span className="themed-checkbox__box" aria-hidden>
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
    </button>
  )
}
