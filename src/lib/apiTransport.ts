import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { getApiBase, isApiMode } from './apiMode'
import { authHeaders, clearSession } from './sessionAuth'
import { withCallableRetry } from './callableRetry'

export class ApiHttpError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiHttpError'
    this.code = code.startsWith('functions/') ? code : `functions/${code}`
  }
}

/**
 * Invoke a backend operation. Firebase callable when VITE_API_BASE is unset;
 * POST /api/{name} with Bearer session when set. Returns the same `{ data }` shape
 * as httpsCallable so api.ts stays mechanical.
 */
export async function invokeBackend<TReq, TRes>(
  name: string,
  payload?: TReq,
): Promise<{ data: TRes }> {
  if (!isApiMode()) {
    const fn = httpsCallable<TReq, TRes>(functions, name)
    return withCallableRetry(() => fn(payload as TReq))
  }

  return withCallableRetry(async () => {
    const base = getApiBase()!
    const res = await fetch(`${base}/api/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(payload ?? {}),
    })

    const body = (await res.json().catch(() => null)) as
      | (TRes & { error?: { code?: string; message?: string } })
      | { error?: { code?: string; message?: string } }
      | null

    if (res.status === 401) {
      clearSession()
    }

    if (!res.ok) {
      const code = body && typeof body === 'object' && body.error?.code
        ? String(body.error.code)
        : res.status === 401
          ? 'unauthenticated'
          : res.status === 403
            ? 'permission-denied'
            : res.status === 404
              ? 'not-found'
              : 'internal'
      const message =
        body && typeof body === 'object' && body.error?.message
          ? String(body.error.message)
          : `Request failed (${res.status})`
      throw new ApiHttpError(code, message)
    }

    return { data: body as TRes }
  })
}
