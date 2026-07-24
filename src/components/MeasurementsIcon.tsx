import measurementsSvg from '../assets/measurements.svg?raw'

interface MeasurementsIconProps {
  size?: number
  className?: string
}

export function MeasurementsIcon({ size = 24, className = '' }: MeasurementsIconProps) {
  const markup = measurementsSvg
    .replace(/fill="#0F0F0F"/gi, 'fill="currentColor"')
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace('<svg ', `<svg width="${size}" height="${size}" `)

  return (
    <span
      className={`measurements-icon ${className}`.trim()}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
