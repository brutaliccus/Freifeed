import type { UserProfile } from '../types'

export type AppThemeId = 'buba' | 'ocean' | 'sage'

export const DEFAULT_APP_THEME: AppThemeId = 'buba'

export const APP_THEME_STORAGE_KEY = 'freifeed-app-theme'

export interface AppThemeOption {
  id: AppThemeId
  label: string
  description: string
  swatches: [string, string, string]
}

export const APP_THEME_OPTIONS: AppThemeOption[] = [
  {
    id: 'buba',
    label: 'Buba',
    description: 'Soft lavender and blush — the original look.',
    swatches: ['#b8a8d8', '#e8b4cc', '#8fb89a'],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Cool navy and steel blue.',
    swatches: ['#6b8fc4', '#7eb3e8', '#5a9aad'],
  },
  {
    id: 'sage',
    label: 'Sage',
    description: 'Muted greens and pastel mint.',
    swatches: ['#a8c9b0', '#b8e8c4', '#9fd4a8'],
  },
]

const VALID_THEMES = new Set<AppThemeId>(APP_THEME_OPTIONS.map((t) => t.id))

export function normalizeAppTheme(raw: unknown): AppThemeId {
  if (typeof raw === 'string' && VALID_THEMES.has(raw as AppThemeId)) {
    return raw as AppThemeId
  }
  return DEFAULT_APP_THEME
}

export function resolveAppTheme(profile: UserProfile | null): AppThemeId {
  if (profile?.appTheme) return normalizeAppTheme(profile.appTheme)
  if (typeof localStorage !== 'undefined') {
    return normalizeAppTheme(localStorage.getItem(APP_THEME_STORAGE_KEY))
  }
  return DEFAULT_APP_THEME
}

export function applyAppTheme(themeId: AppThemeId): void {
  if (typeof document === 'undefined') return
  const theme = normalizeAppTheme(themeId)
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
  } catch {
    /* private browsing */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  const bg =
    theme === 'ocean' ? '#0d1118' : theme === 'sage' ? '#101612' : '#14111a'
  meta?.setAttribute('content', bg)
}

export function initThemeFromStorage(): void {
  applyAppTheme(
    normalizeAppTheme(
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(APP_THEME_STORAGE_KEY)
        : DEFAULT_APP_THEME,
    ),
  )
}

export function applyAppThemeFromProfile(profile: UserProfile | null): void {
  applyAppTheme(resolveAppTheme(profile))
}
