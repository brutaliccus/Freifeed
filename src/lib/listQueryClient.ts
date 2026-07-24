/** Default history window for Firestore listeners (days). */
export const DEFAULT_SINCE_DAYS = 30

/** Each "Load more" extends history by this many days. */
export const LOAD_MORE_DAYS = 30

/** Max documents per listener snapshot or load-more batch. */
export const MAX_LIST_LIMIT = 500

/** Default live listener window — keeps cold-open reads reasonable. */
export const LIVE_LIST_LIMIT = 250

/** Timeline / history load-more stops after this many days (avoids runaway DOM). */
export const MAX_HISTORY_DAYS = 120

/** Archive panel default window (days). */
export const DEFAULT_ARCHIVE_DAYS = 30

export function sinceDate(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

export function daysBefore(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}
