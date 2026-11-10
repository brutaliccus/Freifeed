import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

test('import preserves original document IDs', async () => {
  const { importDumpToSqlite } = await import(
    pathToFileURL(join(process.cwd(), 'scripts/import-lib.mjs')).href
  )
  const dir = join(tmpdir(), `freifeed-import-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, 'photos'), { recursive: true })

  const dump = {
    users: [
      {
        uid: 'firebaseUidABC',
        email: 'parent@example.com',
        displayName: 'Parent',
        photoURL: null,
        householdId: 'hh1',
        google_sub: 'sub-123',
        providerData: [{ providerId: 'google.com', uid: 'sub-123' }],
      },
    ],
    households: [
      {
        id: 'hh1',
        inviteCode: 'XYZ789',
        members: ['firebaseUidABC'],
        ownerUid: 'firebaseUidABC',
        memberRoles: { firebaseUidABC: 'owner' },
        personNicknames: {},
        memberShowOnHome: {},
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    inviteCodes: [{ code: 'XYZ789', householdId: 'hh1' }],
    babies: {
      hh1: [{ id: 'baby1', name: 'Kid', birthDate: null, photoUrl: null }],
    },
    feedings: {
      hh1: [
        {
          id: 'feed-keep-me',
          type: 'bottle',
          babyId: 'baby1',
          side: null,
          startAt: '2024-02-01T12:00:00.000Z',
          endAt: '2024-02-01T12:10:00.000Z',
          volumeOz: 2,
          milkStorage: null,
          storedAt: null,
          milkLotId: null,
          milkDeductions: [{ lotId: 'lot-keep-me', amountOz: 2 }],
          weightLb: null,
          weightOz: null,
          note: null,
          createdAt: '2024-02-01T12:00:00.000Z',
          updatedAt: '2024-02-01T12:00:00.000Z',
        },
      ],
    },
    milkLots: {
      hh1: [
        {
          id: 'lot-keep-me',
          pumpedAt: '2024-01-30T00:00:00.000Z',
          storedAt: '2024-01-30T00:00:00.000Z',
          volumeOz: 4,
          remainingOz: 2,
          storage: 'fridge',
          feedingId: null,
          note: null,
          createdAt: '2024-01-30T00:00:00.000Z',
          updatedAt: '2024-02-01T12:00:00.000Z',
        },
      ],
    },
    diapers: { hh1: [] },
    medicines: { hh1: [] },
    measurements: { hh1: [] },
    notes: { hh1: [] },
    meta: { hh1: [] },
    config: {},
    authUsers: [
      {
        uid: 'firebaseUidABC',
        email: 'parent@example.com',
        displayName: 'Parent',
        photoURL: null,
        providerData: [{ providerId: 'google.com', uid: 'sub-123' }],
      },
    ],
  }

  writeFileSync(join(dir, 'dump.json'), JSON.stringify(dump))
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      users: 1,
      households: 1,
      babies: 1,
      feedings: 1,
      milkLots: 1,
      diapers: 0,
      medicines: 0,
      measurements: 0,
      notes: 0,
      photos: 0,
      authUsers: 1,
    }),
  )

  const dbPath = join(dir, 'out.sqlite')
  const counts = importDumpToSqlite(dir, dbPath)

  assert.equal(counts.users, 1)
  assert.equal(counts.feedings, 1)
  assert.equal(counts.milkLots, 1)

  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)
  const feeding = db.prepare('SELECT id, milk_deductions FROM feedings WHERE id = ?').get('feed-keep-me') as {
    id: string
    milk_deductions: string
  }
  const lot = db.prepare('SELECT id FROM milk_lots WHERE id = ?').get('lot-keep-me')
  const user = db.prepare('SELECT uid, google_sub FROM users WHERE uid = ?').get('firebaseUidABC') as {
    uid: string
    google_sub: string
  }
  assert.equal(feeding.id, 'feed-keep-me')
  assert.ok(feeding.milk_deductions.includes('lot-keep-me'))
  assert.ok(lot)
  assert.equal(user.uid, 'firebaseUidABC')
  assert.equal(user.google_sub, 'sub-123')
  db.close()

  rmSync(dir, { recursive: true, force: true })
})

test('import resolves Firestore id + authUsers.providerData google uid', async () => {
  const { importDumpToSqlite } = await import(
    pathToFileURL(join(process.cwd(), 'scripts/import-lib.mjs')).href
  )
  const dir = join(tmpdir(), `freifeed-import-id-${Date.now()}`)
  mkdirSync(dir, { recursive: true })

  const firebaseUid = '8sL4bfgBUnS7rSw7dpHUGNQYoP02'
  const googleSub = '100279468078955672077'
  const dump = {
    users: [
      {
        // Real Firestore export shape: document field `id`, not `uid`
        id: firebaseUid,
        email: 'Jeb32411@Gmail.com',
        displayName: 'Joseph',
        householdId: 'hh-family',
      },
    ],
    households: [
      {
        id: 'hh-family',
        inviteCode: 'ABC123',
        members: [firebaseUid],
        ownerUid: firebaseUid,
        memberRoles: { [firebaseUid]: 'owner' },
        personNicknames: {},
        memberShowOnHome: {},
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    inviteCodes: [{ code: 'ABC123', householdId: 'hh-family' }],
    babies: { 'hh-family': [] },
    feedings: { 'hh-family': [] },
    milkLots: { 'hh-family': [] },
    diapers: { 'hh-family': [] },
    medicines: { 'hh-family': [] },
    measurements: { 'hh-family': [] },
    notes: { 'hh-family': [] },
    authUsers: [
      {
        uid: firebaseUid,
        email: 'jeb32411@gmail.com',
        displayName: 'Joseph',
        providerData: [{ providerId: 'google.com', uid: googleSub }],
      },
    ],
  }

  writeFileSync(join(dir, 'dump.json'), JSON.stringify(dump))
  const dbPath = join(dir, 'out.sqlite')
  const counts = importDumpToSqlite(dir, dbPath)
  assert.equal(counts.users, 1)

  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)
  const user = db
    .prepare('SELECT uid, google_sub, household_id, email FROM users WHERE uid = ?')
    .get(firebaseUid) as {
    uid: string
    google_sub: string
    household_id: string
    email: string
  }
  assert.equal(user.uid, firebaseUid)
  assert.equal(user.google_sub, googleSub)
  assert.equal(user.household_id, 'hh-family')
  assert.equal(user.email, 'jeb32411@gmail.com')
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('import accepts auth-users.json localId + providerUserInfo.rawId shape', async () => {
  const { importDumpToSqlite } = await import(
    pathToFileURL(join(process.cwd(), 'scripts/import-lib.mjs')).href
  )
  const dir = join(tmpdir(), `freifeed-import-localId-${Date.now()}`)
  mkdirSync(dir, { recursive: true })

  const firebaseUid = 'ashlynFirebaseUid001'
  const googleSub = '998877665544332211'
  const dump = {
    users: [
      {
        id: firebaseUid,
        email: 'Ashlyn@Example.com',
        householdId: 'hh2',
      },
    ],
    households: [
      {
        id: 'hh2',
        inviteCode: 'DEF456',
        members: [firebaseUid],
        ownerUid: firebaseUid,
        memberRoles: { [firebaseUid]: 'owner' },
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    inviteCodes: [],
    babies: {},
    feedings: {},
    milkLots: {},
    diapers: {},
    medicines: {},
    measurements: {},
    notes: {},
    authUsers: [
      {
        localId: firebaseUid,
        email: 'ashlyn@example.com',
        providerUserInfo: [{ providerId: 'google.com', rawId: googleSub }],
      },
    ],
  }

  writeFileSync(join(dir, 'dump.json'), JSON.stringify(dump))
  const dbPath = join(dir, 'out.sqlite')
  importDumpToSqlite(dir, dbPath)

  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)
  const user = db
    .prepare('SELECT uid, google_sub, email, household_id FROM users WHERE uid = ?')
    .get(firebaseUid) as {
    uid: string
    google_sub: string
    email: string
    household_id: string
  }
  assert.equal(user.uid, firebaseUid)
  assert.equal(user.google_sub, googleSub)
  assert.equal(user.email, 'ashlyn@example.com')
  assert.equal(user.household_id, 'hh2')
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('import throws when user has no uid/id/localId', async () => {
  const { importDumpToSqlite } = await import(
    pathToFileURL(join(process.cwd(), 'scripts/import-lib.mjs')).href
  )
  const dir = join(tmpdir(), `freifeed-import-bad-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'dump.json'),
    JSON.stringify({
      users: [{ email: 'orphan@example.com', householdId: null }],
      households: [],
      authUsers: [],
    }),
  )
  const dbPath = join(dir, 'out.sqlite')
  assert.throws(() => importDumpToSqlite(dir, dbPath), /without a real uid/)
  rmSync(dir, { recursive: true, force: true })
})
