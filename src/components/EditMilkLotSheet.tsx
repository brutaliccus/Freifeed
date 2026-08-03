import { useMemo, useState } from 'react'
import { addDays, addMonths, format } from 'date-fns'
import {
  formatVolumeOz,
  parseVolumeOzInput,
  roundVolumeOz,
} from '../lib/feedingTypes'
import {
  FRIDGE_STORAGE_DAYS,
  FROZEN_STORAGE_MONTHS,
  formatMilkTimeRemaining,
} from '../lib/milkExpiration'
import { updateMilkLotBackground } from '../lib/milkLots'
import {
  combineDateAndTime,
  dateToTimeInputValue,
  parseDayLocal,
  timestampToDate,
} from '../lib/time'
import { TimePickerField } from './TimePickerField'
import type { MilkLot } from '../types'

interface EditMilkLotSheetProps {
  householdId: string
  lot: MilkLot
  onClose: () => void
  onSaved: () => void
}

function storedDateString(lot: MilkLot): string {
  const stored = timestampToDate(lot.storedAt)
  if (!stored) return format(new Date(), 'yyyy-MM-dd')
  return format(stored, 'yyyy-MM-dd')
}

export function EditMilkLotSheet({ householdId, lot, onClose, onSaved }: EditMilkLotSheetProps) {
  const initialTotal = formatVolumeOz(lot.volumeOz) || String(lot.volumeOz)
  const initialRemaining = formatVolumeOz(lot.remainingOz) || String(lot.remainingOz)
  const initialStored = timestampToDate(lot.storedAt)

  const [totalOz, setTotalOz] = useState(initialTotal)
  const [remainingOz, setRemainingOz] = useState(initialRemaining)
  const [storedDate, setStoredDate] = useState(storedDateString(lot))
  const [storedTime, setStoredTime] = useState(() => dateToTimeInputValue(initialStored) || '12:00')
  const [note, setNote] = useState(lot.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const parsedTotal = useMemo(() => parseVolumeOzInput(totalOz), [totalOz])
  const parsedRemaining = useMemo(() => parseVolumeOzInput(remainingOz), [remainingOz])
  const parsedStoredAt = useMemo(
    () => combineDateAndTime(parseDayLocal(storedDate), storedTime),
    [storedDate, storedTime],
  )

  const expirationPreview = useMemo(() => {
    if (!parsedStoredAt) return null
    const expiresAt =
      lot.storage === 'fridge'
        ? addDays(parsedStoredAt, FRIDGE_STORAGE_DAYS)
        : addMonths(parsedStoredAt, FROZEN_STORAGE_MONTHS)
    const remainingMs = expiresAt.getTime() - Date.now()
    return {
      expiresAt,
      label: formatMilkTimeRemaining(remainingMs),
    }
  }, [parsedStoredAt, lot.storage])

  const handleTotalChange = (raw: string) => {
    setError(null)
    setTotalOz(raw)
    const nextTotal = parseVolumeOzInput(raw)
    const prevTotal = roundVolumeOz(lot.volumeOz)
    const prevRemaining = roundVolumeOz(lot.remainingOz)
    if (
      nextTotal != null &&
      raw.trim() &&
      Math.abs(prevRemaining - prevTotal) < 0.001
    ) {
      setRemainingOz(formatVolumeOz(nextTotal) || String(nextTotal))
    }
  }

  const handleSave = () => {
    const total = parseVolumeOzInput(totalOz)
    const remaining = parseVolumeOzInput(remainingOz)
    if (total == null || total <= 0) {
      setError('Enter a bag total greater than 0 oz')
      return
    }
    if (remaining == null || remaining < 0) {
      setError('Enter how much milk is left in the bag')
      return
    }
    if (remaining > total + 0.001) {
      setError('Remaining cannot be more than the bag total')
      return
    }
    if (!parsedStoredAt) {
      setError('Choose when this milk was stored')
      return
    }

    setError(null)
    const storedChanged =
      !initialStored || parsedStoredAt.getTime() !== initialStored.getTime()
    updateMilkLotBackground(householdId, lot.id, {
      volumeOz: total,
      remainingOz: remaining,
      note: note.trim() || null,
      storedAt: storedChanged ? parsedStoredAt : undefined,
    })
    onSaved()
    onClose()
  }

  const storageLabel = lot.storage === 'fridge' ? 'refrigerated' : 'frozen'

  return (
    <div className="modal-overlay transfer-freezer-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet transfer-freezer-sheet"
        role="dialog"
        aria-labelledby="edit-milk-lot-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header transfer-freezer-sheet__header">
          <h2 id="edit-milk-lot-title">Edit {storageLabel} bag</h2>
        </header>

        <div className="transfer-freezer-sheet__scroll">
          <p className="transfer-freezer-sheet__hint muted">
            Fix mistaken volumes or the stored date. Remaining is what is left in the bag; stored
            date sets when this milk expires.
          </p>

          <div className="transfer-freezer-sheet__field">
            <span className="field-label">Stored</span>
            <div className="quick-add-milk-sheet__datetime">
              <input
                type="date"
                className="input"
                value={storedDate}
                onChange={(e) => {
                  setError(null)
                  setStoredDate(e.target.value)
                }}
              />
              <TimePickerField
                label="Time"
                showLabel={false}
                className="input quick-add-milk-sheet__time"
                value={storedTime}
                onChange={(value) => {
                  setError(null)
                  setStoredTime(value)
                }}
              />
            </div>
            {expirationPreview && (
              <p className="edit-milk-lot-sheet__expiry muted">
                Expires {format(expirationPreview.expiresAt, 'EEE, MMM d h:mm a')} (
                {expirationPreview.label})
              </p>
            )}
          </div>

          <label className="transfer-freezer-sheet__field">
            <span className="field-label">Bag total (oz)</span>
            <input
              type="number"
              className="input"
              min={0}
              step="any"
              inputMode="decimal"
              value={totalOz}
              onChange={(e) => handleTotalChange(e.target.value)}
            />
          </label>

          <label className="transfer-freezer-sheet__field">
            <span className="field-label">Remaining (oz)</span>
            <input
              type="number"
              className="input"
              min={0}
              max={parsedTotal ?? undefined}
              step="any"
              inputMode="decimal"
              value={remainingOz}
              onChange={(e) => {
                setError(null)
                setRemainingOz(e.target.value)
              }}
            />
          </label>

          <button
            type="button"
            className="btn btn-secondary edit-milk-lot-sheet__full-btn"
            onClick={() => {
              setError(null)
              if (parsedTotal != null) {
                setRemainingOz(formatVolumeOz(parsedTotal) || String(parsedTotal))
              }
            }}
            disabled={parsedTotal == null}
          >
            Mark as full bag
          </button>

          <label className="transfer-freezer-sheet__field">
            <span className="field-label">Note (optional)</span>
            <input
              type="text"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
            />
          </label>

          {error && <p className="error-text">{error}</p>}
        </div>

        <footer className="modal__footer transfer-freezer-sheet__footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={parsedTotal == null || parsedRemaining == null}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
