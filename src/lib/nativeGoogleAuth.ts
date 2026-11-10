import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { auth } from '../firebase'
import { GOOGLE_WEB_CLIENT_ID } from './googleClientId'
import { isNativeCapacitor } from './platform'
import { isApiMode } from './apiMode'
import { exchangeGoogleIdToken } from './sessionAuth'

let initialized = false
let initializing: Promise<void> | null = null

export function isJwtIdToken(value: unknown): value is string {
  return typeof value === 'string' && value.split('.').length === 3 && value.length > 40
}

async function unwrapAuthentication(raw: unknown): Promise<Record<string, unknown> | null> {
  if (raw == null) return null
  const resolved = typeof (raw as { then?: unknown }).then === 'function' ? await raw : raw
  if (!resolved || typeof resolved !== 'object') return null
  return resolved as Record<string, unknown>
}

/** capacitor-google-auth may put the JWT on authentication.idToken, a thenable authentication object, or the user root. */
export async function extractGoogleIdToken(result: unknown): Promise<string | null> {
  if (!result || typeof result !== 'object') return null
  const root = result as Record<string, unknown>
  const authn = await unwrapAuthentication(root.authentication)
  const candidates = [
    authn?.idToken,
    authn?.id_token,
    root.idToken,
    root.id_token,
  ]
  for (const candidate of candidates) {
    if (isJwtIdToken(candidate)) return candidate
  }
  return null
}

export async function initNativeGoogleAuth(): Promise<void> {
  if (!isNativeCapacitor() || initialized) return
  if (initializing) {
    await initializing
    return
  }
  initializing = (async () => {
    if (Capacitor.isPluginAvailable && !Capacitor.isPluginAvailable('GoogleAuth')) {
      throw new Error(
        'Google sign-in is not available in this app session. Force-close Buba and reopen it.',
      )
    }
    // Request an ID token, not a server auth code. grantOfflineAccess maps to
    // forceCodeForRefreshToken on Android and can leave authentication.idToken empty.
    await GoogleAuth.initialize({
      clientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ['profile', 'email', 'openid'],
      grantOfflineAccess: false,
    })
    initialized = true
  })()
  try {
    await initializing
  } finally {
    initializing = null
  }
}

function formatGoogleSignInError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : msg.match(/\b(10|12501)\b/)?.[1] ?? ''

  if (code === '12501' || msg.toLowerCase().includes('cancel')) {
    return 'Sign-in was cancelled.'
  }
  if (/access token|tokeninfo|FileNotFound|http 400|status code 400/i.test(msg)) {
    return (
      'Google signed you in but failed while fetching extra tokens. ' +
      'Wait a moment and try again. If it keeps failing, force-close Buba and reopen it.'
    )
  }
  if (code === '10') {
    return (
      'Google rejected sign-in (error 10). The APK signing certificate is not registered in Firebase. ' +
      'Add this build\u2019s SHA-1 under Project settings \u2192 Your Android app (com.freifeed.app), then rebuild.'
    )
  }
  return msg || 'Google sign-in failed'
}

export async function signInWithGoogleNative(): Promise<void> {
  if (!isNativeCapacitor()) {
    throw new Error('Native Google sign-in is only available in the Android app')
  }
  await initNativeGoogleAuth()
  try {
    const result = await GoogleAuth.signIn()
    let idToken = await extractGoogleIdToken(result)
    if (!idToken) {
      try {
        const refreshed = await GoogleAuth.refresh()
        idToken = await extractGoogleIdToken({ authentication: refreshed, ...refreshed })
      } catch {
        /* fall through to the missing-token error */
      }
    }
    if (!idToken) {
      throw new Error(
        'Google sign-in did not return an ID token. Force-close the app and try again.',
      )
    }
    if (isApiMode()) {
      await exchangeGoogleIdToken(idToken)
      return
    }
    const credential = GoogleAuthProvider.credential(idToken)
    await signInWithCredential(auth, credential)
  } catch (err) {
    throw new Error(formatGoogleSignInError(err))
  }
}

export async function signOutGoogleNative(): Promise<void> {
  if (!isNativeCapacitor() || !initialized) return
  try {
    await GoogleAuth.signOut()
  } catch {
    /* ignore */
  }
  initialized = false
}
