import { config as loadEnv } from 'dotenv'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

loadEnv()

function required(name: string, fallback?: string): string {
  const v = process.env[name]?.trim() || fallback
  if (!v) throw new Error(`Missing required env ${name}`)
  return v
}

const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '269864356157-3r1fhq0598g0asc9pl0r9h5dc4qje5n7.apps.googleusercontent.com'

const DEFAULT_CORS = [
  'https://freifeed-3b861.web.app',
  'https://freifeed-3b861.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:4173',
  'capacitor://localhost',
  'https://localhost',
]

function parseCorsOrigins(): string[] {
  const extras = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set([...DEFAULT_CORS, ...extras])]
}

const dataDir = resolve(process.env.DATA_DIR ?? './data')
mkdirSync(dataDir, { recursive: true })
mkdirSync(resolve(dataDir, 'backups'), { recursive: true })
mkdirSync(resolve(dataDir, 'households'), { recursive: true })

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  dbPath: resolve(dataDir, process.env.DB_FILENAME ?? 'freifeed.sqlite'),
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me-freifeed-pi-backend'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? DEFAULT_GOOGLE_WEB_CLIENT_ID,
  corsOrigins: parseCorsOrigins(),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'https://buba.freiverse.com').replace(/\/$/, ''),
  version: process.env.npm_package_version ?? '0.1.0',
  fcmProjectId: process.env.FCM_PROJECT_ID?.trim() || null,
  fcmClientEmail: process.env.FCM_CLIENT_EMAIL?.trim() || null,
  fcmPrivateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n')?.trim() || null,
}
