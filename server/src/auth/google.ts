import { OAuth2Client } from 'google-auth-library'
import { config } from '../config.js'
import { getDb, nowIso, parseJson, toJson } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { signAuthToken } from './jwt.js'

const client = new OAuth2Client(config.googleWebClientId)

export interface GoogleAuthResult {
  token: string
  user: {
    uid: string
    email: string | null
    displayName: string | null
    photoURL: string | null
  }
}

export async function authenticateWithGoogleIdToken(idToken: string): Promise<GoogleAuthResult> {
  if (!idToken || typeof idToken !== 'string') {
    throw new HttpsError('invalid-argument', 'idToken required')
  }

  let ticket
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: config.googleWebClientId,
    })
  } catch {
    throw new HttpsError('unauthenticated', 'Invalid Google ID token')
  }

  const payload = ticket.getPayload()
  if (!payload?.sub) throw new HttpsError('unauthenticated', 'Invalid Google ID token')

  const googleSub = payload.sub
  const email = payload.email?.toLowerCase() ?? null
  const displayName = payload.name ?? null
  const photoURL = payload.picture ?? null

  const db = getDb()
  const bySub = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(googleSub) as
    | Record<string, unknown>
    | undefined

  let user = bySub
  if (!user && email) {
    user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email) as
      | Record<string, unknown>
      | undefined
  }

  const now = nowIso()
  if (user) {
    db.prepare(
      `UPDATE users SET google_sub = ?, email = COALESCE(?, email), display_name = COALESCE(?, display_name),
       photo_url = COALESCE(?, photo_url), updated_at = ? WHERE uid = ?`,
    ).run(googleSub, email, displayName, photoURL, now, user.uid)
  } else {
    // Prefer Firebase Auth UID when importing; for new users generate a stable uid.
    const uid = `g_${googleSub}`
    db.prepare(
      `INSERT INTO users (uid, google_sub, email, display_name, photo_url, household_id,
        skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 0, 0, ?, '[]', ?, ?)`,
    ).run(uid, googleSub, email, displayName, photoURL, toJson(defaultNavTrackers()), now, now)
    user = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as Record<string, unknown>
  }

  const uid = String(user.uid)
  const token = signAuthToken({ uid, email })
  return {
    token,
    user: {
      uid,
      email: (user.email as string | null) ?? email,
      displayName: (user.display_name as string | null) ?? displayName,
      photoURL: (user.photo_url as string | null) ?? photoURL,
    },
  }
}

export function defaultNavTrackers() {
  return {
    nursing: true,
    milk: true,
    diaper: true,
    medicine: true,
    notes: true,
    measurements: true,
  }
}

export function readUserNavTrackers(raw: string | null | undefined) {
  const o = parseJson<Record<string, unknown>>(raw, {})
  return {
    nursing: o.nursing !== false,
    milk: o.milk !== false,
    diaper: o.diaper !== false,
    medicine: o.medicine !== false,
    notes: o.notes !== false,
    measurements: o.measurements !== false,
  }
}
