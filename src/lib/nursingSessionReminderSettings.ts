const ENABLED_KEY = 'freifeed-nursing-session-reminder-enabled'
const MINUTES_KEY = 'freifeed-nursing-session-reminder-minutes'
const CHANGED_EVENT = 'freifeed-nursing-session-reminder-changed'

export const NURSING_SESSION_REMINDER_DEFAULT_MIN = 30
export const NURSING_SESSION_REMINDER_MIN_MIN = 10
export const NURSING_SESSION_REMINDER_MAX_MIN = 60
export const NURSING_SESSION_REMINDER_STEP_MIN = 5

export function normalizeNursingSessionReminderMinutes(value: number): number {
  const stepped =
    Math.round(value / NURSING_SESSION_REMINDER_STEP_MIN) * NURSING_SESSION_REMINDER_STEP_MIN
  return Math.min(
    NURSING_SESSION_REMINDER_MAX_MIN,
    Math.max(NURSING_SESSION_REMINDER_MIN_MIN, stepped),
  )
}

export function getNursingSessionReminderEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true'
  } catch {
    return false
  }
}

export function getNursingSessionReminderMinutes(): number {
  try {
    const raw = localStorage.getItem(MINUTES_KEY)
    if (raw == null) return NURSING_SESSION_REMINDER_DEFAULT_MIN
    const n = Number(raw)
    if (!Number.isFinite(n)) return NURSING_SESSION_REMINDER_DEFAULT_MIN
    return normalizeNursingSessionReminderMinutes(n)
  } catch {
    return NURSING_SESSION_REMINDER_DEFAULT_MIN
  }
}

export function getNursingSessionReminderThresholdMs(): number {
  return getNursingSessionReminderMinutes() * 60_000
}

export function setNursingSessionReminderEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false')
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

export function setNursingSessionReminderMinutes(minutes: number): void {
  const normalized = normalizeNursingSessionReminderMinutes(minutes)
  try {
    localStorage.setItem(MINUTES_KEY, String(normalized))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

export function formatNursingSessionReminderLabel(minutes: number): string {
  return `${minutes} min`
}

export function subscribeNursingSessionReminderSettings(listener: () => void): () => void {
  const handler = () => listener()
  window.addEventListener(CHANGED_EVENT, handler)
  return () => window.removeEventListener(CHANGED_EVENT, handler)
}
