import redistributeSvg from '../assets/redistributebutton.svg?raw'

interface RedistributeIconProps {
  size?: number
  className?: string
}

/** src/assets/redistributebutton.svg */
export function RedistributeIcon({ size = 28, className = '' }: RedistributeIconProps) {
  const markup = redistributeSvg
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace('<svg ', `<svg width="${size}" height="${size}" `)

  return (
    <span
      className={`redistribute-icon ${className}`.trim()}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
