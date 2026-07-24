import type { HomePrimaryAction, HomeHubAction, TrackerKey, TrackerVisibility, UserProfile } from '../types'
import {
  DEFAULT_HOME_PRIMARY_ACTION,
  DEFAULT_UI_SCALE,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from '../types'

/** Reference phone layout (CSS px) — scale down on smaller viewports. */
const REF_VIEWPORT_WIDTH = 390
const REF_VIEWPORT_HEIGHT = 760
const UI_BASE_PX = 16.2
const MIN_BASE_PX = 12
const MAX_BASE_PX = 20

const FEED_TRACKER_KEYS: HomePrimaryAction[] = ['nursing', 'milk', 'diaper', 'medicine']

const TRACKER_KEYS: TrackerKey[] = [...FEED_TRACKER_KEYS, 'notes', 'measurements']

const HOME_HUB_KEYS: HomeHubAction[] = [
  'nursing',
  'milk',
  'diaper',
  'medicine',
  'notes',
  'measurements',
]

/** Viewport fit factor (≤1 on smaller/shorter screens). */
export function computeAutoUiScale(): number {
  if (typeof window === 'undefined') return 1
  let w = window.innerWidth
  if (
    document.documentElement.classList.contains('platform-web') &&
    window.innerWidth >= 769
  ) {
    w = window.innerWidth / 3
  }
  const h = window.innerHeight
  const factor = Math.min(1, w / REF_VIEWPORT_WIDTH, h / REF_VIEWPORT_HEIGHT)
  return Math.max(0.72, factor)
}

/** User preference multiplier from profile (1 = no adjustment). */
export function resolveUserScaleMultiplier(profile: UserProfile | null): number {
  const raw = profile?.uiScale
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_UI_SCALE
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, raw))
}

/** @deprecated Use resolveUserScaleMultiplier */
export function resolveUiScale(profile: UserProfile | null): number {
  return resolveUserScaleMultiplier(profile)
}

export function resolveEffectiveUiScale(profile: UserProfile | null): number {
  return computeAutoUiScale() * resolveUserScaleMultiplier(profile)
}

function basePxForScale(scale: number): number {
  return Math.min(MAX_BASE_PX, Math.max(MIN_BASE_PX, UI_BASE_PX * scale))
}

export function applyUiScale(profile: UserProfile | null): void {
  if (typeof document === 'undefined') return
  const basePx = basePxForScale(resolveEffectiveUiScale(profile))
  document.documentElement.style.setProperty('--ui-base', `${basePx}px`)
}

/** Live preview while adjusting the slider (before save). */
export function applyUiScalePreview(userMultiplier: number): void {
  if (typeof document === 'undefined') return
  const mult = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, userMultiplier))
  const basePx = basePxForScale(computeAutoUiScale() * mult)
  document.documentElement.style.setProperty('--ui-base', `${basePx}px`)
}

export function resolveHomePrimaryAction(
  profile: UserProfile | null,
  nav: TrackerVisibility,
): HomePrimaryAction {
  const preferred = profile?.homePrimaryAction ?? DEFAULT_HOME_PRIMARY_ACTION
  if (nav[preferred]) return preferred
  const first = FEED_TRACKER_KEYS.find((k) => nav[k])
  return first ?? DEFAULT_HOME_PRIMARY_ACTION
}

export function homeShortcutActions(
  nav: TrackerVisibility,
  primary: HomePrimaryAction,
): TrackerKey[] {
  return TRACKER_KEYS.filter((k) => nav[k] && k !== primary)
}

/** All enabled quick-add actions for the home radial hub (feed trackers + notes + measurements). */
export function homeHubActions(
  nav: TrackerVisibility,
  primary: HomePrimaryAction,
): HomeHubAction[] {
  return HOME_HUB_KEYS.filter((k) => {
    if (!nav[k]) return false
    if (k === primary) return false
    return true
  })
}

/**
 * Radial slot angles for CSS rotate→translateY orbit (0° = straight down / bottom center).
 * First button at bottom center; additional buttons alternate left/right.
 */
export function radialHubPositions(count: number): number[] {
  if (count <= 0) return []
  const step = Math.min(28, Math.max(24, 130 / count))
  if (count === 1) return [0]
  if (count === 2) return [-step, step]

  const angles: number[] = [0]
  for (let i = 1; i < count; i++) {
    const ring = Math.ceil(i / 2)
    const side = i % 2 === 1 ? -1 : 1
    angles.push(side * ring * step)
  }
  return angles
}
