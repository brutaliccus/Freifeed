import { useEffect, useState } from 'react'
import { ThemedCheckbox } from './ThemedCheckbox'
import { updateBaby } from '../lib/household'
import { resolveBabyTrackers } from '../lib/trackers'
import type { Baby, TrackerKey, TrackerVisibility } from '../types'

const TRACKER_ITEMS: { key: TrackerKey; label: string }[] = [
  { key: 'nursing', label: 'Nursing & feeding timeline' },
  { key: 'milk', label: 'Milk / bottle tracking' },
  { key: 'diaper', label: 'Diaper tracker' },
  { key: 'medicine', label: 'Medicine' },
  { key: 'notes', label: 'Notes' },
  { key: 'measurements', label: 'Measurements' },
]

interface BabyTrackerSettingsProps {
  baby: Baby
  householdId: string
  onUpdated: () => void
}

export function BabyTrackerSettings({ baby, householdId, onUpdated }: BabyTrackerSettingsProps) {
  const resolved = resolveBabyTrackers(baby)
  const resolvedShowOnHome = baby.showOnHome !== false
  const [settings, setSettings] = useState<TrackerVisibility>(resolved)
  const [showOnHome, setShowOnHome] = useState(resolvedShowOnHome)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSettings(resolveBabyTrackers(baby))
    setShowOnHome(baby.showOnHome !== false)
  }, [baby])

  const toggle = (key: TrackerKey) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateBaby(householdId, baby.id, { trackerVisibility: settings, showOnHome })
      onUpdated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    TRACKER_ITEMS.some(({ key }) => settings[key] !== resolved[key]) ||
    showOnHome !== resolvedShowOnHome

  return (
    <div className="baby-tracker-settings">
      <div className="tracker-toggle-list__item tracker-toggle-list__item--home">
        <div className="tracker-toggle tracker-toggle--themed">
          <ThemedCheckbox
            checked={showOnHome}
            disabled={saving}
            onChange={() => setShowOnHome((v) => !v)}
            aria-label={`Show ${baby.name} on home screen`}
          />
          <span className="tracker-toggle__text">
            <span className="tracker-toggle__label">Show on home screen</span>
            <span className="tracker-toggle__hint muted">
              Status card on Home (separate from nursing tracker below).
            </span>
          </span>
        </div>
      </div>

      <span className="field-label">Show on trackers</span>
      <p className="muted baby-tracker-settings__hint">
        Turn off trackers this child does not use (for example, medicine only for an older sibling).
      </p>
      <ul className="tracker-toggle-list">
        {TRACKER_ITEMS.map(({ key, label }) => (
          <li key={key} className="tracker-toggle-list__item">
            <div className="tracker-toggle tracker-toggle--themed">
              <ThemedCheckbox
                checked={settings[key]}
                disabled={saving}
                onChange={() => toggle(key)}
                aria-label={label}
              />
              <span className="tracker-toggle__label">{label}</span>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="error-text">{error}</p>}
      <button
        type="button"
        className="btn btn-secondary baby-tracker-settings__save"
        onClick={() => void save()}
        disabled={saving || !dirty}
      >
        {saving ? 'Saving…' : 'Save tracker visibility'}
      </button>
    </div>
  )
}
