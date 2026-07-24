import type { Baby, TrackerKey, TrackerVisibility, UserProfile } from '../types'
import { DEFAULT_TRACKER_VISIBILITY } from '../types'

export function resolveNavTrackers(profile: UserProfile | null): TrackerVisibility {
  return { ...DEFAULT_TRACKER_VISIBILITY, ...profile?.navTrackers }
}

export function resolveBabyTrackers(baby: Baby): TrackerVisibility {
  return { ...DEFAULT_TRACKER_VISIBILITY, ...baby.trackerVisibility }
}

export function babyShowsTracker(baby: Baby, key: TrackerKey): boolean {
  return resolveBabyTrackers(baby)[key]
}

export function babiesForTracker(babies: Baby[], key: TrackerKey): Baby[] {
  if (babies.length === 0) return babies
  return babies.filter((b) => babyShowsTracker(b, key))
}

/** Babies with a home-screen status card (independent of nursing tracker). */
export function babiesForHome(babies: Baby[]): Baby[] {
  if (babies.length === 0) return babies
  return babies.filter((b) => b.showOnHome !== false)
}

export function memberShowsOnHome(
  memberUid: string,
  memberShowOnHome: Record<string, boolean> | undefined,
): boolean {
  return memberShowOnHome?.[memberUid] === true
}

export function isNavTrackerEnabled(
  profile: UserProfile | null,
  key: TrackerKey,
): boolean {
  return resolveNavTrackers(profile)[key]
}
