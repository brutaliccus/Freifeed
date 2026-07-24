import addNoteSvg from '../assets/addnote.svg?raw'

interface AddNoteIconProps {
  size?: number
  className?: string
}

export function AddNoteIcon({ size = 24, className = '' }: AddNoteIconProps) {
  const markup = addNoteSvg
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace('<svg ', `<svg width="${size}" height="${size}" `)

  return (
    <span
      className={`add-note-icon ${className}`.trim()}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
