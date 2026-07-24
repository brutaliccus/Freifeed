import { useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  setPersistence,
  browserLocalPersistence,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import { getUserProfile, upsertUserProfile } from '../lib/household'
import { formatApiError } from '../lib/api'
import { registerNativePartnerPushToken } from '../lib/partnerPushRegistration'
import { areFeedNotificationsEnabled } from '../lib/feedNotifications'
import { isAndroidNative, isNativeCapacitor } from '../lib/platform'
import { signInWithGoogleNative, signOutGoogleNative } from '../lib/nativeGoogleAuth'
import type { UserProfile } from '../types'

async function syncUserProfile(firebaseUser: User): Promise<UserProfile | null> {
  await upsertUserProfile(firebaseUser.uid, {
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
  })
  return getUserProfile(firebaseUser.uid)
}

function authErrorCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const handleUser = useCallback(async (firebaseUser: User | null) => {
    setUser(firebaseUser)
    if (!firebaseUser) {
      setProfile(null)
      setApiError(null)
      return
    }
    try {
      const p = await syncUserProfile(firebaseUser)
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

  useEffect(() => {
    let unsub = () => {}
    let mounted = true

    async function boot() {
      setLoading(true)
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
        await handleUser(firebaseUser)
        if (mounted) setLoading(false)
      })
    }

    boot()

    return () => {
      mounted = false
      unsub()
    }
  }, [handleUser])

  const signIn = async () => {
    setAuthError(null)
    const native = isNativeCapacitor()
    try {
      if (native) {
        await signInWithGoogleNative()
        return
      }
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      const code = authErrorCode(err)
      if (code === 'auth/popup-closed-by-user') return
      // WebView cannot complete OAuth in an external browser — never redirect on native.
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
    await signOutGoogleNative()
    await signOut(auth)
  }

  const refreshProfile = async () => {
    if (!user) return
    const p = await getUserProfile(user.uid)
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
