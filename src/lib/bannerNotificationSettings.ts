const STORAGE_KEY = 'freifeed-banner-timeout-sec'
const CHANGED_EVENT = 'freifeed-banner-timeout-changed'

export const BANNER_TIMEOUT_DEFAULT_SEC = 10
export const BANNER_TIMEOUT_MIN_SEC = 5
export const BANNER_TIMEOUT_MAX_SEC = 30
export const BANNER_TIMEOUT_STEP_SEC = 5

export function normalizeBannerTimeoutSeconds(value: number): number {
  if (value <= 0) return 0
  const stepped = Math.round(value / BANNER_TIMEOUT_STEP_SEC) * BANNER_TIMEOUT_STEP_SEC
  return Math.min(BANNER_TIMEOUT_MAX_SEC, Math.max(BANNER_TIMEOUT_MIN_SEC, stepped))
}

export function getBannerTimeoutSeconds(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return BANNER_TIMEOUT_DEFAULT_SEC
    const n = Number(raw)
    if (!Number.isFinite(n)) return BANNER_TIMEOUT_DEFAULT_SEC
    if (n <= 0) return 0
    return normalizeBannerTimeoutSeconds(n)
  } catch {
    return BANNER_TIMEOUT_DEFAULT_SEC
  }
}

export function getBannerAutoDismissMs(): number | null {
  const sec = getBannerTimeoutSeconds()
  return sec > 0 ? sec * 1000 : null
}

export function setBannerTimeoutSeconds(seconds: number): void {
  const normalized = seconds <= 0 ? 0 : normalizeBannerTimeoutSeconds(seconds)
  try {
    localStorage.setItem(STORAGE_KEY, String(normalized))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

export function formatBannerTimeoutLabel(seconds: number): string {
  if (seconds <= 0) return 'Off'
  return `${seconds} sec`
}

export function subscribeBannerTimeoutSeconds(listener: () => void): () => void {
  const handler = () => listener()
  window.addEventListener(CHANGED_EVENT, handler)
  return () => window.removeEventListener(CHANGED_EVENT, handler)
}
