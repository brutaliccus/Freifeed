interface ThemedRadioProps {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  className?: string
  'aria-label'?: string
}

export function ThemedRadio({
  checked,
  disabled,
  onChange,
  className,
  'aria-label': ariaLabel,
}: ThemedRadioProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`themed-radio${checked ? ' themed-radio--checked' : ''}${className ? ` ${className}` : ''}`}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="themed-radio__ring" aria-hidden>
        <span className="themed-radio__dot" />
      </span>
    </button>
  )
}
