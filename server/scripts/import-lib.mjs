import Database from 'better-sqlite3'
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, '../src/db/schema.sql')

function ts(value) {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return new Date(value).toISOString()
  if (typeof value === 'object' && value._seconds != null) {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6)).toISOString()
  }
  if (typeof value === 'object' && value.seconds != null) {
    return new Date(value.seconds * 1000).toISOString()
  }
  return null
}

function j(value) {
  return JSON.stringify(value ?? null)
}

/**
 * Import a dump directory (dump.json + optional photos/) into SQLite.
 * Preserves original document IDs.
 */
export function importDumpToSqlite(dumpDir, dbPath) {
  const dumpFile = join(dumpDir, 'dump.json')
  if (!existsSync(dumpFile)) throw new Error(`Missing ${dumpFile}`)
  const dump = JSON.parse(readFileSync(dumpFile, 'utf8'))
  mkdirSync(dirname(dbPath), { recursive: true })

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(schemaPath, 'utf8'))

  const now = new Date().toISOString()
  const counts = {
    users: 0,
    households: 0,
    babies: 0,
    feedings: 0,
    milkLots: 0,
    diapers: 0,
    medicines: 0,
    measurements: 0,
    notes: 0,
    inviteCodes: 0,
    photos: 0,
  }

  const authByUid = new Map()
  for (const u of dump.authUsers ?? []) {
    authByUid.set(u.uid, u)
  }

  const insertUser = db.prepare(
    `INSERT OR REPLACE INTO users (uid, google_sub, email, display_name, photo_url, household_id,
      skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, home_primary_action, ui_scale,
      app_theme, fcm_tokens, created_at, updated_at)
     VALUES (@uid, @google_sub, @email, @display_name, @photo_url, @household_id,
      @skipped_baby, @skipped_photo, @nav_trackers, @home_primary, @ui_scale, @app_theme, @fcm_tokens, @created_at, @updated_at)`,
  )

  for (const u of dump.users ?? []) {
    const auth = authByUid.get(u.uid) ?? u
    let googleSub = u.google_sub ?? null
    const providers = auth.providerData ?? u.providerData ?? []
    for (const p of providers) {
      if (p.providerId === 'google.com' && p.uid) googleSub = p.uid
    }
    insertUser.run({
      uid: u.uid,
      google_sub: googleSub,
      email: u.email ?? auth.email ?? null,
      display_name: u.displayName ?? auth.displayName ?? null,
      photo_url: u.photoURL ?? auth.photoURL ?? null,
      household_id: u.householdId ?? null,
      skipped_baby: u.skippedBabyOnboarding ? 1 : 0,
      skipped_photo: u.skippedPhotoOnboarding ? 1 : 0,
      nav_trackers: j(u.navTrackers ?? null),
      home_primary: u.homePrimaryAction ?? 'nursing',
      ui_scale: u.uiScale ?? 1,
      app_theme: u.appTheme ?? 'buba',
      fcm_tokens: j(u.fcmTokens ?? []),
      created_at: ts(u.createdAt) ?? now,
      updated_at: ts(u.updatedAt) ?? now,
    })
    counts.users++
  }

  const insertHousehold = db.prepare(
    `INSERT OR REPLACE INTO households (id, invite_code, members, owner_uid, member_roles, person_nicknames,
      member_show_on_home, created_at, invite_rotated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const h of dump.households ?? []) {
    insertHousehold.run(
      h.id,
      h.inviteCode ?? 'UNKNOWN',
      j(h.members ?? []),
      h.ownerUid ?? (h.members?.[0] ?? null),
      j(h.memberRoles ?? {}),
      j(h.personNicknames ?? {}),
      j(h.memberShowOnHome ?? {}),
      ts(h.createdAt) ?? now,
      ts(h.inviteRotatedAt),
    )
    counts.households++
  }

  const insertInvite = db.prepare(
    `INSERT OR REPLACE INTO invite_codes (code, household_id) VALUES (?, ?)`,
  )
  for (const row of dump.inviteCodes ?? []) {
    insertInvite.run(row.code, row.householdId)
    counts.inviteCodes++
  }

  function forHouseholdMap(map, fn) {
    if (!map || typeof map !== 'object') return
    for (const [hid, rows] of Object.entries(map)) {
      for (const row of rows ?? []) fn(hid, row)
    }
  }

  const insertBaby = db.prepare(
    `INSERT OR REPLACE INTO babies (id, household_id, name, birth_date, birth_weight_lb, birth_weight_oz,
      birth_height_in, photo_url, border_color_id, sex, tracker_visibility, show_on_home)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  forHouseholdMap(dump.babies, (hid, b) => {
    insertBaby.run(
      b.id,
      hid,
      b.name ?? 'Baby',
      b.birthDate ?? null,
      b.birthWeightLb ?? null,
      b.birthWeightOz ?? null,
      b.birthHeightIn ?? null,
      b.photoUrl ?? null,
      b.borderColorId ?? null,
      b.sex ?? null,
      j(b.trackerVisibility ?? null),
      b.showOnHome === false ? 0 : 1,
    )
    counts.babies++
  })

  const insertFeeding = db.prepare(
    `INSERT OR REPLACE INTO feedings (id, household_id, type, baby_id, side, start_at, end_at, volume_oz,
      milk_storage, stored_at, milk_lot_id, milk_deductions, weight_lb, weight_oz, note, last_actor_uid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  forHouseholdMap(dump.feedings, (hid, f) => {
    insertFeeding.run(
      f.id,
      hid,
      f.type ?? 'nursing',
      f.babyId,
      f.side ?? null,
      ts(f.startAt),
      ts(f.endAt),
      f.volumeOz ?? null,
      f.milkStorage ?? null,
      ts(f.storedAt),
      f.milkLotId ?? null,
      j(f.milkDeductions ?? []),
      f.weightLb ?? null,
      f.weightOz ?? null,
      f.note ?? null,
      f.lastActorUid ?? null,
      ts(f.createdAt) ?? now,
      ts(f.updatedAt) ?? now,
    )
    counts.feedings++
  })

  const insertLot = db.prepare(
    `INSERT OR REPLACE INTO milk_lots (id, household_id, pumped_at, stored_at, volume_oz, remaining_oz,
      storage, feeding_id, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  forHouseholdMap(dump.milkLots, (hid, m) => {
    insertLot.run(
      m.id,
      hid,
      ts(m.pumpedAt) ?? now,
      ts(m.storedAt) ?? now,
      m.volumeOz ?? 0,
      m.remainingOz ?? 0,
      m.storage ?? 'fridge',
      m.feedingId ?? null,
      m.note ?? null,
      ts(m.createdAt) ?? now,
      ts(m.updatedAt) ?? now,
    )
    counts.milkLots++
  })

  const insertDiaper = db.prepare(
    `INSERT OR REPLACE INTO diapers (id, household_id, baby_id, kind, changed_at, note, last_actor_uid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  forHouseholdMap(dump.diapers, (hid, d) => {
    insertDiaper.run(
      d.id,
      hid,
      d.babyId,
      d.kind,
      ts(d.changedAt) ?? now,
      d.note ?? null,
      d.lastActorUid ?? null,
      ts(d.createdAt) ?? now,
      ts(d.updatedAt) ?? now,
    )
    counts.diapers++
  })

  const insertMed = db.prepare(
    `INSERT OR REPLACE INTO medicines (id, household_id, for_person_id, name, total_pills, dosage, category,
      duration_days, frequency, started_at, last_taken_at, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  forHouseholdMap(dump.medicines, (hid, m) => {
    insertMed.run(
      m.id,
      hid,
      m.forPersonId ?? 'baby:unknown',
      m.name ?? '',
      m.totalPills ?? 0,
      m.dosage ?? '',
      m.category ?? 'required',
      m.durationDays ?? null,
      j(m.frequency ?? {}),
      ts(m.startedAt),
      ts(m.lastTakenAt),
      m.active === false ? 0 : 1,
      ts(m.createdAt) ?? now,
      ts(m.updatedAt) ?? now,
    )
    counts.medicines++
  })

  const insertMeas = db.prepare(
    `INSERT OR REPLACE INTO measurements (id, household_id, baby_id, measured_at, weight_lb, weight_oz,
      length_in, head_circ_in, note, last_actor_uid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  forHouseholdMap(dump.measurements, (hid, m) => {
    insertMeas.run(
      m.id,
      hid,
      m.babyId,
      ts(m.measuredAt) ?? now,
      m.weightLb ?? null,
      m.weightOz ?? null,
      m.lengthIn ?? null,
      m.headCircIn ?? null,
      m.note ?? null,
      m.lastActorUid ?? null,
      ts(m.createdAt) ?? now,
      ts(m.updatedAt) ?? now,
    )
    counts.measurements++
  })

  const insertNote = db.prepare(
    `INSERT OR REPLACE INTO notes (id, household_id, for_person_id, for_person_ids, baby_id, kind, text, details,
      scheduled_at, reminder_minutes_before, recurrence, invitee_person_ids, archived, completed_at,
      last_archived_occurrence_at, last_actor_uid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  forHouseholdMap(dump.notes, (hid, n) => {
    insertNote.run(
      n.id,
      hid,
      n.forPersonId ?? null,
      j(n.forPersonIds ?? []),
      n.babyId ?? null,
      n.kind ?? 'todo',
      n.text ?? '',
      n.details ?? null,
      ts(n.scheduledAt),
      n.reminderMinutesBefore ?? null,
      j(n.recurrence ?? null),
      j(n.inviteePersonIds ?? []),
      n.archived ? 1 : 0,
      ts(n.completedAt),
      ts(n.lastArchivedOccurrenceAt),
      n.lastActorUid ?? null,
      ts(n.createdAt) ?? now,
      ts(n.updatedAt) ?? now,
    )
    counts.notes++
  })

  // Copy photos if present: photos/households/{hid}/babies/{bid}/avatar.jpg
  const photosRoot = join(dumpDir, 'photos')
  if (existsSync(photosRoot)) {
    // Caller / import script may also copy into DATA_DIR; count files for verification.
    // Shallow walk via dump.photoIndex if present.
    const index = dump.photoIndex ?? []
    for (const p of index) {
      const src = join(photosRoot, p.relPath)
      if (existsSync(src)) counts.photos++
    }
  }

  db.close()
  return counts
}

export function printVerification(counts, manifest) {
  const keys = [
    'users',
    'households',
    'babies',
    'feedings',
    'milkLots',
    'diapers',
    'medicines',
    'measurements',
    'notes',
    'photos',
  ]
  console.log('\nImport verification')
  console.log('collection'.padEnd(16), 'imported'.padStart(10), 'manifest'.padStart(10))
  for (const k of keys) {
    console.log(
      k.padEnd(16),
      String(counts[k] ?? 0).padStart(10),
      String(manifest?.[k] ?? '?').padStart(10),
    )
  }
}
