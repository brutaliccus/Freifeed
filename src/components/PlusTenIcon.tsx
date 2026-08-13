interface PlusTenIconProps {
  size?: number
  className?: string
}

/** Circle-friendly "+10" glyph for quick 10-minute nursing log. */
export function PlusTenIcon({ size = 48, className = '' }: PlusTenIconProps) {
  const fontSize = Math.round(size * 0.52)
  return (
    <span
      className={`plus-ten-icon ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: '-0.06em',
        // Optical center: "+" makes plain middle look slightly right.
        transform: 'translateX(-1px)',
      }}
      aria-hidden
    >
      +10
    </span>
  )
}
