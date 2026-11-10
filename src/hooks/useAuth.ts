import { useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import { getUserProfile, upsertUserProfile } from '../lib/household'
import { formatApiError, apiGetUserProfile, apiUpsertUserProfile } from '../lib/api'
import { registerNativePartnerPushToken } from '../lib/partnerPushRegistration'
import { areFeedNotificationsEnabled } from '../lib/feedNotifications'
import { isAndroidNative, isNativeCapacitor } from '../lib/platform'
import { signInWithGoogleNative, signOutGoogleNative } from '../lib/nativeGoogleAuth'
import { isApiMode } from '../lib/apiMode'
import {
  clearSession,
  exchangeGoogleIdToken,
  getSessionToken,
  getSessionUser,
  type ApiSessionUser,
} from '../lib/sessionAuth'
import { destroyHouseholdSubscriptions } from '../lib/householdSubscriptions'
import type { UserProfile } from '../types'

async function syncUserProfileFirebase(firebaseUser: User): Promise<UserProfile | null> {
  await upsertUserProfile(firebaseUser.uid, {
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
  })
  return getUserProfile(firebaseUser.uid)
}

async function syncUserProfileApi(sessionUser: ApiSessionUser): Promise<UserProfile | null> {
  await apiUpsertUserProfile({
    email: sessionUser.email,
    displayName: sessionUser.displayName,
    photoURL: sessionUser.photoURL,
  })
  return apiGetUserProfile()
}

function authErrorCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
}

function sessionAsUser(session: ApiSessionUser): User {
  // Minimal User-shaped object for components that only need uid/email/photo.
  return {
    uid: session.uid,
    email: session.email,
    displayName: session.displayName,
    photoURL: session.photoURL,
  } as User
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const handleFirebaseUser = useCallback(async (firebaseUser: User | null) => {
    setUser(firebaseUser)
    if (!firebaseUser) {
      setProfile(null)
      setApiError(null)
      return
    }
    try {
      const p = await syncUserProfileFirebase(firebaseUser)
      setProfile(p)
      setApiError(null)
      if (isAndroidNative() && areFeedNotificationsEnabled()) {
        void registerNativePartnerPushToken()
      }
    } catch (err) {
      console.error('Profile sync failed:', err)
      setApiError(formatApiError(err))
    }
  }, [])

  const handleApiSession = useCallback(async (session: ApiSessionUser | null) => {
    if (!session || !getSessionToken()) {
      setUser(null)
      setProfile(null)
      setApiError(null)
      return
    }
    setUser(sessionAsUser(session))
    try {
      const p = await syncUserProfileApi(session)
      setProfile(p)
      setApiError(null)
      if (isAndroidNative() && areFeedNotificationsEnabled()) {
        void registerNativePartnerPushToken()
      }
    } catch (err) {
      const code = authErrorCode(err)
      if (code === 'functions/unauthenticated' || code === 'unauthenticated') {
        clearSession()
        setUser(null)
        setProfile(null)
        setApiError(null)
        return
      }
      console.error('Profile sync failed:', err)
      setApiError(formatApiError(err))
    }
  }, [])

  useEffect(() => {
    let unsub = () => {}
    let mounted = true

    async function boot() {
      setLoading(true)

      if (isApiMode()) {
        const existing = getSessionUser()
        if (existing && getSessionToken()) {
          await handleApiSession(existing)
        }
        if (mounted) setLoading(false)

        const onSession = () => {
          void handleApiSession(getSessionUser())
        }
        window.addEventListener('freifeed-api-session-changed', onSession)
        unsub = () => window.removeEventListener('freifeed-api-session-changed', onSession)
        return
      }

      try {
        await setPersistence(auth, browserLocalPersistence)
        await getRedirectResult(auth)
      } catch (err) {
        const code = authErrorCode(err)
        if (code && code !== 'auth/no-auth-event' && mounted) {
          console.error('Redirect sign-in:', err)
        }
      }

      await auth.authStateReady()
      if (!mounted) return

      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        await handleFirebaseUser(firebaseUser)
        if (mounted) setLoading(false)
      })
    }

    void boot()

    return () => {
      mounted = false
      unsub()
    }
  }, [handleFirebaseUser, handleApiSession])

  const signIn = async () => {
    setAuthError(null)
    const native = isNativeCapacitor()
    try {
      if (native) {
        await signInWithGoogleNative()
        if (isApiMode()) {
          await handleApiSession(getSessionUser())
        }
        return
      }

      if (isApiMode()) {
        const result = await signInWithPopup(auth, googleProvider)
        const idToken = GoogleAuthProvider.credentialFromResult(result)?.idToken
        if (!idToken) {
          throw new Error('Google sign-in did not return an ID token')
        }
        // Firebase Auth was only the UX wrapper — drop it; API session is canonical.
        await signOut(auth).catch(() => {})
        await exchangeGoogleIdToken(idToken)
        await handleApiSession(getSessionUser())
        return
      }

      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      const code = authErrorCode(err)
      if (code === 'auth/popup-closed-by-user') return
      if (native) {
        setAuthError(err instanceof Error ? err.message : 'Google sign-in failed')
        return
      }
      if (code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      throw err
    }
  }

  const signOutUser = async () => {
    const hid = profile?.householdId
    destroyHouseholdSubscriptions(hid ?? undefined)
    await signOutGoogleNative()
    if (isApiMode()) {
      clearSession()
      setUser(null)
      setProfile(null)
      return
    }
    await signOut(auth)
  }

  const refreshProfile = async () => {
    if (!user) return
    const p = isApiMode() ? await apiGetUserProfile() : await getUserProfile(user.uid)
    setProfile(p)
    setApiError(null)
  }

  return {
    user,
    profile,
    loading,
    authError,
    firestoreError: apiError,
    signIn,
    signOut: signOutUser,
    refreshProfile,
  }
}
