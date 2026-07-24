import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/** Bumped every production build — polled by the app to detect new Firebase Hosting deploys. */
const freifeedBuildId =
  process.env.FREIFEED_BUILD_ID?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  String(Date.now())

export default defineConfig({
  define: {
    __FREIFEED_BUILD_ID__: JSON.stringify(freifeedBuildId),
  },
  plugins: [
    react(),
    {
      name: 'freifeed-build-meta',
      transformIndexHtml(html) {
        return html.replace(
          '<meta name="viewport"',
          `<meta name="freifeed-build" content="${freifeedBuildId}" />\n    <meta name="viewport"`,
        )
      },
    },
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      devOptions: {
        enabled: false,
      },
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/',
        name: 'Buba',
        short_name: 'Buba',
        description: 'Baby care tracker',
        theme_color: '#14111a',
        background_color: '#14111a',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // Exclude large PNGs (e.g. logo) from SW precache; they still ship with the app bundle.
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
})
