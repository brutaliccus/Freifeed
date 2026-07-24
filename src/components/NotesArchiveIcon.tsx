interface NotesArchiveIconProps {
  size?: number
  className?: string
  /** Archive tray when viewing active notes; todo list when viewing archive. */
  variant?: 'archive' | 'todo'
}

const TODO_PATH =
  'M3 1H1v18h18V1H3zm14 2v14H3V3h14zm4 18H5v2h18V5h-2v16zM15 5H5v2h10V5zM5 9h10v2H5V9zm7 4H5v2h7v-2z'

export function NotesArchiveIcon({
  size = 24,
  className = '',
  variant = 'archive',
}: NotesArchiveIconProps) {
  const cls = `notes-archive-icon ${className}`.trim()

  if (variant === 'todo') {
    return (
      <svg
        className={cls}
        width={size}
        height={size}
        viewBox="1 1 22 21"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path d={TODO_PATH} fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg
      className={cls}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="7.25 14.25,2.75 14.25,2.75 1.75,13.25 1.75,13.25 9.25" />
      <path d="m9.75 12.75 1.5 1.5 3-2.5m-8.5-4h4.5m-4.5 3h1.5m-1.5-6h4.5" />
    </svg>
  )
}
