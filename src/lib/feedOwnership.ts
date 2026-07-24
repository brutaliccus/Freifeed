const OWNED_KEY = 'freifeed-owned-in-progress-feeds'

function loadOwnedFeedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(OWNED_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function saveOwnedFeedIds(ids: Set<string>): void {
  if (ids.size === 0) {
    localStorage.removeItem(OWNED_KEY)
    return
  }
  localStorage.setItem(OWNED_KEY, JSON.stringify([...ids]))
}

/** Mark a Firestore feeding as started on this device (survives refresh). */
export function markFeedingOwnedByThisDevice(feedingId: string): void {
  const ids = loadOwnedFeedIds()
  ids.add(feedingId)
  saveOwnedFeedIds(ids)
}

export function isFeedingOwnedByThisDevice(feedingId: string): boolean {
  return loadOwnedFeedIds().has(feedingId)
}

export function clearFeedingOwnership(feedingId: string): void {
  const ids = loadOwnedFeedIds()
  if (!ids.delete(feedingId)) return
  saveOwnedFeedIds(ids)
}

export function pruneFeedingOwnership(activeFeedingIds: Iterable<string>): void {
  const active = new Set(activeFeedingIds)
  const ids = loadOwnedFeedIds()
  let changed = false
  for (const id of ids) {
    if (!active.has(id)) {
      ids.delete(id)
      changed = true
    }
  }
  if (changed) saveOwnedFeedIds(ids)
}
