import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { auth } from '../firebase'
import { GOOGLE_WEB_CLIENT_ID } from './googleClientId'
import { isNativeCapacitor } from './platform'

let initialized = false

export async function initNativeGoogleAuth(): Promise<void> {
  if (!isNativeCapacitor() || initialized) return
  await GoogleAuth.initialize({
    clientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ['profile', 'email'],
    grantOfflineAccess: true,
  })
  initialized = true
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
  if (code === '10' || msg.includes('Something went wrong')) {
    return (
      'Google rejected sign-in (error 10). In Firebase → Project settings → Your Android app ' +
      '(com.freifeed.app), add debug SHA-1: A9:9F:35:C5:EE:43:85:E0:7D:4B:37:57:47:6F:EB:38:C9:79:BE:9C ' +
      'then re-download google-services.json into android/app/ and rebuild the APK.'
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
    const idToken = result.authentication?.idToken
    if (!idToken) {
      throw new Error(
        'Google sign-in did not return an ID token. Add the debug SHA-1 in Firebase and rebuild.',
      )
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
