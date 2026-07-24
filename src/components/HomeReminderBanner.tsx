import { useMemo } from 'react'
import { AlarmClock } from 'lucide-react'
import {
  formatReminderBannerLine,
  todayRemindersForHousehold,
  type TodayScheduledItem,
} from '../lib/homeNotes'
import type { BabyNote } from '../types'

interface HomeReminderBannerProps {
  notes: BabyNote[]
  onOpenNotes?: () => void
}

function BannerContent({ items }: { items: TodayScheduledItem[] }) {
  if (items.length === 1) {
    return <span className="home-reminder-banner__text">{formatReminderBannerLine(items[0]!)}</span>
  }

  const line = items.map((item) => formatReminderBannerLine(item)).join('   ·   ')

  return (
    <div className="home-reminder-banner__track" aria-hidden>
      <span className="home-reminder-banner__text">{line}</span>
      <span className="home-reminder-banner__text">{line}</span>
    </div>
  )
}

export function HomeReminderBanner({ notes, onOpenNotes }: HomeReminderBannerProps) {
  const items = useMemo(() => todayRemindersForHousehold(notes), [notes])

  if (items.length === 0) return null

  const scrolling = items.length > 1

  return (
    <button
      type="button"
      className={`home-reminder-banner${scrolling ? ' home-reminder-banner--scroll' : ''}`}
      onClick={onOpenNotes}
      aria-label="Today’s reminders — open notes"
    >
      <AlarmClock size={18} className="home-reminder-banner__icon" aria-hidden />
      <div className="home-reminder-banner__content">
        <BannerContent items={items} />
      </div>
    </button>
  )
}
