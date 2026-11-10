import type { FastifyInstance } from 'fastify'
import { readUserNavTrackers, defaultNavTrackers } from '../auth/google.js'
import { getDb, nowIso, parseJson, toJson } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { registerPushToken } from '../fcm.js'
import { registerCallable } from './helpers.js'

const HOME_PRIMARY = new Set(['nursing', 'milk', 'diaper', 'medicine'])
const APP_THEMES = new Set(['buba', 'ocean', 'sage'])

function normalizeNavTrackers(raw: unknown) {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    nursing: o.nursing !== false,
    milk: o.milk !== false,
    diaper: o.diaper !== false,
    medicine: o.medicine !== false,
    notes: o.notes !== false,
    measurements: o.measurements !== false,
  }
}

function normalizeHomePrimaryAction(raw: unknown): string {
  if (typeof raw === 'string' && HOME_PRIMARY.has(raw)) return raw
  return 'nursing'
}

function normalizeUiScale(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1
  return Math.min(1.25, Math.max(0.85, raw))
}

function normalizeAppTheme(raw: unknown): string {
  if (typeof raw === 'string' && APP_THEMES.has(raw)) return raw
  return 'buba'
}

export function registerProfileRoutes(app: FastifyInstance) {
  registerCallable(app, 'getUserProfile', (uid) => {
    const row = getDb().prepare('SELECT * FROM users WHERE uid = ?').get(uid) as
      | Record<string, unknown>
      | undefined
    if (!row) return { profile: null }
    return {
      profile: {
        uid,
        email: (row.email as string | null) ?? null,
        displayName: (row.display_name as string | null) ?? null,
        photoURL: (row.photo_url as string | null) ?? null,
        householdId: (row.household_id as string | null) ?? null,
        skippedBabyOnboarding: Boolean(row.skipped_baby_onboarding),
        skippedPhotoOnboarding: Boolean(row.skipped_photo_onboarding),
        navTrackers: readUserNavTrackers(row.nav_trackers as string | null),
        homePrimaryAction: normalizeHomePrimaryAction(row.home_primary_action),
        uiScale: normalizeUiScale(row.ui_scale as number),
        appTheme: normalizeAppTheme(row.app_theme),
      },
    }
  })

  registerCallable(app, 'updateAppSettings', (uid, body) => {
    const patch: Record<string, unknown> = {}
    if (body.navTrackers && typeof body.navTrackers === 'object') {
      patch.nav_trackers = toJson(normalizeNavTrackers(body.navTrackers))
    }
    if (body.homePrimaryAction !== undefined) {
      patch.home_primary_action = normalizeHomePrimaryAction(body.homePrimaryAction)
    }
    if (body.uiScale !== undefined) patch.ui_scale = normalizeUiScale(body.uiScale)
    if (body.appTheme !== undefined) patch.app_theme = normalizeAppTheme(body.appTheme)
    if (Object.keys(patch).length === 0) {
      throw new HttpsError('invalid-argument', 'No settings to update')
    }
    const sets = Object.keys(patch)
      .map((k) => `${k} = ?`)
      .join(', ')
    getDb()
      .prepare(`UPDATE users SET ${sets}, updated_at = ? WHERE uid = ?`)
      .run(...Object.values(patch), nowIso(), uid)
    return { ok: true }
  })

  registerCallable(app, 'updateNavTrackers', (uid, body) => {
    if (!body.navTrackers || typeof body.navTrackers !== 'object') {
      throw new HttpsError('invalid-argument', 'navTrackers required')
    }
    getDb()
      .prepare('UPDATE users SET nav_trackers = ?, updated_at = ? WHERE uid = ?')
      .run(toJson(normalizeNavTrackers(body.navTrackers)), nowIso(), uid)
    return { ok: true }
  })

  registerCallable(app, 'upsertUserProfile', (uid, body) => {
    const db = getDb()
    const existing = db.prepare('SELECT uid FROM users WHERE uid = ?').get(uid)
    const email = (body.email as string | null | undefined) ?? null
    const displayName = (body.displayName as string | null | undefined) ?? null
    const photoURL = (body.photoURL as string | null | undefined) ?? null
    const now = nowIso()
    if (existing) {
      db.prepare(
        'UPDATE users SET email=?, display_name=?, photo_url=?, updated_at=? WHERE uid=?',
      ).run(email, displayName, photoURL, now, uid)
    } else {
      db.prepare(
        `INSERT INTO users (uid, email, display_name, photo_url, household_id,
          skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, 0, 0, ?, '[]', ?, ?)`,
      ).run(uid, email, displayName, photoURL, toJson(defaultNavTrackers()), now, now)
    }
    return { ok: true }
  })

  registerCallable(app, 'registerPushToken', (uid, body) => {
    const token = body.token
    if (!token || typeof token !== 'string') {
      throw new HttpsError('invalid-argument', 'token required')
    }
    registerPushToken(uid, token)
    return { ok: true }
  })

  registerCallable(app, 'skipPhotoOnboarding', (uid) => {
    getDb()
      .prepare('UPDATE users SET skipped_photo_onboarding = 1, updated_at = ? WHERE uid = ?')
      .run(nowIso(), uid)
    return { ok: true }
  })

  registerCallable(app, 'skipBabyOnboarding', (uid) => {
    getDb()
      .prepare('UPDATE users SET skipped_baby_onboarding = 1, updated_at = ? WHERE uid = ?')
      .run(nowIso(), uid)
    return { ok: true }
  })
}

void parseJson
