import { useEffect, useState } from 'react'
import { updateAppSettings } from '../lib/household'
import {
  APP_THEME_OPTIONS,
  applyAppTheme,
  resolveAppTheme,
  type AppThemeId,
} from '../lib/theme'
import type { UserProfile } from '../types'

interface ThemeSettingsProps {
  profile: UserProfile | null
  onUpdated: () => void
}

export function ThemeSettings({ profile, onUpdated }: ThemeSettingsProps) {
  const resolved = resolveAppTheme(profile)
  const [selected, setSelected] = useState<AppThemeId>(resolved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(resolved)
  }, [resolved])

  const saveTheme = async (themeId: AppThemeId) => {
    if (themeId === resolved) return
    setError(null)
    setSaving(true)
    try {
      applyAppTheme(themeId)
      await updateAppSettings({ appTheme: themeId })
      onUpdated()
    } catch (e) {
      applyAppTheme(resolved)
      setSelected(resolved)
      setError(e instanceof Error ? e.message : 'Could not save theme')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="profile-section profile-section--themes">
      <h2>Themes</h2>
      <p className="muted">Choose a color palette for the app and Buba logo. All themes stay dark.</p>
      <div className="theme-picker" role="radiogroup" aria-label="App theme">
        {APP_THEME_OPTIONS.map((theme) => {
          const active = selected === theme.id
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`theme-picker__option${active ? ' theme-picker__option--active' : ''}`}
              disabled={saving}
              onClick={() => {
                setSelected(theme.id)
                void saveTheme(theme.id)
              }}
            >
              <span className="theme-picker__swatches" aria-hidden>
                {theme.swatches.map((color) => (
                  <span key={color} className="theme-picker__swatch" style={{ background: color }} />
                ))}
              </span>
              <span className="theme-picker__copy">
                <strong>{theme.label}</strong>
                <span className="muted">{theme.description}</span>
              </span>
            </button>
          )
        })}
      </div>
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}
