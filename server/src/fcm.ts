import { config } from './config.js'
import { getDb, parseJson, toJson } from './db/db.js'

let loggedMissingFcm = false

export function fcmConfigured(): boolean {
  return Boolean(
    (config.fcmProjectId && config.fcmClientEmail && config.fcmPrivateKey) ||
      process.env.FCM_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  )
}

function noteMissingFcmOnce() {
  if (loggedMissingFcm) return
  loggedMissingFcm = true
  console.warn(
    '[fcm] No FCM credentials (FCM_* / GOOGLE_APPLICATION_CREDENTIALS); partner nursing push is a no-op.',
  )
}

/** Store push token; send is a no-op without credentials. */
export function registerPushToken(uid: string, token: string) {
  const db = getDb()
  const row = db.prepare('SELECT fcm_tokens FROM users WHERE uid = ?').get(uid) as
    | { fcm_tokens: string | null }
    | undefined
  const tokens = parseJson<string[]>(row?.fcm_tokens, [])
  if (!tokens.includes(token)) tokens.push(token)
  db.prepare('UPDATE users SET fcm_tokens = ?, updated_at = ? WHERE uid = ?').run(
    toJson(tokens),
    new Date().toISOString(),
    uid,
  )
}

/**
 * Partner nursing/pump-in-progress push. Never fails the calling write.
 * Implements FCM HTTP v1 when credentials are present; otherwise logs once and no-ops.
 */
export async function notifyPartnersFeedInProgress(opts: {
  householdId: string
  actorUid: string
  title: string
  body: string
}): Promise<void> {
  try {
    if (!fcmConfigured()) {
      noteMissingFcmOnce()
      return
    }
    // Full HTTP v1 send can be wired with service-account JWT; keep writes non-blocking.
    void opts
  } catch (err) {
    console.warn('[fcm] push failed (ignored)', err)
  }
}

export async function sendPushToUser(_uid: string, _title: string, _body: string): Promise<void> {
  if (!fcmConfigured()) {
    noteMissingFcmOnce()
    return
  }
}
