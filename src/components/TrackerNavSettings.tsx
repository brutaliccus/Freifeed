import { useEffect, useState } from 'react'
import { ThemedCheckbox } from './ThemedCheckbox'
import { updateNavTrackers } from '../lib/household'
import { resolveNavTrackers } from '../lib/trackers'
import type { TrackerKey, TrackerVisibility, UserProfile } from '../types'

const NAV_ITEMS: { key: TrackerKey; label: string; hint: string }[] = [
  { key: 'nursing', label: 'Nursing timeline', hint: 'Daily feeding timeline tab' },
  { key: 'milk', label: 'Milk storage', hint: 'Milk inventory tab' },
  { key: 'diaper', label: 'Diaper tracker', hint: 'Diaper log and timeline tab' },
  { key: 'medicine', label: 'Medicine', hint: 'Medicine list tab' },
  { key: 'notes', label: 'Notes', hint: 'Baby notes tab' },
  { key: 'measurements', label: 'Measurements', hint: 'Growth measurements tab' },
]

interface TrackerNavSettingsProps {
  profile: UserProfile | null
  onUpdated: () => void
}

export function TrackerNavSettings({ profile, onUpdated }: TrackerNavSettingsProps) {
  const resolved = resolveNavTrackers(profile)
  const [settings, setSettings] = useState<TrackerVisibility>(resolved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSettings(resolveNavTrackers(profile))
  }, [profile])

  const toggle = (key: TrackerKey) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateNavTrackers(settings)
      onUpdated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const dirty = NAV_ITEMS.some(({ key }) => settings[key] !== resolved[key])

  return (
    <section className="profile-section">
      <h2>Navigation</h2>
      <p className="muted">Choose which trackers appear in the bottom bar. Home is always shown; profile is on the home screen.</p>
      <ul className="tracker-toggle-list">
        {NAV_ITEMS.map(({ key, label, hint }) => (
          <li key={key} className="tracker-toggle-list__item">
            <div className="tracker-toggle tracker-toggle--themed">
              <ThemedCheckbox
                checked={settings[key]}
                disabled={saving}
                onChange={() => toggle(key)}
                aria-label={label}
              />
              <span className="tracker-toggle__text">
                <span className="tracker-toggle__label">{label}</span>
                <span className="tracker-toggle__hint muted">{hint}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="error-text">{error}</p>}
      <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
        {saving ? 'Saving…' : 'Save navigation'}
      </button>
    </section>
  )
}
