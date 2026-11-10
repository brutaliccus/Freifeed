import { openMemoryDb, setDbForTests, nowIso, toJson, newId } from '../src/db/db.js'

export function setupTestDb() {
  const db = openMemoryDb()
  setDbForTests(db)
  return db
}

export function seedHousehold(opts?: { memberUid?: string; outsiderUid?: string }) {
  const db = setupTestDb()
  const memberUid = opts?.memberUid ?? 'user-member'
  const outsiderUid = opts?.outsiderUid ?? 'user-outsider'
  const householdId = 'hh-test'
  const babyId = 'baby1'
  const now = nowIso()

  db.prepare(
    `INSERT INTO users (uid, google_sub, email, display_name, photo_url, household_id,
      skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
     VALUES (?, NULL, ?, ?, NULL, ?, 0, 0, '{}', '[]', ?, ?)`,
  ).run(memberUid, 'member@test.com', 'Member', householdId, now, now)

  db.prepare(
    `INSERT INTO users (uid, google_sub, email, display_name, photo_url, household_id,
      skipped_baby_onboarding, skipped_photo_onboarding, nav_trackers, fcm_tokens, created_at, updated_at)
     VALUES (?, NULL, ?, ?, NULL, NULL, 0, 0, '{}', '[]', ?, ?)`,
  ).run(outsiderUid, 'out@test.com', 'Outsider', now, now)

  db.prepare(
    `INSERT INTO households (id, invite_code, members, owner_uid, member_roles, person_nicknames,
      member_show_on_home, created_at, invite_rotated_at)
     VALUES (?, 'ABC123', ?, ?, ?, '{}', '{}', ?, ?)`,
  ).run(
    householdId,
    toJson([memberUid]),
    memberUid,
    toJson({ [memberUid]: 'owner' }),
    now,
    now,
  )
  db.prepare('INSERT INTO invite_codes (code, household_id) VALUES (?, ?)').run('ABC123', householdId)
  db.prepare(
    `INSERT INTO babies (id, household_id, name, birth_date, birth_weight_lb, birth_weight_oz,
      birth_height_in, photo_url, border_color_id, sex, tracker_visibility, show_on_home)
     VALUES (?, ?, 'Test Baby', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', 1)`,
  ).run(babyId, householdId)

  return { db, householdId, babyId, memberUid, outsiderUid, now }
}

export { nowIso, newId, toJson }
