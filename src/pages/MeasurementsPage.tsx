import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { BabyAvatar } from '../components/BabyAvatar'
import { LoadMoreButton } from '../components/LoadMoreButton'
import { MeasurementFormModal } from '../components/MeasurementFormModal'
import { IconPlusOverlay, TRACKER_PLUS_ICON_SIZE } from '../components/IconPlusOverlay'
import { MeasurementsIcon } from '../components/MeasurementsIcon'
import { latestByField } from '../lib/measurements'
import {
  ageInMonthsAt,
  formatInches,
  formatWeightLbOz,
  headCircPercentile,
  lengthHeightLabel,
  lengthPercentile,
  profilePercentileHint,
  weightPercentile,
} from '../lib/growthPercentiles'
import { timestampMs, timestampToDate } from '../lib/time'
import type { Baby, Measurement } from '../types'
import { resolveBaby } from '../types'

interface MeasurementsPageProps {
  householdId: string
  babies: Baby[]
  measurements: Measurement[]
  onRefresh: () => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  daysLoaded?: number
}

function MeasurementStat({
  label,
  value,
  percentile,
  profileHint,
}: {
  label: string
  value: string | null
  percentile: string | null
  profileHint: string | null
}) {
  return (
    <div className="measurement-stat">
      <span className="measurement-stat__label">{label}</span>
      <span className="measurement-stat__value">{value ?? '—'}</span>
      <span className="measurement-stat__pct muted">
        {percentile ?? (value ? profileHint ?? '—' : '')}
      </span>
    </div>
  )
}

export function MeasurementsPage({
  householdId,
  babies,
  measurements,
  onRefresh,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  daysLoaded,
}: MeasurementsPageProps) {
  const [modalOpen, setModalOpen] = useState(false)

  const history = useMemo(() => {
    return [...measurements].sort(
      (a, b) => timestampMs(b.measuredAt) - timestampMs(a.measuredAt),
    )
  }, [measurements])

  const cards = useMemo(() => {
    return babies.map((baby) => {
      const weightM = latestByField(measurements, baby.id, 'weightLb')
      const lengthM = latestByField(measurements, baby.id, 'lengthIn')
      const headM = latestByField(measurements, baby.id, 'headCircIn')

      const weightAt = weightM ? timestampToDate(weightM.measuredAt) : null
      const lengthAt = lengthM ? timestampToDate(lengthM.measuredAt) : null
      const headAt = headM ? timestampToDate(headM.measuredAt) : null

      const ageForLength =
        lengthAt && baby.birthDate ? ageInMonthsAt(baby.birthDate, lengthAt) ?? 0 : 0
      const lengthLabel = lengthHeightLabel(ageForLength)

      return {
        baby,
        weightM,
        lengthM,
        headM,
        weightAt,
        lengthAt,
        headAt,
        lengthLabel,
      }
    })
  }, [babies, measurements])

  return (
    <>
      <div className="page measurements-page">
        <header className="page__header">
          <h1>Measurements</h1>
          <p className="muted">Latest growth stats per baby (WHO 0–24 mo, CDC 24+ mo percentiles)</p>
        </header>

        <div className="measurements-list">
          {cards.map(
            ({ baby, weightM, lengthM, headM, weightAt, lengthAt, headAt, lengthLabel }) => {
              const profileHint = profilePercentileHint(baby)

              const wPct =
                weightM && weightAt && baby.birthDate && baby.sex
                  ? weightPercentile(
                      weightM.weightLb,
                      weightM.weightOz,
                      baby.birthDate,
                      baby.sex,
                      weightAt,
                    )
                  : null
              const lPct =
                lengthM && lengthAt && baby.birthDate && baby.sex
                  ? lengthPercentile(lengthM.lengthIn, baby.birthDate, baby.sex, lengthAt)
                  : null
              const hPct =
                headM && headAt && baby.birthDate && baby.sex
                  ? headCircPercentile(headM.headCircIn, baby.birthDate, baby.sex, headAt)
                  : null

              return (
                <article key={baby.id} className="measurement-card card">
                  <BabyAvatar baby={baby} size="lg" />
                  <div className="measurement-card__stats">
                    <MeasurementStat
                      label="Weight"
                      value={
                        weightM
                          ? formatWeightLbOz(weightM.weightLb, weightM.weightOz)
                          : null
                      }
                      percentile={wPct?.label ?? null}
                      profileHint={profileHint}
                    />
                    <MeasurementStat
                      label={lengthLabel}
                      value={lengthM ? formatInches(lengthM.lengthIn) : null}
                      percentile={lPct?.label ?? null}
                      profileHint={profileHint}
                    />
                    <MeasurementStat
                      label="Head circ."
                      value={headM ? formatInches(headM.headCircIn) : null}
                      percentile={hPct?.label ?? null}
                      profileHint={profileHint}
                    />
                  </div>
                </article>
              )
            },
          )}
        </div>

        {history.length > 0 && (
          <section className="measurements-history">
            <h2 className="measurements-history__title">Recent history</h2>
            <ul className="measurements-history__list">
              {history.map((m) => {
                const baby = resolveBaby(babies, m.babyId)
                const at = timestampToDate(m.measuredAt)
                const parts = [
                  m.weightLb != null || m.weightOz != null
                    ? formatWeightLbOz(m.weightLb, m.weightOz)
                    : null,
                  m.lengthIn != null ? formatInches(m.lengthIn) : null,
                  m.headCircIn != null ? formatInches(m.headCircIn) : null,
                ].filter(Boolean)
                return (
                  <li key={m.id} className="measurements-history__item">
                    <span>
                      {typeof baby === 'string' ? baby : baby.name}
                      {at ? ` · ${format(at, 'MMM d, yyyy')}` : ''}
                    </span>
                    <span className="muted">{parts.join(' · ') || '—'}</span>
                  </li>
                )
              })}
            </ul>
            <LoadMoreButton
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={() => onLoadMore?.()}
              daysLoaded={daysLoaded}
            />
          </section>
        )}
      </div>

      <button
        type="button"
        className="page-fab page-fab--measurements soft-glow-control"
        onClick={() => setModalOpen(true)}
        aria-label="Add measurement"
      >
        <IconPlusOverlay>
          <MeasurementsIcon size={TRACKER_PLUS_ICON_SIZE} />
        </IconPlusOverlay>
      </button>

      {modalOpen && (
        <MeasurementFormModal
          householdId={householdId}
          babies={babies}
          onClose={() => setModalOpen(false)}
          onSaved={onRefresh}
        />
      )}
    </>
  )
}
