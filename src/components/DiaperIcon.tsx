import diaperSvg from '../assets/diaper.svg?raw'

interface DiaperIconProps {
  size?: number
  className?: string
}

/** Bold diaper silhouette — src/assets/diaper.svg */
export function DiaperIcon({ size = 24, className = '' }: DiaperIconProps) {
  const markup = diaperSvg
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace('<svg ', `<svg width="${size}" height="${size}" `)

  return (
    <span
      className={`diaper-icon ${className}`.trim()}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
