import { MilkBagIcon } from './MilkBagIcon'
import { DiaperIcon } from './DiaperIcon'
import { IconPlusOverlay, TRACKER_PLUS_ICON_SIZE } from './IconPlusOverlay'
import { PillIcon } from './PillIcon'

export type PageFabKind = 'milk' | 'medicine' | 'diaper'

interface PageFabProps {
  kind: PageFabKind
  label: string
  onClick: () => void
  hidden?: boolean
  className?: string
}

export function PageFab({ kind, label, onClick, hidden, className }: PageFabProps) {
  if (hidden) return null

  return (
    <button
      type="button"
      className={['page-fab', `page-fab--${kind}`, 'soft-glow-control', className].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={label}
    >
      <IconPlusOverlay>
        {kind === 'milk' ? (
          <MilkBagIcon size={TRACKER_PLUS_ICON_SIZE} />
        ) : kind === 'diaper' ? (
          <DiaperIcon size={TRACKER_PLUS_ICON_SIZE} />
        ) : (
          <PillIcon size={TRACKER_PLUS_ICON_SIZE} />
        )}
      </IconPlusOverlay>
    </button>
  )
}
