const STORAGE_KEY = 'freifeed-medicine-alert-fired'

type AlertFiredMap = Record<string, number>

function readMap(): AlertFiredMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as AlertFiredMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map: AlertFiredMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/** Due timestamp (ms) we already alerted for, or null if none. */
export function getMedicineAlertFiredDue(medicineId: string): number | null {
  const v = readMap()[medicineId]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Round to minute so slot comparisons stay stable across sessions. */
export function normalizeMedicineDueMs(dueMs: number): number {
  return Math.floor(dueMs / 60_000) * 60_000
}

export function markMedicineAlertFired(medicineId: string, dueMs: number): void {
  const normalized = normalizeMedicineDueMs(dueMs)
  const map = readMap()
  const prev = map[medicineId]
  map[medicineId] =
    typeof prev === 'number' && Number.isFinite(prev) ? Math.max(prev, normalized) : normalized
  writeMap(map)
}

export function clearMedicineAlertFired(medicineId: string): void {
  const map = readMap()
  if (!(medicineId in map)) return
  delete map[medicineId]
  writeMap(map)
}

export function pruneMedicineAlertFired(activeIds: Set<string>): void {
  const map = readMap()
  let changed = false
  for (const id of Object.keys(map)) {
    if (!activeIds.has(id)) {
      delete map[id]
      changed = true
    }
  }
  if (changed) writeMap(map)
}

/** True if we should show a due alert for this dose window (not yet fired for this due time). */
export function shouldAlertMedicineDue(medicineId: string, dueMs: number): boolean {
  const normalized = normalizeMedicineDueMs(dueMs)
  const fired = getMedicineAlertFiredDue(medicineId)
  if (fired == null) return true
  return normalizeMedicineDueMs(fired) < normalized
}

export function getMedicineAlertFiredForSync(): Record<string, number> {
  return readMap()
}

/** Merge remote/native fired map into localStorage (never wipe existing entries). */
export function applyMedicineAlertFiredFromSync(map: Record<string, number> | undefined): void {
  if (!map || typeof map !== 'object') return
  const current = readMap()
  let changed = false
  for (const [id, due] of Object.entries(map)) {
    if (typeof due !== 'number' || !Number.isFinite(due)) continue
    const normalized = normalizeMedicineDueMs(due)
    const prev = current[id]
    if (typeof prev !== 'number' || !Number.isFinite(prev) || normalizeMedicineDueMs(prev) < normalized) {
      current[id] =
        typeof prev === 'number' && Number.isFinite(prev) ? Math.max(prev, normalized) : normalized
      changed = true
    }
  }
  if (changed) writeMap(current)
}
