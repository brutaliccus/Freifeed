export type ErrorCode =
  | 'ok'
  | 'cancelled'
  | 'unknown'
  | 'invalid-argument'
  | 'deadline-exceeded'
  | 'not-found'
  | 'already-exists'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'aborted'
  | 'out-of-range'
  | 'unimplemented'
  | 'internal'
  | 'unavailable'
  | 'data-loss'
  | 'unauthenticated'

const HTTP_BY_CODE: Record<ErrorCode, number> = {
  ok: 200,
  cancelled: 499,
  unknown: 500,
  'invalid-argument': 400,
  'deadline-exceeded': 504,
  'not-found': 404,
  'already-exists': 409,
  'permission-denied': 403,
  'resource-exhausted': 429,
  'failed-precondition': 400,
  aborted: 409,
  'out-of-range': 400,
  unimplemented: 501,
  internal: 500,
  unavailable: 503,
  'data-loss': 500,
  unauthenticated: 401,
}

export class HttpsError extends Error {
  readonly code: ErrorCode
  readonly httpStatus: number

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'HttpsError'
    this.code = code
    this.httpStatus = HTTP_BY_CODE[code] ?? 500
  }

  toJSON() {
    return { error: { code: this.code, message: this.message } }
  }
}

export function isHttpsError(err: unknown): err is HttpsError {
  return err instanceof HttpsError
}
