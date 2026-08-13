interface PlusTenIconProps {
  size?: number
  className?: string
}

/** Circle-friendly "+10" glyph for quick 10-minute nursing log. */
export function PlusTenIcon({ size = 48, className = '' }: PlusTenIconProps) {
  return (
    <svg
      className={`plus-ten-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <text
        x="32"
        y="38"
        textAnchor="middle"
        fill="currentColor"
        fontSize="22"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        letterSpacing="-0.5"
      >
        +10
      </text>
    </svg>
  )
}
