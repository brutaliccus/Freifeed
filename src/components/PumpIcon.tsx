import haakaaSvg from '../assets/haakaa.svg?raw'

interface PumpIconProps {
  size?: number
  className?: string
}

function haakaaDimensions(height: number): { width: number; height: number } {
  const match = haakaaSvg.match(/viewBox="[\d.+\-eE]+\s+[\d.+\-eE]+\s+([\d.+\-eE]+)\s+([\d.+\-eE]+)"/)
  const vbW = match ? Number(match[1]) : 610
  const vbH = match ? Number(match[2]) : 1377
  const width = Math.max(1, Math.round(height * (vbW / vbH)))
  return { width, height }
}

/** src/assets/haakaa.svg — `size` is rendered height (tall aspect ratio). */
export function PumpIcon({ size = 24, className = '' }: PumpIconProps) {
  const { width, height } = haakaaDimensions(size)
  const markup = haakaaSvg
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace('<svg ', `<svg width="${width}" height="${height}" `)

  return (
    <span
      className={`pump-icon ${className}`.trim()}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
