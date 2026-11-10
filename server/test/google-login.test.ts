import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestDb, nowIso } from './helpers.js'
import { resolveGoogleLoginUser, isUsableUid } from '../src/auth/google.js'
import { HttpsError } from '../src/errors.js'

test('isUsableUid rejects nullish string forms', () => {
  assert.equal(isUsableUid(null), false)
  assert.equal(isUsableUid(undefined), false)
  assert.equal(isUsableUid(''), false)
  assert.equal(isUsableUid('null'), false)
  assert.equal(isUsableUid('undefined'), false)
  assert.equal(isUsableUid('firebaseUidABC'), true)
})

test('resolveGoogleLoginUser attaches google_sub to email match with real uid', () => {
  const db = setupTestDb()
  const now = nowIso()
  const firebaseUid = '8sL4bfgBUnS7rSw7dpHUGNQYoP02'
  db.prepare(
    `INSERT INTO users (uid, google_sub, email, display_name, photo_url, household_id,
      skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
     VALUES (?, NULL, ?, ?, NULL, ?, 0, 0, '{}', '[]', ?, ?)`,
  ).run(firebaseUid, 'jeb32411@gmail.com', 'Joseph', 'hh-family', now, now)

  const user = resolveGoogleLoginUser({
    googleSub: '100279468078955672077',
    email: 'Jeb32411@Gmail.com',
    displayName: 'Joseph',
    photoURL: null,
  })

  assert.equal(user.uid, firebaseUid)
  assert.equal(user.google_sub, '100279468078955672077')
  assert.equal(user.household_id, 'hh-family')
  assert.equal(user.email, 'jeb32411@gmail.com')
})

test('resolveGoogleLoginUser finds by google_sub first', () => {
  const db = setupTestDb()
  const now = nowIso()
  db.prepare(
    `INSERT INTO users (uid, google_sub, email, display_name, photo_url, household_id,
      skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, 0, 0, '{}', '[]', ?, ?)`,
  ).run('uid-a', 'sub-a', 'a@example.com', 'A', 'hh-a', now, now)

  const user = resolveGoogleLoginUser({
    googleSub: 'sub-a',
    email: 'other@example.com',
    displayName: 'A',
    photoURL: null,
  })
  assert.equal(user.uid, 'uid-a')
  assert.equal(user.household_id, 'hh-a')
})

test('resolveGoogleLoginUser creates g_* for truly new email', () => {
  setupTestDb()
  const user = resolveGoogleLoginUser({
    googleSub: 'brand-new-sub',
    email: 'newbie@example.com',
    displayName: 'New',
    photoURL: null,
  })
  assert.equal(user.uid, 'g_brand-new-sub')
  assert.equal(user.google_sub, 'brand-new-sub')
  assert.equal(user.household_id, null)
})

test('resolveGoogleLoginUser refuses corrupt NULL-uid email match without inventing g_*', () => {
  const db = setupTestDb()
  const now = nowIso()
  // Simulate broken import: TEXT PRIMARY KEY can store NULL in SQLite
  db.prepare(
    `INSERT INTO users (uid, google_sub, email, display_name, photo_url, household_id,
      skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
     VALUES (NULL, NULL, ?, ?, NULL, ?, 0, 0, '{}', '[]', ?, ?)`,
  ).run('corrupt@example.com', 'Corrupt', 'hh-lost', now, now)

  assert.throws(
    () =>
      resolveGoogleLoginUser({
        googleSub: 'sub-corrupt',
        email: 'corrupt@example.com',
        displayName: 'Corrupt',
        photoURL: null,
      }),
    (err: unknown) => {
      assert.ok(err instanceof HttpsError)
      assert.match(err.message, /no Firebase uid|re-import/i)
      return true
    },
  )

  const row = db
    .prepare('SELECT uid, google_sub, household_id FROM users WHERE lower(email) = ?')
    .get('corrupt@example.com') as { uid: string | null; google_sub: string; household_id: string }
  assert.equal(row.uid, null)
  assert.equal(row.google_sub, 'sub-corrupt')
  assert.equal(row.household_id, 'hh-lost')

  const dup = db.prepare('SELECT uid FROM users WHERE uid = ?').get('g_sub-corrupt')
  assert.equal(dup, undefined)
})
