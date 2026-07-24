import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Remote URL shell (same pattern as Freilifts).
 *
 * Default: Firebase Hosting. Override:
 *   $env:CAP_SERVER_URL="http://192.168.1.x:5173"; npm run cap:sync
 *
 * Bundle-only (packaged dist, no remote):
 *   $env:CAP_SERVER_URL=""; npm run cap:sync
 */
let remoteUrl = ''
if (process.env.CAP_SERVER_URL !== undefined) {
  remoteUrl = process.env.CAP_SERVER_URL.trim()
} else {
  remoteUrl = 'https://freifeed-3b861.web.app'
}

/** Keep in sync with src/lib/googleClientId.ts */
const GOOGLE_WEB_CLIENT_ID =
  '269864356157-3r1fhq0598g0asc9pl0r9h5dc4qje5n7.apps.googleusercontent.com'

const googleWebClientId =
  (process.env.GOOGLE_WEB_CLIENT_ID && process.env.GOOGLE_WEB_CLIENT_ID.trim()) ||
  (process.env.VITE_GOOGLE_WEB_CLIENT_ID && process.env.VITE_GOOGLE_WEB_CLIENT_ID.trim()) ||
  GOOGLE_WEB_CLIENT_ID

const config: CapacitorConfig = {
  appId: 'com.freifeed.app',
  appName: 'Buba',
  webDir: 'dist',
  android: {
    // Margins + Android 15 edge-to-edge caused light status/nav gutters; native chrome handles insets.
    adjustMarginsForEdgeToEdge: 'disable',
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: googleWebClientId,
      forceCodeForRefreshToken: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_freifeed_notification',
      iconColor: '#c9a0b8',
    },
  },
  ...(remoteUrl
    ? {
        server: {
          url: remoteUrl,
          androidScheme: 'https',
          cleartext: process.env.CAP_ALLOW_CLEARTEXT === '1',
        },
      }
    : {}),
}

export default config
