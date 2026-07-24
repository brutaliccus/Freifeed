import { isNativeCapacitor } from '../lib/platform'

interface LoginScreenProps {
  onSignIn: () => void
  error?: string | null
  firestoreError?: string | null
}

export function LoginScreen({ onSignIn, error, firestoreError }: LoginScreenProps) {
  const nativeApp = isNativeCapacitor()
  return (
    <div className="auth-screen">
      <div className="auth-screen__bloom" aria-hidden />
      <header className="auth-screen__header">
        <p className="auth-screen__tagline">Baby care for your household</p>
      </header>
      <div className="auth-screen__panel">
        <p className="muted login-hint">
          {nativeApp
            ? 'Choose your Google account on this device. You should not leave the app or open Chrome.'
            : 'A Google sign-in popup will open. Allow popups for this site if prompted.'}
        </p>
        <button type="button" className="btn btn-google" onClick={onSignIn}>
          <GoogleIcon />
          Sign in with Google
        </button>
        {firestoreError && <p className="error-text">{firestoreError}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c3.42-3.15 5.384-7.785 5.384-13.19z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.512.454 3.446 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}
