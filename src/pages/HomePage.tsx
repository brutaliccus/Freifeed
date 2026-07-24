import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Baby as BabyIcon, CalendarClock, Clock, User } from 'lucide-react'
import { PersonPuck } from '../components/PersonPuck'
import { AppBrand } from '../components/AppBrand'
import { BreastIcon } from '../components/BreastIcon'
import { MilkBagIcon } from '../components/MilkBagIcon'
import { DiaperIcon } from '../components/DiaperIcon'
import { IconPlusOverlay, TRACKER_PLUS_ICON_SIZE } from '../components/IconPlusOverlay'
import { PillIcon } from '../components/PillIcon'
import { AddNoteIcon } from '../components/AddNoteIcon'
import { MeasurementsIcon } from '../components/MeasurementsIcon'
import { BabyAvatar } from '../components/BabyAvatar'
import { HomeReminderBanner } from '../components/HomeReminderBanner'
import {
  homeHubActions,
  radialHubPositions,
  resolveHomePrimaryAction,
} from '../lib/appPreferences'
import { babyIdsFrom } from '../lib/babyUtils'
import { feedingAnchorTime, getLastFeedForBaby } from '../lib/feedings'
import { formatVolumeOz } from '../lib/feedingTypes'
import {
  formatAppointmentShorthand,
  todayAppointmentsForPerson,
  todayRemindersForHousehold,
} from '../lib/homeNotes'
import { babyShowsTracker, memberShowsOnHome } from '../lib/trackers'
import { householdMemberLabel } from '../lib/householdMembers'
import { memberSubjectId } from '../lib/medicineSubjects'
import { formatSinceLastCompact } from '../lib/time'
import type {
  Baby,
  BabyId,
  BabyNote,
  Feeding,
  HomeHubAction,
  HomePrimaryAction,
  HouseholdMember,
  MilkSummary,
  TrackerVisibility,
  UserProfile,
} from '../types'
import { resolveBaby } from '../types'

/** Theme tracker colors cycled onto radial quick-add buttons. */
const HUB_ACCENT_VARS = [
  '--tracker-milk',
  '--tracker-diaper',
  '--tracker-medicine',
  '--tracker-notes',
  '--tracker-measurements',
] as const

interface HomePageProps {
  profile: UserProfile | null
  babies: Baby[]
  members?: HouseholdMember[]
  personNicknames?: Record<string, string>
  memberShowOnHome?: Record<string, boolean>
  currentUid?: string | null
  feedings: Feeding[]
  milkSummary: MilkSummary
  navTrackers: TrackerVisibility
  notes: BabyNote[]
  onAddNursing: () => void
  onAddMilk: () => void
  onAddDiaper: () => void
  onAddMedicine: () => void
  onAddMeasurement: () => void
  onAddNote: () => void
  onStartFeedForBaby: (babyId: string) => void
  onOpenNotesForPerson: (personId: string) => void
  onOpenNotes: () => void
  onOpenMilkStorage: () => void
  onOpenProfile: () => void
  onAddBaby: () => void
  inProgressFeedKindByBaby?: Map<BabyId, 'nursing' | 'bottle'>
}

const ACTION_LABELS: Record<HomeHubAction, string> = {
  nursing: 'Start nursing',
  milk: 'Add milk',
  diaper: 'Log diaper',
  medicine: 'Add medicine',
  measurements: 'Add measurement',
  notes: 'Add note',
}

function HubActionIcon({ action }: { action: HomeHubAction }) {
  if (action === 'nursing') return <BreastIcon variant="add" size={TRACKER_PLUS_ICON_SIZE} />
  if (action === 'milk') return <MilkBagIcon size={TRACKER_PLUS_ICON_SIZE} />
  if (action === 'diaper') return <DiaperIcon size={TRACKER_PLUS_ICON_SIZE} />
  if (action === 'medicine') return <PillIcon size={TRACKER_PLUS_ICON_SIZE} />
  if (action === 'measurements') return <MeasurementsIcon size={TRACKER_PLUS_ICON_SIZE} />
  return <AddNoteIcon size={TRACKER_PLUS_ICON_SIZE} />
}

function HomeHubButton({
  action,
  variant,
  accentVar,
  slotAngle,
  onClick,
}: {
  action: HomeHubAction
  variant: 'primary' | 'radial'
  accentVar?: string
  slotAngle?: number
  onClick: () => void
}) {
  const isPrimary = variant === 'primary'
  const className = [
    'home-tracker-btn',
    `home-tracker-btn--${action}`,
    isPrimary
      ? 'home-tracker-btn--primary breast-circle-btn add-feed-btn'
      : 'home-tracker-btn--radial breast-circle-btn breast-circle-btn--modal home-tracker-btn--themed',
  ].join(' ')

  const themedStyle: CSSProperties | undefined =
    !isPrimary && accentVar
      ? ({ ['--hub-accent' as string]: `var(${accentVar})` } as CSSProperties)
      : undefined

  const button = (
    <button
      type="button"
      className={className}
      style={themedStyle}
      onClick={onClick}
      aria-label={ACTION_LABELS[action]}
    >
      {isPrimary ? (
        action === 'nursing' ? (
          <BreastIcon variant="add" size={96} />
        ) : (
          <IconPlusOverlay>
            <HubActionIcon action={action} />
          </IconPlusOverlay>
        )
      ) : (
        <IconPlusOverlay>
          <HubActionIcon action={action} />
        </IconPlusOverlay>
      )}
    </button>
  )

  if (isPrimary || slotAngle == null) return button

  return (
    <div
      className="home-radial-orbit__slot"
      style={{ ['--slot-angle' as string]: `${slotAngle}deg` }}
    >
      {button}
    </div>
  )
}

export function HomePage({
  profile,
  babies,
  members = [],
  personNicknames = {},
  memberShowOnHome = {},
  currentUid = null,
  feedings,
  milkSummary,
  navTrackers,
  notes,
  onAddNursing,
  onAddMilk,
  onAddDiaper,
  onAddMedicine,
  onAddMeasurement,
  onAddNote,
  onStartFeedForBaby,
  onOpenNotesForPerson,
  onOpenNotes,
  onOpenMilkStorage,
  onOpenProfile,
  onAddBaby,
  inProgressFeedKindByBaby = new Map(),
}: HomePageProps) {
  useEffect(() => {
    document.documentElement.classList.add('app-layout-home')
    return () => document.documentElement.classList.remove('app-layout-home')
  }, [])

  const todayReminders = useMemo(() => todayRemindersForHousehold(notes), [notes])

  const hasBabies = babies.length > 0

  if (!hasBabies) {
    return (
      <div className="page home-page home-page--empty">
        <header className="page__header home-page__brand-header home-page__brand-header--with-profile">
          <AppBrand />
          <button
            type="button"
            className="home-profile-btn soft-glow-control"
            onClick={onOpenProfile}
            aria-label="Profile"
          >
            <User size={22} strokeWidth={2} />
          </button>
        </header>
        <div className="home-page__empty-state">
          <button type="button" className="home-page__add-baby-btn" onClick={onAddBaby}>
            <span className="home-page__add-baby-icon" aria-hidden>
              <BabyIcon size={56} strokeWidth={1.5} />
            </span>
            <span className="home-page__add-baby-label">Add baby</span>
          </button>
          <p className="muted home-page__empty-hint">
            Add a baby from here or in Profile → Babies to start tracking feeds, diapers, and more.
          </p>
        </div>
      </div>
    )
  }

  const primary = resolveHomePrimaryAction(profile, navTrackers)
  const radialActions = homeHubActions(navTrackers, primary)
  const radialAngles = radialHubPositions(radialActions.length)

  const onAction = (action: HomeHubAction) => {
    if (action === 'nursing') onAddNursing()
    else if (action === 'milk') onAddMilk()
    else if (action === 'diaper') onAddDiaper()
    else if (action === 'medicine') onAddMedicine()
    else if (action === 'measurements') onAddMeasurement()
    else onAddNote()
  }

  const babyIds = babyIdsFrom(babies)
  const homeMembers = members.filter((m) => memberShowsOnHome(m.uid, memberShowOnHome))
  const totalCards = babyIds.length + homeMembers.length
  const cardClass =
    totalCards <= 1
      ? 'home-entry-grid--one'
      : totalCards === 2
        ? 'home-entry-grid--two'
        : 'home-entry-grid--three'

  const showHub =
    navTrackers.nursing ||
    navTrackers.milk ||
    navTrackers.diaper ||
    navTrackers.medicine ||
    navTrackers.notes ||
    navTrackers.measurements

  const showMilkFallback =
    navTrackers.milk && todayReminders.length === 0

  return (
    <div className="page home-page">
      <header className="page__header home-page__brand-header home-page__brand-header--with-profile">
        <AppBrand />
        <button
          type="button"
          className="home-profile-btn soft-glow-control"
          onClick={onOpenProfile}
          aria-label="Profile"
        >
          <User size={22} strokeWidth={2} />
        </button>
      </header>

      <section className={`home-entry-grid ${cardClass}`} aria-label="Household">
        {babyIds.map((id) => {
          const baby = resolveBaby(babies, id)
          const babyName = typeof baby === 'string' ? id : baby.name
          const personId = `baby:${id}`
          const last = getLastFeedForBaby(feedings, id)
          const sinceAnchor = last ? feedingAnchorTime(last) : null
          const lastWasBottle = (last?.type ?? 'nursing') === 'bottle'
          const inProgressKind = inProgressFeedKindByBaby.get(id)
          const todayAppts = todayAppointmentsForPerson(notes, personId)
          const babyRecord = typeof baby === 'string' ? babies.find((b) => b.id === id) : baby
          const showNursingStats = babyRecord != null && babyShowsTracker(babyRecord, 'nursing')
          const hasStats = showNursingStats || todayAppts.length > 0

          return (
            <article
              key={id}
              className={`baby-status-card${inProgressKind ? ' baby-status-card--active' : ''}`}
              onClick={() => onStartFeedForBaby(id)}
              onKeyDown={(e) => e.key === 'Enter' && onStartFeedForBaby(id)}
              role="button"
              tabIndex={0}
            >
              <button
                type="button"
                className="baby-status-card__portrait-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenNotesForPerson(personId)
                }}
                aria-label={`${babyName}'s notes`}
              >
                <BabyAvatar baby={baby} size="xl" showName />
              </button>
              {hasStats && (
              <div className="baby-status-card__stats">
                {showNursingStats && (
                  <div className="stat-row">
                    <Clock size={20} aria-hidden />
                    <span>
                      {inProgressKind === 'bottle'
                        ? 'Feeding'
                        : inProgressKind === 'nursing'
                          ? 'Nursing'
                          : sinceAnchor
                            ? lastWasBottle
                              ? `Fed ${formatSinceLastCompact(sinceAnchor)}`
                              : `Nursed ${formatSinceLastCompact(sinceAnchor)}`
                            : 'Not fed yet'}
                    </span>
                  </div>
                )}
                {todayAppts.length > 0 && (
                  <ul className="baby-status-card__appts" aria-label="Today's appointments">
                    {todayAppts.map(({ note, at }) => (
                      <li key={`${note.id}-${at.getTime()}`} className="baby-status-card__appt">
                        <CalendarClock size={14} aria-hidden />
                        <span>{formatAppointmentShorthand(note, at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              )}
            </article>
          )
        })}
        {homeMembers.map((member) => {
          const personId = memberSubjectId(member.uid)
          const label = householdMemberLabel(member, currentUid, personNicknames)
          const todayAppts = todayAppointmentsForPerson(notes, personId)
          return (
            <article
              key={personId}
              className="baby-status-card member-status-card"
              onClick={() => onOpenNotesForPerson(personId)}
              onKeyDown={(e) => e.key === 'Enter' && onOpenNotesForPerson(personId)}
              role="button"
              tabIndex={0}
            >
              <div className="member-status-card__portrait">
                <PersonPuck
                  subject={{ id: personId, kind: 'member', label }}
                  babies={babies}
                  members={members}
                  size="lg"
                />
                <span className="member-status-card__name">{label}</span>
              </div>
              {todayAppts.length > 0 && (
                <div className="baby-status-card__stats">
                  <ul className="baby-status-card__appts" aria-label="Today's appointments">
                    {todayAppts.map(({ note, at }) => (
                      <li key={`${note.id}-${at.getTime()}`} className="baby-status-card__appt">
                        <CalendarClock size={14} aria-hidden />
                        <span>{formatAppointmentShorthand(note, at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )
        })}
      </section>

      {showHub && (
        <div className="home-page__hub">
          <div className="home-radial-menu" aria-label="Quick add">
            <div className="home-radial-menu__stage">
              {navTrackers[primary as HomePrimaryAction] && (
                <HomeHubButton
                  action={primary}
                  variant="primary"
                  onClick={() => onAction(primary)}
                />
              )}
              {radialActions.length > 0 && (
                <div className="home-radial-orbit" aria-hidden={false}>
                  {radialActions.map((action, i) => (
                    <HomeHubButton
                      key={action}
                      action={action}
                      variant="radial"
                      slotAngle={radialAngles[i] ?? 0}
                      accentVar={HUB_ACCENT_VARS[i % HUB_ACCENT_VARS.length]}
                      onClick={() => onAction(action)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {todayReminders.length > 0 && navTrackers.notes && (
        <HomeReminderBanner notes={notes} onOpenNotes={onOpenNotes} />
      )}

      {showMilkFallback && (
        <button type="button" className="home-milk-total" onClick={onOpenMilkStorage}>
          <span className="home-milk-total__split">
            {formatVolumeOz(milkSummary.frozenOz) || '0'} oz Frozen,{' '}
            {formatVolumeOz(milkSummary.fridgeOz) || '0'} oz Refrigerated
          </span>
        </button>
      )}
    </div>
  )
}
