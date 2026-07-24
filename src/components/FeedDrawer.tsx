import { ChevronDown, Play, Pause, Trash2, Scale, StickyNote } from 'lucide-react'
import { format } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { BabyAvatar } from './BabyAvatar'
import { DatePickerField } from './DatePickerField'
import { FeedDateButton } from './FeedDateButton'
import { TimePickerField } from './TimePickerField'
import { PumpIcon } from './PumpIcon'
import { PumpVolumePrompt } from './PumpVolumePrompt'
import { BottleMilkSourceSheet } from './BottleMilkSourceSheet'
import { SideTogglePicker } from './SideTogglePicker'
import { FridgeIcon, IceCubeIcon } from './StorageIcons'
import { type ActiveFeedDraft, isSessionStarted, isTimerPaused, isTimerRunning } from '../lib/activeFeedSession'
import { createFeeding, updateFeeding, deleteFeeding, type FeedingInput } from '../lib/feedings'
import { BottleFeedSelectedBags } from './BottleFeedSelectedBags'
import { deductionsMatchVolume } from '../lib/milkBottleDeductions'
import { formatMilkLotOption } from '../lib/milkLotLabels'
import type { MilkDeduction } from '../types'
import {
  defaultMilkStorage,
  draftCanSave,
  draftNeedsVolume,
  feedingLogTitle,
  parseVolumeOzInput,
  resolvePumpBabyId,
} from '../lib/feedingTypes'
import { sidesToNursingSide, type SideToggle } from '../lib/sides'
import { todayLocalDateString } from '../lib/time'
import type { Baby, BabyId, MilkLot, MilkStorage } from '../types'
import { babyIdsFrom } from '../lib/babyUtils'
import { resolveBaby } from '../types'

export type FeedDrawerMode = 'active' | 'edit-completed'

interface FeedDrawerProps {
  householdId: string
  babies: Baby[]
  milkLots: MilkLot[]
  draft: ActiveFeedDraft
  mode: FeedDrawerMode
  buildInput: (draft: ActiveFeedDraft) => FeedingInput
  onDraftChange: (patch: Partial<ActiveFeedDraft>) => void
  syncing?: boolean
  onStartTimer: () => void | Promise<void>
  onPauseTimer: () => void
  onResumeTimer: () => void
  onSyncEndTime?: (endTime: string) => void
  onStopForSave?: (endTime: string) => Promise<void>
  onMinimize: () => void
  onSaved: () => void
  onRefreshMilk?: () => void
  onClearSession: () => void
  hasActiveBaby: (babyId: BabyId) => boolean
  canAddTandem?: boolean
  onStartTandem?: () => void
  pumpBusy?: boolean
  onSwitchBaby: (babyId: BabyId) => void
  getSuggestedSides?: (babyId: BabyId) => SideToggle[]
}

export function FeedDrawer({
  householdId,
  babies,
  milkLots,
  draft,
  mode,
  buildInput,
  onDraftChange,
  syncing,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  onSyncEndTime,
  onStopForSave,
  onMinimize,
  onSaved,
  onRefreshMilk,
  onClearSession,
  hasActiveBaby,
  canAddTandem = false,
  onStartTandem,
  pumpBusy = false,
  onSwitchBaby,
  getSuggestedSides,
}: FeedDrawerProps) {
  const babyIds = babyIdsFrom(babies)
  const sideSuggestionApplied = useRef(false)
  const timerRunning = isTimerRunning(draft)
  const timerPaused = isTimerPaused(draft)
  const sessionStarted = isSessionStarted(draft)
  const isPump = draft.kind === 'pump'
  const isBottle = draft.kind === 'bottle'
  const isNursing = draft.kind === 'nursing'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pumpPromptOpen, setPumpPromptOpen] = useState(false)
  const [bottleSourceOpen, setBottleSourceOpen] = useState(false)

  useEffect(() => {
    sideSuggestionApplied.current = false
  }, [draft.sessionId])

  useEffect(() => {
    if (sideSuggestionApplied.current) return
    if (mode !== 'active' || isPump || isBottle || draft.sides.length > 0 || !getSuggestedSides) return
    const sides = getSuggestedSides(draft.babyId)
    if (sides.length === 0) return
    sideSuggestionApplied.current = true
    onDraftChange({ sides, side: sidesToNursingSide(sides) })
  }, [draft.sessionId, draft.babyId, draft.sides.length, mode, isPump, isBottle, getSuggestedSides, onDraftChange])

  const bottleDeductions = draft.bottleMilkDeductions ?? []

  const openBottleSourcePicker = () => {
    const vol = parseVolumeOzInput(draft.volumeOz)
    if (vol == null || vol <= 0) {
      setError('Enter ounces given before choosing bags')
      return
    }
    setError(null)
    onRefreshMilk?.()
    setBottleSourceOpen(true)
  }

  const performSave = async (overrides?: {
    volumeOz?: string
    milkStorage?: MilkStorage | null
    skipVolume?: boolean
    bottleMilkDeductions?: MilkDeduction[]
    milkBagVolumes?: number[]
    addToLotId?: string | null
  }) => {
    setSaving(true)
    setError(null)
    const side = sidesToNursingSide(draft.sides)
    const endTime = draft.endTime || format(new Date(), 'HH:mm')
    const needsStop =
      mode === 'active' &&
      (isNursing || isPump) &&
      sessionStarted &&
      !draft.awaitingVolume &&
      !draft.endTime

    const skipVolume = overrides?.skipVolume === true
    const volumeOverride = skipVolume
      ? ''
      : overrides?.volumeOz !== undefined
        ? overrides.volumeOz
        : draft.volumeOz
    const storageOverride = skipVolume
      ? draft.milkStorage
      : (overrides?.milkStorage as MilkStorage | undefined) ?? draft.milkStorage

    let saveDraft: ActiveFeedDraft = {
      ...draft,
      side,
      volumeOz: volumeOverride,
      milkStorage: storageOverride ?? defaultMilkStorage(),
      awaitingVolume: false,
      bottleMilkDeductions: overrides?.bottleMilkDeductions ?? bottleDeductions,
    }

    try {
      if (needsStop && onStopForSave) {
        await onStopForSave(endTime)
        saveDraft = {
          ...saveDraft,
          endTime,
          timerStartedAt: null,
          timerPaused: false,
          side,
          awaitingVolume: false,
        }
      }

      if (isBottle && parseVolumeOzInput(saveDraft.volumeOz) == null) {
        setError('Enter ounces given')
        setSaving(false)
        return
      }

      if (isBottle) {
        const vol = parseVolumeOzInput(saveDraft.volumeOz)
        if (vol != null && vol > 0) {
          const deductions = saveDraft.bottleMilkDeductions
          if (deductions.length === 0 || !deductionsMatchVolume(deductions, vol)) {
            setSaving(false)
            openBottleSourcePicker()
            return
          }
          for (const d of deductions) {
            const lot = milkLots.find((l) => l.id === d.lotId)
            if (!lot || lot.remainingOz + 0.01 < d.amountOz) {
              setError(
                lot
                  ? `Not enough left in ${formatMilkLotOption(lot)}`
                  : 'A selected milk bag is no longer available',
              )
              setSaving(false)
              return
            }
          }
        }
      }

      let input = buildInput(saveDraft)
      if (overrides?.milkBagVolumes?.length) {
        input = { ...input, milkBagVolumes: overrides.milkBagVolumes }
      }
      if (overrides?.addToLotId) {
        input = { ...input, addToLotId: overrides.addToLotId }
      }
      if (
        isPump &&
        !skipVolume &&
        parseVolumeOzInput(saveDraft.volumeOz) != null &&
        !saveDraft.milkStorage
      ) {
        setError('Choose fridge or frozen storage')
        setSaving(false)
        return
      }
      if (input.startAt && input.endAt && input.endAt < input.startAt && !isBottle) {
        setError('End time must be after start time')
        setSaving(false)
        return
      }

      if (saveDraft.feedingId) {
        await updateFeeding(householdId, saveDraft.feedingId, input)
      } else {
        await createFeeding(householdId, input)
      }
      onClearSession()
      onSaved()
      onMinimize()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    // Pump save with no volume → prompt for volume + storage (with Add later).
    if (isPump && mode === 'active' && parseVolumeOzInput(draft.volumeOz) == null) {
      setPumpPromptOpen(true)
      return
    }

    if (isBottle) {
      const vol = parseVolumeOzInput(draft.volumeOz)
      if (vol == null) {
        setError('Enter ounces given')
        return
      }
      if (vol > 0 && (bottleDeductions.length === 0 || !deductionsMatchVolume(bottleDeductions, vol))) {
        openBottleSourcePicker()
        return
      }
    }

    await performSave()
  }

  const handleDiscard = async () => {
    setSaving(true)
    setError(null)
    try {
      if (draft.feedingId) {
        await deleteFeeding(householdId, draft.feedingId)
      }
      onClearSession()
      onSaved()
      onMinimize()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not discard')
    } finally {
      setSaving(false)
    }
  }

  const title =
    mode === 'edit-completed' ? feedingLogTitle(draft.kind, true) : feedingLogTitle(draft.kind)

  // Nursing requires starting a session before saving; pump is optional and can be saved manually
  const showStartSession =
    mode === 'active' && isNursing && !sessionStarted && !draft.awaitingVolume

  const showStopAndSave =
    mode === 'active' && (isNursing || isPump) && sessionStarted && !draft.awaitingVolume

  const handleFooterAction = async () => {
    if (showStartSession) {
      setSaving(true)
      setError(null)
      try {
        await onStartTimer()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start session')
      } finally {
        setSaving(false)
      }
      return
    }
    await handleSave()
  }

  const handleTimerClick = () => {
    if (timerRunning) onPauseTimer()
    else if (timerPaused) onResumeTimer()
    else void onStartTimer()
  }

  return (
    <>
      <div className="feed-drawer-backdrop" onClick={onMinimize} role="presentation" />
      <div className="feed-drawer feed-drawer--open" role="dialog" aria-labelledby="feed-drawer-title">
        <div className="feed-drawer__handle" aria-hidden />
        <header className="feed-drawer__header">
          <h2 id="feed-drawer-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onMinimize} aria-label="Minimize">
            <ChevronDown size={24} />
          </button>
        </header>

        {draftNeedsVolume(draft) && (
          <p className="feed-drawer__hint muted">Session stopped — enter how many ounces you pumped to save to storage.</p>
        )}

        <div className="feed-drawer__body">
          <div className="baby-picker-row">
            {babyIds.map((id) => {
              const baby = resolveBaby(babies, id)
              const busy = !isPump && id !== draft.babyId && hasActiveBaby(id)
              const selected = !isPump && draft.babyId === id
              return (
                <BabyAvatar
                  key={id}
                  baby={baby}
                  size="lg"
                  showName
                  selected={selected}
                  onClick={() => {
                    if (busy) return
                    if (isPump) {
                      onSwitchBaby(id)
                      return
                    }
                    if (id !== draft.babyId) onSwitchBaby(id)
                  }}
                />
              )
            })}
            <button
              type="button"
              className={`breast-circle-btn breast-circle-btn--modal feed-kind-btn feed-kind-btn--pump${isPump ? ' feed-kind-btn--active' : ''}`}
              disabled={pumpBusy}
              onClick={() =>
                onDraftChange({
                  kind: 'pump',
                  babyId: resolvePumpBabyId(babyIds),
                  sides: [],
                  side: null,
                  volumeOz: '',
                  timerStartedAt: null,
                  awaitingVolume: false,
                })
              }
              aria-label="Pump"
              aria-pressed={isPump}
            >
              <PumpIcon size={68} />
            </button>
          </div>

          {!isBottle && (
            <SideTogglePicker
              sides={draft.sides}
              onChange={(sides) => onDraftChange({ sides, side: sidesToNursingSide(sides) })}
              showBottle={isNursing}
              bottleSelected={false}
              onBottleSelect={
                isNursing
                  ? () => {
                      const now = format(new Date(), 'HH:mm')
                      onDraftChange({
                        kind: 'bottle',
                        sides: [],
                        side: null,
                        startTime: now,
                        endTime: now,
                        defaultDate: todayLocalDateString(),
                        timerStartedAt: null,
                        bottleMilkDeductions: [],
                      })
                    }
                  : undefined
              }
            />
          )}

          {isBottle && (
            <SideTogglePicker
              sides={draft.sides}
              onChange={(sides) =>
                onDraftChange({
                  kind: 'nursing',
                  sides,
                  side: sidesToNursingSide(sides),
                  volumeOz: '',
                })
              }
              showBottle
              bottleSelected
              onBottleSelect={() =>
                onDraftChange({
                  kind: 'nursing',
                  sides: [],
                  side: null,
                  volumeOz: '',
                })
              }
            />
          )}

          {(isNursing || isPump) && (
            <div className="time-fields time-fields--with-timer">
              <div className="time-field time-field--timer">
                <span className="field-label">Timer</span>
                <button
                  type="button"
                  className={`feed-timer-btn${timerRunning ? ' feed-timer-btn--pause' : ''}${timerPaused ? ' feed-timer-btn--paused' : ''}`}
                  onClick={handleTimerClick}
                  disabled={syncing || saving}
                  aria-label={timerRunning ? 'Pause timer' : timerPaused ? 'Resume timer' : 'Start timer'}
                >
                  {timerRunning ? <Pause size={22} aria-hidden /> : <Play size={22} aria-hidden />}
                </button>
              </div>
              <div className="time-field">
                <TimePickerField
                  label="Start"
                  value={draft.startTime}
                  onChange={(startTime) => onDraftChange({ startTime })}
                  disabled={syncing || saving}
                  context={{
                    startTime: draft.startTime,
                    stopTime: draft.endTime,
                  }}
                />
              </div>
              <div className="time-field">
                <TimePickerField
                  label="Stop"
                  value={draft.endTime}
                  onChange={(endTime) => {
                    onDraftChange({ endTime })
                    if (!endTime || !onSyncEndTime) return
                    if (timerRunning || timerPaused || (!!draft.feedingId && !!draft.startTime)) {
                      void onSyncEndTime(endTime)
                    }
                  }}
                  disabled={syncing || saving}
                  context={{
                    startTime: draft.startTime,
                    stopTime: draft.endTime,
                  }}
                />
              </div>
              <FeedDateButton
                value={draft.defaultDate}
                onChange={(defaultDate) => onDraftChange({ defaultDate })}
                disabled={syncing || saving}
              />
            </div>
          )}

          {isBottle && (
            <div className="bottle-feed-row">
              <label className="volume-field bottle-feed-row__volume">
                <span className="field-label">Ounces given</span>
                <input
                  type="number"
                  className="input"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={draft.volumeOz}
                  onChange={(e) =>
                    onDraftChange({ volumeOz: e.target.value, bottleMilkDeductions: [] })
                  }
                  placeholder="0.0"
                  autoFocus
                />
              </label>
              <FeedDateButton
                value={draft.defaultDate}
                onChange={(defaultDate) => onDraftChange({ defaultDate })}
                disabled={syncing || saving}
              />
            </div>
          )}

          {isBottle && bottleDeductions.length > 0 && (
            <BottleFeedSelectedBags deductions={bottleDeductions} lots={milkLots} />
          )}

          {isBottle && (parseVolumeOzInput(draft.volumeOz) ?? 0) > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn--link bottle-feed-choose-bags"
              onClick={openBottleSourcePicker}
              disabled={saving || syncing}
            >
              {bottleDeductions.length > 0 ? 'Change milk bag(s)' : 'Choose milk bag(s)'}
            </button>
          )}

          {(isPump && (draftNeedsVolume(draft) || draft.volumeOz || mode === 'edit-completed')) && (
            <label className="volume-field">
              <span className="field-label">Ounces pumped</span>
              <input
                type="number"
                className="input"
                min={0}
                step="any"
                inputMode="decimal"
                value={draft.volumeOz}
                onChange={(e) => onDraftChange({ volumeOz: e.target.value })}
                placeholder="0.0"
                autoFocus={draftNeedsVolume(draft)}
              />
            </label>
          )}

          {isPump && (
            <div className="pump-stored-row">
              <label className="time-field pump-stored-row__date">
                <span className="field-label">Stored date</span>
                <DatePickerField
                  value={draft.storedDate}
                  onChange={(storedDate) => onDraftChange({ storedDate })}
                  className="input input--date-compact"
                  compact
                />
              </label>
              <div className="storage-icon-toggle pump-stored-row__storage" role="group" aria-label="Storage location">
                <button
                  type="button"
                  className={`storage-icon-btn storage-icon-btn--fridge${draft.milkStorage === 'fridge' ? ' storage-icon-btn--active' : ''}`}
                  aria-label="Fridge"
                  aria-pressed={draft.milkStorage === 'fridge'}
                  onClick={() => onDraftChange({ milkStorage: 'fridge' })}
                >
                  <FridgeIcon size={78} />
                </button>
                <button
                  type="button"
                  className={`storage-icon-btn storage-icon-btn--frozen${draft.milkStorage === 'frozen' ? ' storage-icon-btn--active' : ''}`}
                  aria-label="Frozen"
                  aria-pressed={draft.milkStorage === 'frozen'}
                  onClick={() => onDraftChange({ milkStorage: 'frozen' })}
                >
                  <IceCubeIcon size={78} />
                </button>
              </div>
            </div>
          )}

          <label className="note-field">
            <span className="field-label">
              <StickyNote size={14} aria-hidden /> Note
            </span>
            <input
              type="text"
              className="input"
              value={draft.note}
              onChange={(e) => onDraftChange({ note: e.target.value })}
              placeholder="Optional"
            />
          </label>

          {!isPump && !draft.showWeight ? (
            <button type="button" className="btn btn-ghost btn--link" onClick={() => onDraftChange({ showWeight: true })}>
              <Scale size={16} aria-hidden />
              Add weight
            </button>
          ) : !isPump ? (
            <div className="weight-fields">
              <span className="field-label">Weight</span>
              <div className="weight-fields__row">
                <input
                  type="number"
                  className="input input--small"
                  placeholder="lb"
                  min={0}
                  value={draft.weightLb}
                  onChange={(e) => onDraftChange({ weightLb: e.target.value })}
                  aria-label="Pounds"
                />
                <input
                  type="number"
                  className="input input--small"
                  placeholder="oz"
                  min={0}
                  max={15}
                  value={draft.weightOz}
                  onChange={(e) => onDraftChange({ weightOz: e.target.value })}
                  aria-label="Ounces"
                />
              </div>
            </div>
          ) : null}

          {error && <p className="error-text">{error}</p>}

          {canAddTandem && onStartTandem && mode === 'active' && (
            <button type="button" className="btn btn-ghost feed-drawer__tandem" onClick={onStartTandem}>
              + Start tandem feed
            </button>
          )}
        </div>

        <footer className="modal__footer feed-drawer__footer">
          <button
            type="button"
            className="btn btn-primary btn--grow"
            onClick={() => void handleFooterAction()}
            disabled={saving || syncing || (showStartSession ? false : !draftCanSave(draft))}
          >
            {saving
              ? showStartSession
                ? 'Starting…'
                : 'Saving…'
              : showStartSession
                ? 'Start Session'
                : showStopAndSave
                  ? 'Stop and Save'
                  : 'Save'}
          </button>
          <button
            type="button"
            className="feed-discard-btn"
            onClick={handleDiscard}
            disabled={saving || syncing}
            aria-label="Discard"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </footer>
      </div>
      {bottleSourceOpen &&
        (() => {
          const vol = parseVolumeOzInput(draft.volumeOz)
          if (vol == null || vol <= 0) return null
          return (
            <BottleMilkSourceSheet
              lots={milkLots}
              volumeOz={vol}
              initialDeductions={bottleDeductions}
              onClose={() => setBottleSourceOpen(false)}
              onConfirm={(deductions) => {
                setBottleSourceOpen(false)
                onDraftChange({ bottleMilkDeductions: deductions })
                void performSave({ bottleMilkDeductions: deductions })
              }}
            />
          )
        })()}
      {pumpPromptOpen && (
        <PumpVolumePrompt
          milkLots={milkLots}
          initialVolume={draft.volumeOz}
          initialStorage={draft.milkStorage ?? defaultMilkStorage()}
          saving={saving}
          onCancel={() => setPumpPromptOpen(false)}
          onConfirm={async (result) => {
            setPumpPromptOpen(false)
            await performSave({
              volumeOz: String(result.volume),
              milkStorage: result.storage,
              milkBagVolumes: result.milkBagVolumes,
              addToLotId: result.addToLotId,
            })
          }}
          onAddLater={async () => {
            setPumpPromptOpen(false)
            await performSave({ skipVolume: true })
          }}
        />
      )}
    </>
  )
}
