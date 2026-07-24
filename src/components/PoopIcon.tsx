import poopSvg from '../assets/poop.svg?raw'

interface PoopIconProps {
  size?: number
  className?: string
}

/** SVG Repo poop — src/assets/poop.svg */
export function PoopIcon({ size = 24, className = '' }: PoopIconProps) {
  const markup = poopSvg
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace('<svg ', `<svg width="${size}" height="${size}" `)

  return (
    <span
      className={`poop-icon ${className}`.trim()}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
