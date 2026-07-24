import { useEffect, useMemo, useState } from 'react'
import { ThemedRadio } from './ThemedRadio'
import { updateAppSettings } from '../lib/household'
import {
  applyUiScale,
  applyUiScalePreview,
  computeAutoUiScale,
  resolveHomePrimaryAction,
  resolveUserScaleMultiplier,
} from '../lib/appPreferences'
import { resolveNavTrackers } from '../lib/trackers'
import type { HomePrimaryAction, UserProfile } from '../types'
import { DEFAULT_UI_SCALE, UI_SCALE_MAX, UI_SCALE_MIN } from '../types'

const PRIMARY_OPTIONS: { key: HomePrimaryAction; label: string }[] = [
  { key: 'nursing', label: 'Nursing' },
  { key: 'milk', label: 'Milk storage' },
  { key: 'diaper', label: 'Diapers' },
  { key: 'medicine', label: 'Medicine' },
]

interface HomeAppPreferencesSettingsProps {
  profile: UserProfile | null
  onUpdated: () => void
}

export function HomeAppPreferencesSettings({ profile, onUpdated }: HomeAppPreferencesSettingsProps) {
  const nav = useMemo(() => resolveNavTrackers(profile), [profile?.navTrackers])
  const resolvedPrimary = resolveHomePrimaryAction(profile, nav)
  const resolvedScale = resolveUserScaleMultiplier(profile)
  const autoScalePercent = Math.round(computeAutoUiScale() * 100)

  const [primary, setPrimary] = useState<HomePrimaryAction>(resolvedPrimary)
  const [uiScale, setUiScale] = useState(resolvedScale)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profilePrimary = profile?.homePrimaryAction
  const profileUiScale = profile?.uiScale
  const navKey = JSON.stringify(profile?.navTrackers ?? {})

  useEffect(() => {
    const nextNav = resolveNavTrackers(profile)
    setPrimary(resolveHomePrimaryAction(profile, nextNav))
    setUiScale(resolveUserScaleMultiplier(profile))
  }, [profile, profilePrimary, profileUiScale, navKey])

  useEffect(() => {
    return () => applyUiScale(profile)
  }, [profile, profileUiScale])

  const scalePercent = Math.round(uiScale * 100)
  const effectivePercent = Math.round(computeAutoUiScale() * uiScale * 100)

  const dirty =
    primary !== resolvedPrimary || Math.abs(uiScale - resolvedScale) > 0.001

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateAppSettings({ homePrimaryAction: primary, uiScale })
      onUpdated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="profile-section">
      <h2>Home screen</h2>
      <p className="muted">
        Choose which tracker uses the large button on Home. Other enabled trackers appear as smaller
        shortcuts below it.
      </p>
      <fieldset className="home-primary-picker">
        <legend className="field-label">Main button</legend>
        <div className="home-primary-picker__options" role="radiogroup" aria-label="Main home button">
          {PRIMARY_OPTIONS.map(({ key, label }) => {
            const enabled = nav[key]
            return (
              <div
                key={key}
                className={`home-primary-picker__option home-primary-picker__option--themed${!enabled ? ' home-primary-picker__option--disabled' : ''}`}
              >
                <ThemedRadio
                  checked={primary === key}
                  disabled={!enabled || saving}
                  onChange={() => setPrimary(key)}
                  aria-label={label}
                />
                <span>{label}</span>
              </div>
            )
          })}
        </div>
        {!nav[primary] && (
          <p className="muted home-primary-picker__hint">
            Turn on this tracker under Navigation below to use it as the main button.
          </p>
        )}
      </fieldset>

      <label className="field ui-scale-field">
        <span className="field-label">
          Size adjustment ({scalePercent}% — about {effectivePercent}% on this screen)
        </span>
        <p className="muted ui-scale-field__hint">
          The app auto-fits to your screen ({autoScalePercent}%). Move the slider to make everything
          smaller or larger on top of that.
        </p>
        <input
          type="range"
          className="ui-scale-slider"
          min={UI_SCALE_MIN * 100}
          max={UI_SCALE_MAX * 100}
          step={5}
          value={scalePercent}
          disabled={saving}
          onChange={(e) => {
            const next = Number(e.target.value) / 100
            setUiScale(next)
            applyUiScalePreview(next)
          }}
        />
        <div className="ui-scale-field__labels muted">
          <span>Smaller</span>
          <span>Default ({Math.round(DEFAULT_UI_SCALE * 100)}%)</span>
          <span>Larger</span>
        </div>
      </label>

      {error && <p className="error-text">{error}</p>}
      <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
        {saving ? 'Saving…' : 'Save home & display'}
      </button>
    </section>
  )
}
