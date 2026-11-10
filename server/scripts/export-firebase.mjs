#!/usr/bin/env node
/**
 * Read-only Firebase export (Firestore + Auth + Storage avatars).
 * Never prints tokens or service-account JSON.
 *
 * Credential discovery:
 * 1. GOOGLE_APPLICATION_CREDENTIALS / service account JSON
 * 2. Else firebase-tools configstore access token (CLI login)
 *
 * Output: ../../export/ (dump.json, manifest.json, photos/)
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = process.env.EXPORT_DIR
  ? process.env.EXPORT_DIR
  : join(__dirname, '../../export')
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'freifeed-3b861'

function loadAccessToken() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { mode: 'adc', token: null }
  }
  // firebase-tools stores tokens in configstore
  const candidates = [
    join(homedir(), '.config', 'configstore', 'firebase-tools.json'),
    join(homedir(), 'AppData', 'Roaming', 'configstore', 'firebase-tools.json'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const cfg = JSON.parse(readFileSync(p, 'utf8'))
      const tokens = cfg.tokens || cfg.api?.tokens
      const access = tokens?.access_token || tokens?.accessToken
      if (access) return { mode: 'firebase-tools', token: access }
    } catch {
      /* ignore */
    }
  }
  return { mode: 'none', token: null }
}

function serializeTs(value) {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (value._seconds != null) {
    return new Date(value._seconds * 1000).toISOString()
  }
  if (value.seconds != null) {
    return new Date(value.seconds * 1000).toISOString()
  }
  return value
}

function walkDoc(data) {
  if (data == null || typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(walkDoc)
  if (data._seconds != null || data.seconds != null) return serializeTs(data)
  const out = {}
  for (const [k, v] of Object.entries(data)) out[k] = walkDoc(v)
  return out
}

async function firestoreGet(path, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Firestore GET ${path} failed: ${res.status} ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function firestoreList(collectionPath, token) {
  const docs = []
  let pageToken = ''
  do {
    const q = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}${q}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Firestore LIST ${collectionPath} failed: ${res.status} ${text.slice(0, 200)}`)
    }
    const body = await res.json()
    for (const doc of body.documents ?? []) {
      docs.push(doc)
    }
    pageToken = body.nextPageToken || ''
  } while (pageToken)
  return docs
}

function fromFirestoreValue(v) {
  if (v == null) return null
  if ('nullValue' in v) return null
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromFirestoreValue)
  if ('mapValue' in v) {
    const out = {}
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) {
      out[k] = fromFirestoreValue(val)
    }
    return out
  }
  return null
}

function docToObject(doc) {
  const name = doc.name || ''
  const id = name.split('/').pop()
  const data = {}
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    data[k] = fromFirestoreValue(v)
  }
  return { id, ...walkDoc(data) }
}

async function listAuthUsers(token) {
  // Identity Toolkit — requires Firebase Auth admin scope; may fail with user token.
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ maxResults: 1000 }),
  })
  if (!res.ok) {
    console.warn('Auth export skipped (token lacks admin scope). Users collection still exported.')
    return []
  }
  const body = await res.json()
  return (body.users ?? []).map((u) => ({
    uid: u.localId,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    photoURL: u.photoUrl ?? null,
    providerData: (u.providerUserInfo ?? []).map((p) => ({
      providerId: p.providerId,
      uid: p.rawId ?? p.federatedId,
      email: p.email ?? null,
    })),
  }))
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(join(OUT, 'photos'), { recursive: true })

  const cred = loadAccessToken()
  if (cred.mode === 'none') {
    console.error(
      'No credentials. Set GOOGLE_APPLICATION_CREDENTIALS or run `firebase login` then retry.',
    )
    process.exit(1)
  }

  let token = cred.token
  if (cred.mode === 'adc') {
    try {
      const require = createRequire(import.meta.url)
      const { GoogleAuth } = require('google-auth-library')
      const auth = new GoogleAuth({
        scopes: [
          'https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/datastore',
          'https://www.googleapis.com/auth/firebase',
          'https://www.googleapis.com/auth/identitytoolkit',
          'https://www.googleapis.com/auth/devstorage.read_only',
        ],
      })
      token = await auth.getAccessToken()
    } catch (err) {
      console.error('ADC failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  }

  console.log(`Exporting project ${PROJECT} (read-only) → ${OUT}`)

  const users = (await firestoreList('users', token)).map(docToObject)
  const households = (await firestoreList('households', token)).map(docToObject)
  const inviteCodes = (await firestoreList('inviteCodes', token)).map(docToObject)
  let configDocs = []
  try {
    configDocs = (await firestoreList('config', token)).map(docToObject)
  } catch {
    configDocs = []
  }

  const babies = {}
  const feedings = {}
  const diapers = {}
  const milkLots = {}
  const medicines = {}
  const measurements = {}
  const notes = {}
  const meta = {}
  const photoIndex = []

  for (const h of households) {
    const hid = h.id
    babies[hid] = (await firestoreList(`households/${hid}/babies`, token)).map(docToObject)
    feedings[hid] = (await firestoreList(`households/${hid}/feedings`, token)).map(docToObject)
    diapers[hid] = (await firestoreList(`households/${hid}/diapers`, token)).map(docToObject)
    milkLots[hid] = (await firestoreList(`households/${hid}/milkLots`, token)).map(docToObject)
    medicines[hid] = (await firestoreList(`households/${hid}/medicines`, token)).map(docToObject)
    measurements[hid] = (await firestoreList(`households/${hid}/measurements`, token)).map(
      docToObject,
    )
    notes[hid] = (await firestoreList(`households/${hid}/notes`, token)).map(docToObject)
    try {
      meta[hid] = (await firestoreList(`households/${hid}/meta`, token)).map(docToObject)
    } catch {
      meta[hid] = []
    }

    for (const baby of babies[hid]) {
      if (!baby.photoUrl) continue
      // Best-effort Storage download via Firebase download URL if public-ish; skip on failure.
      try {
        const res = await fetch(baby.photoUrl)
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        const rel = `households/${hid}/babies/${baby.id}/avatar.jpg`
        const dest = join(OUT, 'photos', rel)
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, buf)
        photoIndex.push({ householdId: hid, babyId: baby.id, relPath: rel })
      } catch {
        /* skip */
      }
    }
  }

  let authUsers = await listAuthUsers(token)
  if (authUsers.length === 0) {
    // Prefer Firebase CLI auth:export when the REST admin API is unavailable.
    try {
      const { execFileSync } = await import('node:child_process')
      const authPath = join(OUT, 'auth-users.json')
      execFileSync(
        'npx',
        ['firebase', 'auth:export', authPath, '--format=json', `--project=${PROJECT}`],
        { stdio: ['ignore', 'pipe', 'pipe'], shell: true },
      )
      if (existsSync(authPath)) {
        const raw = JSON.parse(readFileSync(authPath, 'utf8'))
        const list = Array.isArray(raw) ? raw : raw.users ?? []
        authUsers = list.map((u) => ({
          uid: u.localId || u.uid,
          email: u.email ?? null,
          displayName: u.displayName ?? null,
          photoURL: u.photoUrl ?? u.photoURL ?? null,
          providerData: (u.providerUserInfo ?? u.providerData ?? []).map((p) => ({
            providerId: p.providerId,
            uid: p.rawId ?? p.federatedId ?? p.uid,
            email: p.email ?? null,
          })),
        }))
        console.log(`Auth export via firebase CLI: ${authUsers.length} users`)
      }
    } catch {
      console.warn('firebase auth:export unavailable; authUsers empty in dump')
    }
  }

  const dump = {
    exportedAt: new Date().toISOString(),
    projectId: PROJECT,
    users,
    households,
    inviteCodes,
    config: Object.fromEntries(configDocs.map((c) => [c.id, c])),
    babies,
    feedings,
    diapers,
    milkLots,
    medicines,
    measurements,
    notes,
    meta,
    authUsers,
    photoIndex,
  }

  const countMap = (m) => Object.values(m).reduce((n, arr) => n + (arr?.length ?? 0), 0)
  const manifest = {
    users: users.length,
    households: households.length,
    inviteCodes: inviteCodes.length,
    babies: countMap(babies),
    feedings: countMap(feedings),
    diapers: countMap(diapers),
    milkLots: countMap(milkLots),
    medicines: countMap(medicines),
    measurements: countMap(measurements),
    notes: countMap(notes),
    photos: photoIndex.length,
    authUsers: authUsers.length,
  }

  writeFileSync(join(OUT, 'dump.json'), JSON.stringify(dump, null, 2))
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('Manifest:', manifest)
  console.log('Export complete (read-only).')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
