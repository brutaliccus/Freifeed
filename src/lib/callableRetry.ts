const TRANSIENT_CALLABLE_CODES = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/cancelled',
  'functions/resource-exhausted',
  'functions/unauthenticated',
  'unavailable',
  'deadline-exceeded',
])

const RETRY_DELAYS_MS = [350, 900, 1800] as const

export function isTransientCallableError(err: unknown): boolean {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: string }).code)
      : ''
  return TRANSIENT_CALLABLE_CODES.has(code)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Retry cloud function reads/writes that often fail on cold start or brief network blips. */
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
