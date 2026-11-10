const TRANSIENT_CALLABLE_CODES = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/cancelled',
  'functions/resource-exhausted',
  'unavailable',
  'deadline-exceeded',
  // Network / fetch failures mapped by apiTransport or browsers
  'functions/network-error',
])

/** Permanent failures must not be retried endlessly (validation, auth, not-found, etc.). */
const PERMANENT_CALLABLE_CODES = new Set([
  'functions/unauthenticated',
  'functions/permission-denied',
  'functions/not-found',
  'functions/invalid-argument',
  'functions/failed-precondition',
  'functions/already-exists',
  'functions/out-of-range',
  'unauthenticated',
  'permission-denied',
  'not-found',
  'invalid-argument',
  'failed-precondition',
  'already-exists',
])

const RETRY_DELAYS_MS = [350, 900, 1800] as const

function errorCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err
    ? String((err as { code: string }).code)
    : ''
}

export function isTransientCallableError(err: unknown): boolean {
  const code = errorCode(err)
  if (PERMANENT_CALLABLE_CODES.has(code)) return false
  return TRANSIENT_CALLABLE_CODES.has(code)
}

export function isPermanentCallableError(err: unknown): boolean {
  const code = errorCode(err)
  if (PERMANENT_CALLABLE_CODES.has(code)) return true
  // Explicitly not transient and not a network blip → treat as permanent.
  if (!code) return false
  return !isTransientCallableError(err) && code.startsWith('functions/')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Retry cloud function / API reads/writes that often fail on cold start or brief network blips. */
export async function withCallableRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const canRetry = isTransientCallableError(err) && attempt < RETRY_DELAYS_MS.length
      if (!canRetry) throw err
      await sleep(RETRY_DELAYS_MS[attempt]!)
    }
  }
  throw lastErr
}
