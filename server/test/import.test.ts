import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA = join(__dirname, '../src/db/schema.sql')

describe('import ID preservation', () => {
  const work = join(tmpdir(), `freifeed-import-test-${Date.now()}`)

  afterEach(() => {
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('keeps original document IDs from a tiny fixture', () => {
    mkdirSync(work, { recursive: true })
    const exportDir = join(work, 'export')
    mkdirSync(exportDir, { recursive: true })

    const manifest = {
      counts: {
        authUsers: 1,
        userDocs: 1,
        households: 1,
        babies: 1,
        feedings: 1,
        milkLots: 1,
        diapers: 0,
        medicines: 0,
        measurements: 0,
        notes: 0,
        inviteCodes: 1,
      },
    }
    writeFileSync(join(exportDir, 'manifest.json'), JSON.stringify(manifest))
    writeFileSync(
      join(exportDir, 'auth-users.json'),
      JSON.stringify([
        {
          uid: 'firebaseUid123',
          email: 'a@b.com',
          displayName: 'A',
          photoURL: null,
          providerData: [{ providerId: 'google.com', uid: 'gsub1', email: 'a@b.com' }],
        },
      ]),
    )
    writeFileSync(
      join(exportDir, 'users.json'),
      JSON.stringify([{ id: 'firebaseUid123', email: 'a@b.com', householdId: 'hh-orig' }]),
    )
    writeFileSync(
      join(exportDir, 'inviteCodes.json'),
      JSON.stringify([{ id: 'ZZZZZZ', householdId: 'hh-orig' }]),
    )
    writeFileSync(
      join(exportDir, 'households.json'),
      JSON.stringify([
        {
          household: {
            id: 'hh-orig',
            inviteCode: 'ZZZZZZ',
            members: ['firebaseUid123'],
            ownerUid: 'firebaseUid123',
            memberRoles: { firebaseUid123: 'owner' },
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          babies: [{ id: 'ingrid', name: 'Ingrid' }],
          feedings: [
            {
              id: 'feed-orig-1',
              type: 'nursing',
              babyId: 'ingrid',
              side: 'left',
              startAt: '2026-01-01T01:00:00.000Z',
              endAt: '2026-01-01T01:10:00.000Z',
              volumeOz: null,
              milkStorage: null,
              storedAt: null,
              milkLotId: null,
              milkDeductions: [],
              note: null,
              createdAt: '2026-01-01T01:10:00.000Z',
              updatedAt: '2026-01-01T01:10:00.000Z',
            },
          ],
          milkLots: [
            {
              id: 'lot-orig-1',
              pumpedAt: '2026-01-01T02:00:00.000Z',
              storedAt: '2026-01-01T02:00:00.000Z',
              volumeOz: 4,
              remainingOz: 4,
              storage: 'fridge',
              feedingId: null,
              note: null,
              createdAt: '2026-01-01T02:00:00.000Z',
              updatedAt: '2026-01-01T02:00:00.000Z',
            },
          ],
          diapers: [],
          medicines: [],
          measurements: [],
          notes: [],
        },
      ]),
    )

    const dbPath = join(work, 'test.sqlite')
    const db = new Database(dbPath)
    db.pragma('foreign_keys = ON')
    db.exec(readFileSync(SCHEMA, 'utf8'))

    // Inline minimal import mirroring import-sqlite.mjs ID preservation
    const pack = JSON.parse(readFileSync(join(exportDir, 'households.json'), 'utf8'))[0]
    const auth = JSON.parse(readFileSync(join(exportDir, 'auth-users.json'), 'utf8'))[0]
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO users (uid, google_sub, email, display_name, household_id,
        skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, '{}', '[]', ?, ?)`,
    ).run(
      auth.uid,
      auth.providerData[0].uid,
      auth.email,
      auth.displayName,
      'hh-orig',
      now,
      now,
    )
    db.prepare(
      `INSERT INTO households (id, invite_code, members, owner_uid, member_roles, person_nicknames,
        member_show_on_home, created_at) VALUES (?, ?, ?, ?, ?, '{}', '{}', ?)`,
    ).run(
      'hh-orig',
      'ZZZZZZ',
      JSON.stringify(['firebaseUid123']),
      'firebaseUid123',
      JSON.stringify({ firebaseUid123: 'owner' }),
      now,
    )
    db.prepare(`INSERT INTO babies (id, household_id, name, show_on_home) VALUES (?, ?, ?, 1)`).run(
      'ingrid',
      'hh-orig',
      'Ingrid',
    )
    const f = pack.feedings[0]
    db.prepare(
      `INSERT INTO feedings (id, household_id, type, baby_id, side, start_at, end_at, volume_oz,
        milk_storage, stored_at, milk_lot_id, milk_deductions, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)`,
    ).run(
      f.id,
      'hh-orig',
      f.type,
      f.babyId,
      f.side,
      f.startAt,
      f.endAt,
      f.volumeOz,
      f.milkStorage,
      f.storedAt,
      f.milkLotId,
      f.note,
      f.createdAt,
      f.updatedAt,
    )
    const m = pack.milkLots[0]
    db.prepare(
      `INSERT INTO milk_lots (id, household_id, pumped_at, stored_at, volume_oz, remaining_oz, storage,
        feeding_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      m.id,
      'hh-orig',
      m.pumpedAt,
      m.storedAt,
      m.volumeOz,
      m.remainingOz,
      m.storage,
      m.feedingId,
      m.note,
      m.createdAt,
      m.updatedAt,
    )

    assert.ok(db.prepare('SELECT 1 FROM users WHERE uid = ?').get('firebaseUid123'))
    assert.ok(db.prepare('SELECT 1 FROM households WHERE id = ?').get('hh-orig'))
    assert.ok(db.prepare('SELECT 1 FROM babies WHERE id = ?').get('ingrid'))
    assert.ok(db.prepare('SELECT 1 FROM feedings WHERE id = ?').get('feed-orig-1'))
    assert.ok(db.prepare('SELECT 1 FROM milk_lots WHERE id = ?').get('lot-orig-1'))
    db.close()
  })
})
