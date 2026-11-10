import { getDb, nowIso, parseJson, toJson, newId } from './db/db.js'
import { HttpsError } from './errors.js'

export type MemberRole = 'owner' | 'admin' | 'member'

const INVITE_CODE_TTL_MS = 24 * 60 * 60 * 1000
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return code
}

export function normalizeRoles(
  raw: unknown,
  members: string[],
  ownerUid: string,
): Record<string, MemberRole> {
  const roles: Record<string, MemberRole> = {}
  if (raw && typeof raw === 'object') {
    for (const [uid, role] of Object.entries(raw as Record<string, unknown>)) {
      if (role === 'owner' || role === 'admin' || role === 'member') roles[uid] = role
    }
  }
  for (const uid of members) {
    if (!roles[uid]) roles[uid] = uid === ownerUid ? 'owner' : 'member'
  }
  if (ownerUid && members.includes(ownerUid)) roles[ownerUid] = 'owner'
  return roles
}

export function assertHouseholdMember(uid: string, householdId: string) {
  const db = getDb()
  const row = db.prepare('SELECT members FROM households WHERE id = ?').get(householdId) as
    | { members: string }
    | undefined
  if (!row) throw new HttpsError('not-found', 'Household not found')
  const members = parseJson<string[]>(row.members, [])
  if (!members.includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a household member')
  }
}

export function assertBabyExists(householdId: string, babyId: string) {
  const db = getDb()
  const row = db
    .prepare('SELECT 1 AS ok FROM babies WHERE household_id = ? AND id = ?')
    .get(householdId, babyId)
  if (!row) throw new HttpsError('invalid-argument', 'Invalid baby')
}

export function parseForPersonId(householdId: string, raw: unknown): string {
  const db = getDb()
  if (typeof raw !== 'string' || !raw.includes(':')) {
    const first = db
      .prepare('SELECT id FROM babies WHERE household_id = ? LIMIT 1')
      .get(householdId) as { id: string } | undefined
    if (!first) throw new HttpsError('invalid-argument', 'No people found in household')
    return `baby:${first.id}`
  }
  if (raw.startsWith('baby:')) {
    const babyId = raw.slice(5)
    assertBabyExists(householdId, babyId)
    return raw
  }
  if (raw.startsWith('member:')) {
    const memberUid = raw.slice(7)
    if (!memberUid) throw new HttpsError('invalid-argument', 'Invalid household member')
    const row = db.prepare('SELECT members FROM households WHERE id = ?').get(householdId) as
      | { members: string }
      | undefined
    const members = parseJson<string[]>(row?.members, [])
    if (!members.includes(memberUid)) {
      throw new HttpsError('invalid-argument', 'Person is not in this household')
    }
    return raw
  }
  throw new HttpsError('invalid-argument', 'Invalid person')
}

export function loadHousehold(householdId: string) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM households WHERE id = ?').get(householdId) as
    | Record<string, unknown>
    | undefined
  if (!row) throw new HttpsError('not-found', 'Household not found')
  const members = parseJson<string[]>(row.members as string, [])
  const ownerUid = (row.owner_uid as string | null) ?? members[0] ?? ''
  const memberRoles = normalizeRoles(parseJson(row.member_roles as string, {}), members, ownerUid)
  return {
    id: String(row.id),
    inviteCode: String(row.invite_code),
    members,
    ownerUid,
    memberRoles,
    personNicknames: parseJson<Record<string, string>>(row.person_nicknames as string, {}),
    memberShowOnHome: parseJson<Record<string, boolean>>(row.member_show_on_home as string, {}),
    createdAt: (row.created_at as string | null) ?? null,
    inviteRotatedAt: (row.invite_rotated_at as string | null) ?? null,
    row,
  }
}

export function roleOf(
  uid: string,
  ownerUid: string,
  memberRoles: Record<string, MemberRole>,
): MemberRole {
  if (uid === ownerUid) return 'owner'
  return memberRoles[uid] ?? 'member'
}

export function canManageMembers(role: MemberRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function generateUniqueInviteCode(): string {
  const db = getDb()
  let code = generateInviteCode()
  for (let i = 0; i < 5; i++) {
    const taken = db.prepare('SELECT 1 AS ok FROM invite_codes WHERE code = ?').get(code)
    if (!taken) return code
    code = generateInviteCode()
  }
  return code
}

export function applyInviteCodeRotation(householdId: string, oldCode: string | undefined): string {
  const db = getDb()
  const newCode = generateUniqueInviteCode()
  const now = nowIso()
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE households SET invite_code = ?, invite_rotated_at = ? WHERE id = ?',
    ).run(newCode, now, householdId)
    if (oldCode) db.prepare('DELETE FROM invite_codes WHERE code = ?').run(oldCode)
    db.prepare('INSERT INTO invite_codes (code, household_id) VALUES (?, ?)').run(
      newCode,
      householdId,
    )
  })
  tx()
  return newCode
}

export function autoRotateInviteCodeIfStale(householdId: string): string {
  const h = loadHousehold(householdId)
  if (!h.inviteCode) return ''
  const anchor = h.inviteRotatedAt ?? h.createdAt
  if (!anchor) return h.inviteCode
  const ageMs = Date.now() - new Date(anchor).getTime()
  if (ageMs < INVITE_CODE_TTL_MS) return h.inviteCode
  return applyInviteCodeRotation(householdId, h.inviteCode)
}

export function createHouseholdForUser(uid: string): { householdId: string; inviteCode: string } {
  const db = getDb()
  const householdId = newId()
  const inviteCode = generateUniqueInviteCode()
  const now = nowIso()
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO households (id, invite_code, members, owner_uid, member_roles, person_nicknames,
        member_show_on_home, created_at, invite_rotated_at)
       VALUES (?, ?, ?, ?, ?, '{}', '{}', ?, ?)`,
    ).run(
      householdId,
      inviteCode,
      toJson([uid]),
      uid,
      toJson({ [uid]: 'owner' }),
      now,
      now,
    )
    db.prepare('INSERT INTO invite_codes (code, household_id) VALUES (?, ?)').run(
      inviteCode,
      householdId,
    )
    db.prepare('UPDATE users SET household_id = ?, updated_at = ? WHERE uid = ?').run(
      householdId,
      now,
      uid,
    )
  })
  tx()
  return { householdId, inviteCode }
}
