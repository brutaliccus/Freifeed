import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react'
import { addDays, format, isToday, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BabyAvatar } from './BabyAvatar'
import { TimelineViewFab } from './TimelineViewFab'
import { LoadMoreButton } from './LoadMoreButton'
import { PoopIcon } from './PoopIcon'
import { WetIcon } from './WetIcon'
import { diaperKindLabel } from '../lib/diapers'
import {
  timestampToDate,
  getTimelineRangeForLoadedDays,
  diaperInTimelineRange,
  timelineYInTrack,
  timelineDayAtScrollY,
  TIMELINE_HOUR_HEIGHT,
  TIMELINE_DAY_HEIGHT,
} from '../lib/time'
import { timelineDataColumnClass } from '../lib/timelineColumns'
import type { Baby, Diaper } from '../types'
import { babyIdsFrom } from '../lib/babyUtils'
import { resolveBaby } from '../types'

interface DiaperDailyTimelineProps {
  babies: Baby[]
  diapers: Diaper[]
  onEditDiaper: (diaper: Diaper) => void
  onOpenWeekly: () => void
  initialDate?: Date | null
  onDateConsumed?: () => void
  showStatsFab?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  daysLoaded?: number
}

const HOUR_HEIGHT = TIMELINE_HOUR_HEIGHT
const BLOCK_HEIGHT = 26

export function DiaperDailyTimeline({
  babies,
  diapers,
  onEditDiaper,
  onOpenWeekly,
  initialDate,
  onDateConsumed,
  showStatsFab = true,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  daysLoaded = 30,
}: DiaperDailyTimelineProps) {
  const [babyPage, setBabyPage] = useState(0)
  const babyIds = useMemo(() => babyIdsFrom(babies), [babies])
  const babiesPerPage = 3
  const babyPageCount = Math.max(1, Math.ceil(babyIds.length / babiesPerPage))
  const visibleBabyIds = babyIds.slice(babyPage * babiesPerPage, babyPage * babiesPerPage + babiesPerPage)
  const dataColumnCount = visibleBabyIds.length
  const timelineLayoutClass = timelineDataColumnClass(dataColumnCount)
  const { origin, dayCount } = useMemo(
    () => getTimelineRangeForLoadedDays(daysLoaded),
    [daysLoaded],
  )
  const trackHeight = dayCount * TIMELINE_DAY_HEIGHT

  const [displayDay, setDisplayDay] = useState(() => startOfDaySafe(initialDate ?? new Date()))
  const [now, setNow] = useState(() => new Date())
  const [trackOffset, setTrackOffset] = useState<number | null>(null)
  const [showReturnToNow, setShowReturnToNow] = useState(false)
  const [showLoadMore, setShowLoadMore] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const hasScrolledRef = useRef(false)
  const consumedInitialDateRef = useRef(false)
  const userInteractedRef = useRef(false)
  const programmaticScrollRef = useRef(false)

  const measureTrackOffset = useCallback(() => {
    const body = bodyRef.current
    const track = trackRef.current
    if (!body || !track) return
    const offset = track.getBoundingClientRect().top - body.getBoundingClientRect().top
    setTrackOffset(offset)
  }, [])

  useLayoutEffect(() => {
    measureTrackOffset()
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(measureTrackOffset)
    observer.observe(body)
    return () => observer.disconnect()
  }, [dayCount, babies, measureTrackOffset])

  useEffect(() => {
    window.addEventListener('resize', measureTrackOffset)
    return () => window.removeEventListener('resize', measureTrackOffset)
  }, [measureTrackOffset])

  useEffect(() => {
    document.documentElement.classList.add('app-layout-daily')
    return () => document.documentElement.classList.remove('app-layout-daily')
  }, [])

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const nowLineTop = (trackOffset ?? 0) + timelineYInTrack(now, origin, HOUR_HEIGHT)

  const scrollToNow = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = scrollRef.current
      if (!el || trackOffset == null) return

      const target = nowLineTop - el.clientHeight / 2
      const maxScroll = el.scrollHeight - el.clientHeight
      programmaticScrollRef.current = true
      el.scrollTo({
        top: Math.max(0, Math.min(target, maxScroll)),
        behavior,
      })
    },
    [nowLineTop, trackOffset],
  )

  const scrollToDay = useCallback(
    (day: Date, behavior: ScrollBehavior = 'auto') => {
      const el = scrollRef.current
      if (!el || trackOffset == null) return

      const dayIndex = Math.max(0, differenceInDaysSafe(day, origin))
      const target = trackOffset + dayIndex * TIMELINE_DAY_HEIGHT + TIMELINE_DAY_HEIGHT / 2 - el.clientHeight / 2
      const maxScroll = el.scrollHeight - el.clientHeight
      programmaticScrollRef.current = true
      el.scrollTo({
        top: Math.max(0, Math.min(target, maxScroll)),
        behavior,
      })
    },
    [origin, trackOffset],
  )

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el || trackOffset == null) return

    const newDay = timelineDayAtScrollY(el.scrollTop, trackOffset, origin, dayCount, HOUR_HEIGHT)
    setDisplayDay((prev) => (isSameDay(prev, newDay) ? prev : newDay))

    const margin = 40
    const visible =
      nowLineTop >= el.scrollTop + margin && nowLineTop <= el.scrollTop + el.clientHeight - margin
    setShowReturnToNow(!visible)
    setShowLoadMore(el.scrollTop < 160 && hasMore)
  }, [trackOffset, origin, dayCount, nowLineTop, hasMore])

  const handleScroll = useCallback(() => {
    if (!programmaticScrollRef.current) {
      userInteractedRef.current = true
    }
    programmaticScrollRef.current = false
    updateScrollState()
  }, [updateScrollState])

  useEffect(() => {
    if (trackOffset == null) return
    if (initialDate && !consumedInitialDateRef.current) {
      scrollToDay(initialDate, 'auto')
      setDisplayDay(startOfDaySafe(initialDate))
      consumedInitialDateRef.current = true
      onDateConsumed?.()
      return
    }
    if (hasScrolledRef.current) return
    scrollToNow('auto')
    hasScrolledRef.current = true
  }, [trackOffset, initialDate, scrollToDay, scrollToNow, onDateConsumed])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date())
        if (!userInteractedRef.current) {
          scrollToNow('smooth')
        }
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [scrollToNow])

  useEffect(() => {
    updateScrollState()
  }, [nowLineTop, updateScrollState])

  const diapersByBaby = useMemo(() => {
    const map = new Map<string, Diaper[]>()
    for (const id of babyIds) map.set(id, [])
    for (const d of diapers) {
      if (!diaperInTimelineRange(d, origin, dayCount)) continue
      map.get(d.babyId)?.push(d)
    }
    return map
  }, [diapers, origin, dayCount, babyIds])

  const timelineHeight = (trackOffset ?? 0) + trackHeight

  useEffect(() => {
    if (babyPage > babyPageCount - 1) setBabyPage(Math.max(0, babyPageCount - 1))
  }, [babyPage, babyPageCount])

  if (babyIds.length === 0) {
    return (
      <div className="page daily-page">
        <p className="muted daily-page__empty">No babies are set up for diaper tracking. Enable it in Profile.</p>
      </div>
    )
  }

  return (
    <div className="page daily-page">
      <div className="daily-page__chrome">
        <header className="page__header daily-page__header">
          <h1>{isToday(displayDay) ? 'Today' : format(displayDay, 'EEE, MMM d')}</h1>
        </header>

        <div className={`timeline-baby-headers ${timelineLayoutClass}`}>
          <div className="timeline-baby-headers__corner" aria-hidden />
          {visibleBabyIds.map((id) => {
            const baby = resolveBaby(babies, id)
            return (
              <div key={id} className="timeline-baby-headers__cell">
                <BabyAvatar baby={baby} size="sm" />
                <span>{typeof baby === 'string' ? 'Baby' : baby.name}</span>
              </div>
            )
          })}
        </div>
        {babyPageCount > 1 && (
          <div className="timeline-baby-pager" role="group" aria-label="Baby columns">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setBabyPage((n) => Math.max(0, n - 1))}
              disabled={babyPage === 0}
              aria-label="Previous babies"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="timeline-baby-pager__label">
              Babies {babyPage * babiesPerPage + 1}-
              {Math.min(babyIds.length, babyPage * babiesPerPage + visibleBabyIds.length)} of {babyIds.length}
            </span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setBabyPage((n) => Math.min(babyPageCount - 1, n + 1))}
              disabled={babyPage >= babyPageCount - 1}
              aria-label="Next babies"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      <div className="timeline-viewport">
        <div className="timeline-scroll" ref={scrollRef} onScroll={handleScroll}>
          <div className="timeline-body" ref={bodyRef} style={{ minHeight: timelineHeight }}>
            {(showLoadMore || loadingMore) && (
              <LoadMoreButton
                placement="top"
                hasMore={hasMore}
                loading={loadingMore}
                onLoadMore={() => onLoadMore?.()}
                daysLoaded={daysLoaded}
              />
            )}
            <div className="timeline-now-line" style={{ top: nowLineTop }} aria-hidden>
              <span className="timeline-now-line__label">{format(now, 'h:mm a')}</span>
            </div>

            {Array.from({ length: dayCount }, (_, di) => (
              <div
                key={di}
                className="timeline-day-marker"
                style={{ top: (trackOffset ?? 0) + di * TIMELINE_DAY_HEIGHT }}
                aria-hidden
              >
                <span>{format(addDays(origin, di), 'EEE, MMM d')}</span>
              </div>
            ))}

            <div className={`timeline-grid ${timelineLayoutClass}`}>
              <div className="timeline-hours" aria-hidden>
                {Array.from({ length: dayCount }, (_, di) =>
                  Array.from({ length: 24 }, (_, h) => {
                    const labelDate = addDays(origin, di)
                    labelDate.setHours(h, 0, 0, 0)
                    return (
                      <div
                        key={`${di}-${h}`}
                        className="timeline-hour-label"
                        style={{ height: HOUR_HEIGHT }}
                      >
                        {h === 0 ? format(addDays(origin, di), 'EEE') : format(labelDate, 'ha')}
                      </div>
                    )
                  }),
                )}
              </div>

              {visibleBabyIds.map((id) => {
                const list = diapersByBaby.get(id) ?? []

                return (
                  <div key={id} className="timeline-column">
                    <div
                      className="timeline-track"
                      ref={id === babyIds[0] ? trackRef : undefined}
                      style={{ height: trackHeight }}
                    >
                      {list.map((d) => (
                        <DiaperBlock
                          key={d.id}
                          diaper={d}
                          origin={origin}
                          hourHeight={HOUR_HEIGHT}
                          onClick={() => onEditDiaper(d)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {showReturnToNow && (
        <button
          type="button"
          className="timeline-return-now btn btn-primary"
          onClick={() => scrollToNow('smooth')}
        >
          Return to now
        </button>
      )}

      {showStatsFab && (
        <TimelineViewFab mode="daily" onClick={onOpenWeekly} className="page-fab--adjacent-left" />
      )}
    </div>
  )
}

function DiaperBlock({
  diaper,
  origin,
  hourHeight,
  onClick,
}: {
  diaper: Diaper
  origin: Date
  hourHeight: number
  onClick: () => void
}) {
  const instant = timestampToDate(diaper.changedAt)
  if (!instant) return null
  const top = timelineYInTrack(instant, origin, hourHeight)
  const kind = diaper.kind
  const label = diaperKindLabel(kind)

  return (
    <div
      role="button"
      tabIndex={0}
      className={`diaper-block diaper-block--${kind}`}
      style={{ top, height: BLOCK_HEIGHT }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      aria-label={label}
    >
      <span className="diaper-block__icons" aria-hidden>
        {(kind === 'wet' || kind === 'both') && <WetIcon size={14} />}
        {(kind === 'poop' || kind === 'both') && <PoopIcon size={14} />}
      </span>
      <span className="diaper-block__label">{label}</span>
    </div>
  )
}

function startOfDaySafe(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function differenceInDaysSafe(day: Date, origin: Date): number {
  const a = startOfDaySafe(day).getTime()
  const b = startOfDaySafe(origin).getTime()
  return Math.round((a - b) / 86_400_000)
}
