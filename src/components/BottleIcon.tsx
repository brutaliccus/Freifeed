import bottleSvg from '../assets/bottle.svg?raw'

interface BottleIconProps {
  size?: number
  className?: string
}

/** src/assets/bottle.svg */
export function BottleIcon({ size = 24, className = '' }: BottleIconProps) {
  const markup = bottleSvg
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace('<svg ', `<svg width="${size}" height="${size}" `)

  return (
    <span
      className={`bottle-icon ${className}`.trim()}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
