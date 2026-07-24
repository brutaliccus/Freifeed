import { useMemo, useState, Fragment } from 'react'
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { diaperInDay } from '../lib/time'
import { TimelineViewFab } from '../components/TimelineViewFab'
import { LoadMoreButton } from '../components/LoadMoreButton'
import type { Baby, BabyId, Diaper, DiaperKind } from '../types'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface DiaperWeeklyPageProps {
  babies: Baby[]
  diapers: Diaper[]
  onDaySelect: (date: Date) => void
  onBack: () => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  daysLoaded?: number
}

type CountMode = 'week' | 'month'

function countByKind(diapers: Diaper[], babyId: BabyId, day: Date, kind: DiaperKind): number {
  return diapers.filter((d) => d.babyId === babyId && d.kind === kind && diaperInDay(d, day)).length
}

function countTotal(diapers: Diaper[], babyId: BabyId, day: Date): number {
  return diapers.filter((d) => d.babyId === babyId && diaperInDay(d, day)).length
}

export function DiaperWeeklyPage({
  babies,
  diapers,
  onDaySelect,
  onBack,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  daysLoaded = 30,
}: DiaperWeeklyPageProps) {
  const [countMode, setCountMode] = useState<CountMode>('week')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()))

  const loadedSince = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - daysLoaded)
    d.setHours(0, 0, 0, 0)
    return d
  }, [daysLoaded])

  const viewNeedsOlder =
    countMode === 'week' ? weekStart < loadedSince : monthStart < loadedSince

  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
  const thisMonthStart = startOfMonth(new Date())
  const isThisWeek = isSameDay(weekStart, thisWeekStart)
  const isThisMonth = isSameMonth(monthStart, thisMonthStart)

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 })
  const monthEnd = endOfMonth(monthStart)

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  )

  const calendarDays = useMemo(() => {
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [monthStart, monthEnd])

  const babyRows = useMemo(
    () =>
      babies.map((b, idx) => ({ id: b.id, name: b.name || 'Baby', idx })),
    [babies],
  )

  const title =
    countMode === 'week'
      ? isThisWeek
        ? 'This week'
        : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`
      : isThisMonth
        ? 'This month'
        : format(monthStart, 'MMMM yyyy')

  const showToday = countMode === 'week' ? !isThisWeek : !isThisMonth

  const goToday = () => {
    if (countMode === 'week') setWeekStart(thisWeekStart)
    else setMonthStart(thisMonthStart)
  }

  const goPrev = () => {
    if (countMode === 'week') setWeekStart((w) => addWeeks(w, -1))
    else setMonthStart((m) => addMonths(m, -1))
  }

  const goNext = () => {
    if (countMode === 'week') setWeekStart((w) => addWeeks(w, 1))
    else setMonthStart((m) => addMonths(m, 1))
  }

  const rangeLabel =
    countMode === 'week'
      ? `${format(weekStart, 'MMMM d')} through ${format(weekEnd, 'MMMM d, yyyy')}`
      : format(monthStart, 'MMMM yyyy')

  return (
    <div className="page weekly-page diaper-weekly-page">
      <header className="page__header page__header--row weekly-page__header">
        <span className="weekly-page__header-spacer" aria-hidden />
        <div className="weekly-page__title-wrap">
          <h1>{title}</h1>
          <div className="weekly-page__mode" role="group" aria-label="View range">
            <button
              type="button"
              className={`weekly-page__mode-btn${countMode === 'week' ? ' weekly-page__mode-btn--active' : ''}`}
              onClick={() => setCountMode('week')}
              aria-pressed={countMode === 'week'}
            >
              Week
            </button>
            <button
              type="button"
              className={`weekly-page__mode-btn${countMode === 'month' ? ' weekly-page__mode-btn--active' : ''}`}
              onClick={() => setCountMode('month')}
              aria-pressed={countMode === 'month'}
            >
              Month
            </button>
          </div>
          {showToday && (
            <button type="button" className="btn btn-ghost btn--compact weekly-page__today" onClick={goToday}>
              Today
            </button>
          )}
        </div>
        <div className="weekly-page__week-nav">
          <button type="button" className="icon-btn" onClick={goPrev} aria-label="Previous">
            <ChevronLeft size={22} />
          </button>
          <button type="button" className="icon-btn" onClick={goNext} aria-label="Next">
            <ChevronRight size={22} />
          </button>
        </div>
      </header>

      {viewNeedsOlder && (
        <LoadMoreButton
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={() => onLoadMore?.()}
          daysLoaded={daysLoaded}
        />
      )}

      <section className="week-card" aria-labelledby="diaper-range-label">
        <h2 id="diaper-range-label" className="visually-hidden">
          {rangeLabel}
        </h2>

        {countMode === 'week' ? (
          <div className="week-grid diaper-week-grid">
            <div className="week-grid__corner" />
            {weekDays.map((d) => (
              <div key={d.toISOString()} className="week-grid__day-head">
                {format(d, 'EEE')}
                <span className="week-grid__date">{format(d, 'd')}</span>
              </div>
            ))}
            {babyRows.map((baby) => (
              <Fragment key={baby.id}>
                <div className="week-grid__baby-label">{baby.name}</div>
                {weekDays.map((d) => {
                  const wet = countByKind(diapers, baby.id, d, 'wet')
                  const poop = countByKind(diapers, baby.id, d, 'poop')
                  const both = countByKind(diapers, baby.id, d, 'both')
                  const wetTotal = wet + both
                  const poopTotal = poop + both
                  const hasAny = wetTotal + poopTotal > 0
                  const isTodayCell = isSameDay(d, new Date())
                  return (
                    <button
                      key={`${baby.id}-${d.toISOString()}`}
                      type="button"
                      className={`week-cell diaper-week-cell ${hasAny ? 'week-cell--has' : ''} ${isTodayCell ? 'week-cell--today' : ''}`}
                      onClick={() => onDaySelect(d)}
                      aria-label={`${baby.name}, ${format(d, 'MMMM d')}: ${wetTotal} wet, ${poopTotal} poop`}
                    >
                      {hasAny ? (
                        <span className="diaper-week-cell__counts">
                          <span className="diaper-week-cell__wet">W{wetTotal}</span>
                          <span className="diaper-week-cell__poop">P{poopTotal}</span>
                        </span>
                      ) : (
                        '·'
                      )}
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="month-calendar">
            <div className="month-calendar__legend" aria-hidden>
              {babyRows.map((baby) => (
                <span key={baby.id} className="month-calendar__legend-item">
                  {baby.name}
                </span>
              ))}
            </div>
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="month-calendar__dow">
                {label}
              </div>
            ))}
            {calendarDays.map((day) => {
              const inMonth = isSameMonth(day, monthStart)
              const isTodayCell = isSameDay(day, new Date())
              const counts = babyRows.map((baby) => ({
                baby,
                count: countTotal(diapers, baby.id, day),
              }))
              const summary = counts.map(({ baby, count }) => `${baby.name}: ${count}`).join(', ')
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={`month-calendar__day${inMonth ? '' : ' month-calendar__day--outside'}${isTodayCell ? ' month-calendar__day--today' : ''}`}
                  onClick={() => onDaySelect(day)}
                  aria-label={`${format(day, 'MMMM d, yyyy')}. ${summary}`}
                >
                  <span className="month-calendar__date">{format(day, 'd')}</span>
                  <div className="month-calendar__counts">
                    {counts.map(({ baby, count }) => (
                      <span
                        key={baby.id}
                        className={`month-calendar__count month-calendar__count--idx-${baby.idx % 4}${count > 0 ? ' month-calendar__count--has' : ''}`}
                        aria-hidden
                      >
                        {count > 0 ? count : '·'}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <TimelineViewFab mode="stats" onClick={onBack} />
    </div>
  )
}
