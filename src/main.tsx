import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './themes.css'
import './desktop-web.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initNativeGoogleAuth } from './lib/nativeGoogleAuth'
import { disableServiceWorkerOnNative } from './lib/notificationPlatform'
import { isNativeCapacitor } from './lib/platform'
import { initThemeFromStorage } from './lib/theme'

import { initViewportChromeLock } from './lib/viewportChromeLock'

initThemeFromStorage()
initViewportChromeLock()

if (isNativeCapacitor()) {
  void initNativeGoogleAuth()
  void disableServiceWorkerOnNative()
} else {
  document.documentElement.classList.add('platform-web')
}

// Service workers from earlier PWA dev sessions can break Google OAuth redirects.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) reg.unregister()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
