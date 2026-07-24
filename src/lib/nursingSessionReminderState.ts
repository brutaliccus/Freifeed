import { normalizeFeedStartIso } from './feedNotifications'

const STORAGE_KEY = 'freifeed-nursing-session-reminder-alerted'

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((k): k is string => typeof k === 'string'))
  } catch {
    return new Set()
  }
}

function writeSet(keys: Set<string>): void {
  try {
    if (keys.size === 0) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    /* ignore */
  }
}

export function nursingSessionReminderKey(babyId: string, startAtIso: string): string {
  return `${babyId}:${normalizeFeedStartIso(startAtIso)}`
}

export function hasNursingSessionReminderBeenAlerted(sessionKey: string): boolean {
  return readSet().has(sessionKey)
}

export function markNursingSessionReminderAlerted(sessionKey: string): void {
  const keys = readSet()
  keys.add(sessionKey)
  writeSet(keys)
}

export function clearNursingSessionReminderAlerted(sessionKey: string): void {
  const keys = readSet()
  if (!keys.delete(sessionKey)) return
  writeSet(keys)
}

export function clearNursingSessionReminderAlertsForBaby(babyId: string): void {
  const keys = readSet()
  let changed = false
  const prefix = `${babyId}:`
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      keys.delete(key)
      changed = true
    }
  }
  if (changed) writeSet(keys)
}

export function pruneNursingSessionReminderAlerts(activeKeys: Set<string>): void {
  const keys = readSet()
  let changed = false
  for (const key of keys) {
    if (!activeKeys.has(key)) {
      keys.delete(key)
      changed = true
    }
  }
  if (changed) writeSet(keys)
}
