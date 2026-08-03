import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, Droplets, Plus, Trash2 } from 'lucide-react'
import { PageFab } from '../components/PageFab'
import { CombineBagsIcon } from '../components/CombineBagsIcon'
import { RedistributeIcon } from '../components/RedistributeIcon'
import { MilkStorageLotCard } from '../components/MilkStorageLotCard'
import { AddPumpVolumeSheet } from '../components/AddPumpVolumeSheet'
import { QuickAddMilkSheet } from '../components/QuickAddMilkSheet'
import { RedistributeMilkSheet } from '../components/RedistributeMilkSheet'
import { TransferMilkSheet, type MilkTransferDirection } from '../components/TransferMilkSheet'
import { deleteFeedingOptimistic } from '../lib/feedings'
import { fridgeLotsWithMilk, frozenLotsWithMilk } from '../lib/milkLotLabels'
import {
  combineMilkLotsBackground,
  deleteMilkLotBackground,
  redistributeMilkLotBackground,
  transferMilkLotsToFreezerBackground,
  transferMilkLotsToFridgeBackground,
} from '../lib/milkLots'
import { formatVolumeOz, roundVolumeOz } from '../lib/feedingTypes'
import { EditMilkLotSheet } from '../components/EditMilkLotSheet'
import { FridgeIcon, IceCubeIcon } from '../components/StorageIcons'
import { timestampToDate } from '../lib/time'
import type { Baby, Feeding, MilkLot } from '../types'
import { resolvePumpBabyId } from '../lib/feedingTypes'
import { babyIdsFrom } from '../lib/babyUtils'

interface MilkStoragePageProps {
  householdId: string
  babies: Baby[]
  lots: MilkLot[]
  feedings: Feeding[]
  totalOz: number
  loading: boolean
  onBack: () => void
  onRefresh: () => void
}

interface PendingPump {
  kind: 'pending'
  feeding: Feeding
  sortKey: number
}

interface LotEntry {
  kind: 'lot'
  lot: MilkLot
  sortKey: number
}

type Entry = PendingPump | LotEntry

type StorageTab = 'fridge' | 'frozen'

interface TransferState {
  direction: MilkTransferDirection
  initialLot: MilkLot
}

const STORAGE_TABS: { id: StorageTab; label: string }[] = [
  { id: 'fridge', label: 'Refrigerated' },
  { id: 'frozen', label: 'Frozen' },
]

function entryMatchesTab(entry: Entry, tab: StorageTab): boolean {
  if (entry.kind === 'pending') return tab === 'fridge'
  return entry.lot.storage === tab
}

export function MilkStoragePage({
  householdId,
  babies,
  lots,
  feedings,
  totalOz,
  loading,
  onBack,
  onRefresh,
}: MilkStoragePageProps) {
  const [tab, setTab] = useState<StorageTab>('fridge')
  const [transfer, setTransfer] = useState<TransferState | null>(null)
  const [addVolumeFeeding, setAddVolumeFeeding] = useState<Feeding | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [combineMode, setCombineMode] = useState(false)
  const [combineSelectedIds, setCombineSelectedIds] = useState<string[]>([])
  const [combineError, setCombineError] = useState<string | null>(null)
  const [redistributeLots, setRedistributeLots] = useState<MilkLot[]>([])
  const [editLot, setEditLot] = useState<MilkLot | null>(null)

  const fridgeLots = useMemo(() => fridgeLotsWithMilk(lots), [lots])
  const frozenLots = useMemo(() => frozenLotsWithMilk(lots), [lots])

  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = []
    for (const lot of lots) {
      if (lot.remainingOz <= 0) continue
      const stored = timestampToDate(lot.storedAt)
      list.push({ kind: 'lot', lot, sortKey: stored?.getTime() ?? 0 })
    }
    for (const f of feedings) {
      if ((f.type ?? 'nursing') !== 'pump') continue
      if (f.volumeOz != null) continue
      const stored =
        timestampToDate(f.storedAt) ?? timestampToDate(f.endAt) ?? timestampToDate(f.startAt)
      list.push({ kind: 'pending', feeding: f, sortKey: stored?.getTime() ?? 0 })
    }
    list.sort((a, b) => b.sortKey - a.sortKey)
    return list
  }, [lots, feedings])

  const tabCounts = useMemo(() => {
    let fridge = 0
    let frozen = 0
    for (const entry of entries) {
      if (entry.kind === 'pending') {
        fridge += 1
        continue
      }
      if (entry.lot.remainingOz <= 0) continue
      if (entry.lot.storage === 'fridge') fridge += 1
      else frozen += 1
    }
    return { fridge, frozen }
  }, [entries])

  const visibleEntries = useMemo(
    () => entries.filter((e) => entryMatchesTab(e, tab)),
    [entries, tab],
  )

  const combineSelectedSet = useMemo(() => new Set(combineSelectedIds), [combineSelectedIds])

  const exitCombineMode = () => {
    setCombineMode(false)
    setCombineSelectedIds([])
    setCombineError(null)
  }

  useEffect(() => {
    setCombineMode(false)
    setCombineSelectedIds([])
    setCombineError(null)
  }, [tab])

  const canSelectLotForCombine = (lot: MilkLot) =>
    lot.storage === tab && lot.remainingOz > 0

  const startCombineWithLot = (lotId: string) => {
    setCombineError(null)
    setCombineMode(true)
    setCombineSelectedIds((prev) => (prev.includes(lotId) ? prev : [...prev, lotId]))
  }

  const toggleCombineLot = (lotId: string) => {
    setCombineError(null)
    setCombineSelectedIds((prev) =>
      prev.includes(lotId) ? prev.filter((id) => id !== lotId) : [...prev, lotId],
    )
  }

  const handleBulkThaw = () => {
    if (tab !== 'frozen' || combineSelectedIds.length === 0) return
    const lotsToThaw = combineSelectedIds
      .map((id) => lots.find((l) => l.id === id))
      .filter((lot): lot is MilkLot => lot != null && lot.storage === 'frozen' && lot.remainingOz > 0)
    if (lotsToThaw.length === 0) return

    const label =
      lotsToThaw.length === 1
        ? `Thaw ${formatVolumeOz(lotsToThaw[0]!.remainingOz) || '0'} oz to the fridge?`
        : `Thaw ${lotsToThaw.length} bags (${formatVolumeOz(
            roundVolumeOz(lotsToThaw.reduce((sum, l) => sum + l.remainingOz, 0)),
          ) || '0'} oz total)? Each bag keeps its current volume.`
    if (!window.confirm(label)) return

    setCombineError(null)
    const lotIds = lotsToThaw.map((l) => l.id)
    const bagVolumesOz = lotsToThaw.map((l) => roundVolumeOz(l.remainingOz))
    transferMilkLotsToFridgeBackground(householdId, lotIds, bagVolumesOz)
    exitCombineMode()
    onRefresh()
  }

  const handleBulkFreeze = () => {
    if (tab !== 'fridge' || combineSelectedIds.length === 0) return
    const lotsToFreeze = combineSelectedIds
      .map((id) => lots.find((l) => l.id === id))
      .filter((lot): lot is MilkLot => lot != null && lot.storage === 'fridge' && lot.remainingOz > 0)
    if (lotsToFreeze.length === 0) return

    const label =
      lotsToFreeze.length === 1
        ? `Freeze ${formatVolumeOz(lotsToFreeze[0]!.remainingOz) || '0'} oz to the freezer?`
        : `Freeze ${lotsToFreeze.length} bags (${formatVolumeOz(
            roundVolumeOz(lotsToFreeze.reduce((sum, l) => sum + l.remainingOz, 0)),
          ) || '0'} oz total)? Each bag keeps its current volume.`
    if (!window.confirm(label)) return

    setCombineError(null)
    const lotIds = lotsToFreeze.map((l) => l.id)
    const bagVolumesOz = lotsToFreeze.map((l) => roundVolumeOz(l.remainingOz))
    transferMilkLotsToFreezerBackground(householdId, lotIds, bagVolumesOz)
    exitCombineMode()
    onRefresh()
  }

  const handleCombineConfirm = () => {
    if (combineSelectedIds.length < 2) return
    setCombineError(null)
    combineMilkLotsBackground(householdId, combineSelectedIds, null)
    exitCombineMode()
    onRefresh()
  }

  const selectedLots = useMemo(
    () =>
      combineSelectedIds
        .map((id) => lots.find((l) => l.id === id))
        .filter((lot): lot is MilkLot => lot != null),
    [combineSelectedIds, lots],
  )

  const openRedistribute = () => {
    if (selectedLots.length === 0) return
    setRedistributeLots(selectedLots)
  }

  const handleRedistributeConfirm = (bagVolumesOz: number[]) => {
    if (redistributeLots.length === 0) return
    redistributeMilkLotBackground(
      householdId,
      redistributeLots.map((lot) => lot.id),
      bagVolumesOz,
    )
    setRedistributeLots([])
    exitCombineMode()
    onRefresh()
  }

  const handleDelete = (lotId: string) => {
    if (!window.confirm('Remove this stored milk entry?')) return
    deleteMilkLotBackground(householdId, lotId)
    onRefresh()
  }

  const handleDeletePending = (feedingId: string) => {
    if (!window.confirm('Remove this pump session?')) return
    deleteFeedingOptimistic(householdId, feedingId, { onOptimistic: () => {} })
    onRefresh()
  }

  const handleTransferConfirm = (lotIds: string[], bagVolumesOz: number[]) => {
    if (!transfer) return
    if (transfer.direction === 'to-freezer') {
      transferMilkLotsToFreezerBackground(householdId, lotIds, bagVolumesOz)
    } else {
      transferMilkLotsToFridgeBackground(householdId, lotIds, bagVolumesOz)
    }
    onRefresh()
  }

  const sourceLots =
    transfer?.direction === 'to-freezer' ? fridgeLots : frozenLots

  return (
    <div className="page milk-storage-page">
      <header className="page__header page__header--row milk-storage-page__header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <h1>Milk storage</h1>
        <span className="milk-storage-page__spacer" aria-hidden />
      </header>

      <div className="milk-storage-page__total-row">
        <div className="milk-storage-page__total">
          <Droplets size={22} aria-hidden />
          <span>{formatVolumeOz(totalOz) || '0'} oz stored</span>
        </div>
      </div>

      {combineError && <p className="error-text milk-storage-page__combine-error">{combineError}</p>}

      <div className="milk-storage-tabs" role="tablist" aria-label="Milk storage type">
        {STORAGE_TABS.map((t) => {
          const count = tabCounts[t.id]
          const tabId = `milk-storage-tab-${t.id}`
          return (
            <button
              key={t.id}
              id={tabId}
              type="button"
              role="tab"
              className={`milk-storage-tabs__btn${tab === t.id ? ' milk-storage-tabs__btn--active' : ''}`}
              aria-selected={tab === t.id}
              aria-controls={`milk-storage-panel-${t.id}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {count > 0 && <span className="milk-storage-tabs__count">{count}</span>}
            </button>
          )
        })}
      </div>

      {loading && entries.length === 0 ? (
        <p className="muted milk-storage-page__empty">Loading…</p>
      ) : visibleEntries.length === 0 ? (
        <p className="muted milk-storage-page__empty">
          {tab === 'fridge'
            ? 'Nothing in the fridge. Pump sessions and refrigerated bags appear here.'
            : 'Nothing in the freezer. Freeze bags from the fridge tab to add entries here.'}
        </p>
      ) : (
        <ul
          className="milk-lot-list"
          role="tabpanel"
          id={`milk-storage-panel-${tab}`}
          aria-labelledby={`milk-storage-tab-${tab}`}
        >
          {visibleEntries.map((entry) => {
            if (entry.kind === 'pending') {
              const f = entry.feeding
              const stored =
                timestampToDate(f.storedAt) ?? timestampToDate(f.endAt) ?? timestampToDate(f.startAt)
              const pumped = timestampToDate(f.startAt) ?? timestampToDate(f.endAt)
              return (
                <li key={`pending-${f.id}`} className="milk-lot-card milk-lot-card--pending">
                  <div className="milk-lot-card__top">
                    <span className="milk-lot-card__date">
                      {stored ? format(stored, 'EEE, MMM d') : '—'}
                    </span>
                    <div className="milk-lot-card__actions">
                      <button
                        type="button"
                        className="milk-lot-card__action-btn milk-lot-card__action-btn--delete"
                        onClick={() => void handleDeletePending(f.id)}
                        aria-label="Delete pump session"
                      >
                        <Trash2 size={18} aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="milk-lot-card__volume-row milk-lot-card__volume-row--pending">
                    <button
                      type="button"
                      className="btn btn-primary milk-lot-card__add-volume-btn"
                      onClick={() => setAddVolumeFeeding(f)}
                    >
                      <Plus size={16} aria-hidden />
                      Add volume
                    </button>
                  </div>
                  {pumped && (
                    <span className="milk-lot-card__meta muted">
                      Pumped {format(pumped, 'h:mm a')} — volume pending
                    </span>
                  )}
                  {f.note && <span className="milk-lot-card__meta muted">{f.note}</span>}
                </li>
              )
            }

            const lot = entry.lot
            return (
              <MilkStorageLotCard
                key={lot.id}
                lot={lot}
                combineMode={combineMode}
                combineSelected={combineSelectedSet.has(lot.id)}
                onLongPressSelect={() => {
                  if (!canSelectLotForCombine(lot)) return
                  startCombineWithLot(lot.id)
                }}
                onToggleCombineSelect={() => {
                  if (!canSelectLotForCombine(lot)) return
                  if (!combineMode) setCombineMode(true)
                  toggleCombineLot(lot.id)
                }}
                onTransfer={() =>
                  setTransfer({
                    direction: lot.storage === 'fridge' ? 'to-freezer' : 'to-fridge',
                    initialLot: lot,
                  })
                }
                onEdit={() => setEditLot(lot)}
                onDelete={() => void handleDelete(lot.id)}
              />
            )
          })}
        </ul>
      )}

      {transfer && (
        <TransferMilkSheet
          direction={transfer.direction}
          initialLot={transfer.initialLot}
          sourceLots={sourceLots}
          onClose={() => setTransfer(null)}
          onConfirm={(lotIds, bags) => handleTransferConfirm(lotIds, bags)}
        />
      )}

      {addVolumeFeeding && (
        <AddPumpVolumeSheet
          householdId={householdId}
          feeding={addVolumeFeeding}
          lots={lots}
          onClose={() => setAddVolumeFeeding(null)}
          onSaved={onRefresh}
        />
      )}

      {quickAddOpen && (
        <QuickAddMilkSheet
          householdId={householdId}
          lots={lots}
          pumpBabyId={resolvePumpBabyId(babyIdsFrom(babies))}
          onClose={() => setQuickAddOpen(false)}
          onSaved={onRefresh}
        />
      )}

      {editLot && (
        <EditMilkLotSheet
          householdId={householdId}
          lot={editLot}
          onClose={() => setEditLot(null)}
          onSaved={onRefresh}
        />
      )}

      {redistributeLots.length > 0 && (
        <RedistributeMilkSheet
          lots={redistributeLots}
          onClose={() => setRedistributeLots([])}
          onConfirm={handleRedistributeConfirm}
        />
      )}

      {combineMode && (
        <div className="milk-storage-action-bar" role="toolbar" aria-label="Bag actions">
          {tab === 'fridge' && (
            <button
              type="button"
              className="milk-storage-action-bar__btn milk-storage-action-bar__btn--freeze"
              onClick={handleBulkFreeze}
              disabled={combineSelectedIds.length < 1}
              aria-label={`Freeze ${combineSelectedIds.length} bag(s)`}
            >
              <IceCubeIcon size={72} />
            </button>
          )}
          {tab === 'frozen' && (
            <button
              type="button"
              className="milk-storage-action-bar__btn milk-storage-action-bar__btn--thaw"
              onClick={handleBulkThaw}
              disabled={combineSelectedIds.length < 1}
              aria-label={`Thaw ${combineSelectedIds.length} bag(s)`}
            >
              <FridgeIcon size={72} />
            </button>
          )}
          <button
            type="button"
            className="milk-storage-action-bar__btn milk-storage-action-bar__btn--combine"
            onClick={handleCombineConfirm}
            disabled={combineSelectedIds.length < 2}
            aria-label={`Combine ${combineSelectedIds.length} bags`}
          >
            <CombineBagsIcon />
          </button>
          <button
            type="button"
            className="milk-storage-action-bar__btn milk-storage-action-bar__btn--redistribute"
            onClick={openRedistribute}
            disabled={combineSelectedIds.length < 1}
            aria-label="Redistribute milk into smaller bags"
          >
            <RedistributeIcon size={72} />
          </button>
          <button
            type="button"
            className="milk-storage-action-bar__btn milk-storage-action-bar__btn--cancel"
            onClick={exitCombineMode}
            aria-label="Cancel selection"
          >
            ×
          </button>
        </div>
      )}

      <PageFab
        kind="milk"
        label="Add milk to storage"
        hidden={combineMode}
        onClick={() => setQuickAddOpen(true)}
      />

    </div>
  )
}
