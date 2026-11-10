/** When set, the client talks to the Pi/API backend instead of Firestore/Functions. */
export function getApiBase(): string | null {
  const raw = import.meta.env.VITE_API_BASE
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/\/+$/, '')
  return trimmed || null
}

export function isApiMode(): boolean {
  return getApiBase() != null
}
