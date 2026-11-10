import { getApiBase } from './apiMode'

const TOKEN_KEY = 'freifeed_api_session_v1'
const USER_KEY = 'freifeed_api_user_v1'

export interface ApiSessionUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getSessionUser(): ApiSessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ApiSessionUser
    if (!parsed || typeof parsed.uid !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('freifeed-api-session-changed'))
}

function persistSession(token: string, user: ApiSessionUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('freifeed-api-session-changed'))
}

/**
 * Exchange a Google ID token for a server JWT (30-day TTL; re-login when expired).
 * Only used when VITE_API_BASE is set.
 */
export async function exchangeGoogleIdToken(idToken: string): Promise<ApiSessionUser> {
  const base = getApiBase()
  if (!base) throw new Error('API base not configured')
  if (typeof idToken !== 'string' || idToken.split('.').length !== 3 || !idToken.trim()) {
    throw new Error('Google sign-in did not return an ID token to exchange.')
  }

  const res = await fetch(`${base}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })

  const body = (await res.json().catch(() => null)) as
    | { token?: string; user?: ApiSessionUser; error?: { code?: string; message?: string } }
    | null

  if (!res.ok || !body?.token || !body.user) {
    const err = new Error(body?.error?.message || 'Google sign-in exchange failed') as Error & {
      code?: string
    }
    err.code = body?.error?.code
      ? body.error.code.startsWith('functions/')
        ? body.error.code
        : `functions/${body.error.code}`
      : 'functions/unauthenticated'
    throw err
  }

  persistSession(body.token, body.user)
  return body.user
}

export function authHeaders(): Record<string, string> {
  const token = getSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
