import umbrellaSvg from '../assets/umbrella.svg?raw'

interface WetIconProps {
  size?: number
  className?: string
}

/** SVG Repo umbrella — src/assets/umbrella.svg */
export function WetIcon({ size = 24, className = '' }: WetIconProps) {
  const markup = umbrellaSvg
    .replace(/<defs>[\s\S]*?<\/defs>/gi, '')
    .replace(
      /class="cls-1"/gi,
      'fill="none" stroke="currentColor" stroke-width="1.91" stroke-miterlimit="10"',
    )
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace('<svg ', `<svg width="${size}" height="${size}" `)

  return (
    <span
      className={`wet-icon ${className}`.trim()}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
