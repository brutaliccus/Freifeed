import type { ReactNode } from 'react'
import { Home, CalendarDays } from 'lucide-react'
import { MilkBagIcon } from './MilkBagIcon'
import { DiaperIcon } from './DiaperIcon'
import { PillIcon } from './PillIcon'
import { AddNoteIcon } from './AddNoteIcon'
import { MeasurementsIcon } from './MeasurementsIcon'
import type { AppView, TrackerVisibility } from '../types'
import { DEFAULT_TRACKER_VISIBILITY } from '../types'

interface BottomNavProps {
  view: AppView
  onChange: (view: AppView) => void
  navTrackers?: TrackerVisibility
  hasBabies?: boolean
}

type LucideNavIcon = React.ComponentType<{ size?: number; strokeWidth?: number }>

type NavItem =
  | { view: AppView; label: string; kind: 'lucide'; Icon: LucideNavIcon; center?: boolean }
  | { view: AppView; label: string; kind: 'milkbag' }
  | { view: AppView; label: string; kind: 'diaper' }
  | { view: AppView; label: string; kind: 'pill' }
  | { view: AppView; label: string; kind: 'notes' }
  | { view: AppView; label: string; kind: 'measurements' }

function buildItems(nav: TrackerVisibility, hasBabies: boolean): NavItem[] {
  if (!hasBabies) {
    return [{ view: 'home', kind: 'lucide', Icon: Home, label: 'Home', center: true }]
  }
  const items: NavItem[] = []
  if (nav.notes) {
    items.push({ view: 'notes', kind: 'notes', label: 'Notes' })
  }
  if (nav.measurements) {
    items.push({ view: 'measurements', kind: 'measurements', label: 'Measurements' })
  }
  if (nav.nursing) {
    items.push({ view: 'daily', kind: 'lucide', Icon: CalendarDays, label: 'Timeline' })
  }
  items.push({ view: 'home', kind: 'lucide', Icon: Home, label: 'Home', center: true })
  if (nav.milk) {
    items.push({ view: 'milk', kind: 'milkbag', label: 'Milk' })
  }
  if (nav.diaper) {
    items.push({ view: 'diapers', kind: 'diaper', label: 'Diapers' })
  }
  if (nav.medicine) {
    items.push({ view: 'medicines', kind: 'pill', label: 'Medicine' })
  }
  return items
}

function renderIcon(item: NavItem, active: boolean): ReactNode {
  const isHome = item.kind === 'lucide' && item.center
  if (item.kind === 'milkbag') return <MilkBagIcon size={22} />
  if (item.kind === 'diaper') return <DiaperIcon size={22} />
  if (item.kind === 'pill') return <PillIcon size={22} />
  if (item.kind === 'notes') return <AddNoteIcon size={22} />
  if (item.kind === 'measurements') return <MeasurementsIcon size={22} />
  return <item.Icon size={isHome ? 26 : 22} strokeWidth={active ? 2.5 : 2} />
}

function NavButton({
  item,
  active,
  onChange,
}: {
  item: NavItem
  active: boolean
  onChange: (view: AppView) => void
}) {
  const isHome = item.kind === 'lucide' && item.center
  return (
    <button
      type="button"
      className={[
        'bottom-nav__btn',
        'soft-glow-control',
        isHome ? 'bottom-nav__btn--home' : '',
        item.kind === 'notes' ? 'bottom-nav__btn--notes' : '',
        item.kind === 'measurements' ? 'bottom-nav__btn--measurements' : '',
        active ? 'bottom-nav__btn--active soft-glow-control--on' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onChange(item.view)}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
    >
      {renderIcon(item, active)}
    </button>
  )
}

export function BottomNav({ view, onChange, navTrackers, hasBabies = true }: BottomNavProps) {
  const nav = navTrackers ?? DEFAULT_TRACKER_VISIBILITY
  const items = buildItems(nav, hasBabies)
  const activeView =
    view === 'weekly' ? 'daily' : view === 'diapers-weekly' ? 'diapers' : view

  const homeIndex = items.findIndex((i) => i.kind === 'lucide' && i.center)
  const leftItems = homeIndex > 0 ? items.slice(0, homeIndex) : []
  const homeItem = items[homeIndex]
  const rightItems = homeIndex >= 0 ? items.slice(homeIndex + 1) : []

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__track">
        <div className="bottom-nav__side bottom-nav__side--left">
          {leftItems.map((item) => (
            <NavButton
              key={item.view}
              item={item}
              active={activeView === item.view}
              onChange={onChange}
            />
          ))}
        </div>
        {homeItem && (
          <div className="bottom-nav__home-slot">
            <NavButton item={homeItem} active={activeView === homeItem.view} onChange={onChange} />
          </div>
        )}
        <div className="bottom-nav__side bottom-nav__side--right">
          {rightItems.map((item) => (
            <NavButton
              key={item.view}
              item={item}
              active={activeView === item.view}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}
