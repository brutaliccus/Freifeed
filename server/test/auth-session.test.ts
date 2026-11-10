import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import { setupTestDb, nowIso } from './helpers.js'
import { requireAuth } from '../src/auth/middleware.js'
import { signAuthToken } from '../src/auth/jwt.js'
import { HttpsError } from '../src/errors.js'
import { registerProfileRoutes } from '../src/routes/profile.js'
import { getDb } from '../src/db/db.js'

function authRequest(token: string): FastifyRequest {
  return {
    headers: { authorization: `Bearer ${token}` },
    query: {},
  } as FastifyRequest
}

test('requireAuth rejects JWT whose uid is missing from users', () => {
  setupTestDb()
  const token = signAuthToken({ uid: 'g_deleted-user', email: 'gone@example.com' })
  assert.throws(
    () => requireAuth(authRequest(token)),
    (err: unknown) =>
      err instanceof HttpsError &&
      err.code === 'unauthenticated' &&
      /session expired/i.test(err.message),
  )
})

test('requireAuth accepts JWT for an existing user', () => {
  const db = setupTestDb()
  const now = nowIso()
  db.prepare(
    `INSERT INTO users (uid, google_sub, email, display_name, photo_url, household_id,
      skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
     VALUES (?, NULL, ?, ?, NULL, NULL, 0, 0, '{}', '[]', ?, ?)`,
  ).run('uid-alive', 'alive@example.com', 'Alive', now, now)

  const token = signAuthToken({ uid: 'uid-alive', email: 'alive@example.com' })
  const uid = requireAuth(authRequest(token))
  assert.equal(uid, 'uid-alive')
})

test('upsertUserProfile rejects missing uid and does not INSERT', async () => {
  setupTestDb()
  const app = Fastify()
  registerProfileRoutes(app)
  await app.ready()

  const token = signAuthToken({ uid: 'ghost-uid', email: 'ghost@example.com' })
  const res = await app.inject({
    method: 'POST',
    url: '/api/upsertUserProfile',
    headers: { authorization: `Bearer ${token}` },
    payload: { email: 'ghost@example.com', displayName: 'Ghost', photoURL: null },
  })

  assert.equal(res.statusCode, 401)
  const body = res.json() as { error?: { code?: string } }
  assert.equal(body.error?.code, 'unauthenticated')

  const after = getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE uid = ?').get('ghost-uid') as {
    n: number
  }
  assert.equal(after.n, 0)

  await app.close()
})
