import { useState } from 'react'
import { DiaperFormModal } from '../components/DiaperFormModal'
import { DiaperDailyTimeline } from '../components/DiaperDailyTimeline'
import { PageFab } from '../components/PageFab'
import { babiesForTracker } from '../lib/trackers'
import { defaultBabyForDiaper } from '../lib/diapers'
import type { Baby, Diaper } from '../types'

interface DiapersPageProps {
  householdId: string
  babies: Baby[]
  diapers: Diaper[]
  onOpenWeekly: () => void
  initialDate?: Date | null
  onDateConsumed?: () => void
  onRefresh: () => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  daysLoaded?: number
}

export function DiapersPage({
  householdId,
  babies,
  diapers,
  onOpenWeekly,
  initialDate,
  onDateConsumed,
  onRefresh,
  hasMore,
  loadingMore,
  onLoadMore,
  daysLoaded,
}: DiapersPageProps) {
  const diaperBabies = babiesForTracker(babies, 'diaper')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Diaper | null>(null)

  const openEdit = (d: Diaper) => {
    setEditing(d)
    setModalOpen(true)
  }

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }

  return (
    <>
      <DiaperDailyTimeline
        babies={diaperBabies}
        diapers={diapers}
        onEditDiaper={openEdit}
        onOpenWeekly={onOpenWeekly}
        initialDate={initialDate}
        onDateConsumed={onDateConsumed}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        daysLoaded={daysLoaded}
      />

      <PageFab kind="diaper" label="Log diaper" onClick={openAdd} />

      {modalOpen && (
        <DiaperFormModal
          householdId={householdId}
          babies={diaperBabies}
          editing={editing}
          defaultBabyId={defaultBabyForDiaper(diaperBabies.map((b) => b.id)) ?? undefined}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
          onSaved={onRefresh}
        />
      )}
    </>
  )
}
