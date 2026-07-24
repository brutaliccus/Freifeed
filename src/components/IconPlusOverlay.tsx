import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

/** Icon graphic size shared by page FABs and home quick-add + overlays. */
export const TRACKER_PLUS_ICON_SIZE = 51

/** Shared icon + bottom-right badge (page FABs and home quick-add buttons). */
export function IconPlusOverlay({ children }: { children: ReactNode }) {
  return (
    <span className="icon-plus-overlay" aria-hidden>
      {children}
      <span className="icon-plus-overlay__badge">
        <Plus strokeWidth={3} aria-hidden />
      </span>
    </span>
  )
}
