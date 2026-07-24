interface BreastIconProps {
  /** Concentric-circle breast mark (same shape for add / L / R). */
  variant?: 'left' | 'right' | 'add' | 'neutral'
  size?: number
  className?: string
}

/**
 * Minimal breast mark: outer circle with a slightly smaller inner circle (nipple).
 */
export function BreastIcon({ variant = 'neutral', size = 24, className = '' }: BreastIconProps) {
  return (
    <svg
      className={`breast-icon breast-icon--${variant} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle className="breast-icon__outer" cx="16" cy="16" r="11" fill="currentColor" />
      <circle className="breast-icon__inner" cx="16" cy="16" r="6.25" fill="currentColor" />
      {variant === 'add' && (
        <path
          className="breast-icon__plus"
          d="M16 12.5v7M12.5 16h7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
