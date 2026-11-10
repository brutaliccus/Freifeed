import type { FastifyInstance } from 'fastify'
import { getDb, nowIso, parseJson, toJson } from '../db/db.js'
import { HttpsError } from '../errors.js'
import {
  applyInviteCodeRotation,
  assertHouseholdMember,
  autoRotateInviteCodeIfStale,
  canManageMembers,
  createHouseholdForUser,
  loadHousehold,
  roleOf,
  type MemberRole,
} from '../household.js'
import { registerCallable } from './helpers.js'

export function registerHouseholdRoutes(app: FastifyInstance) {
  registerCallable(app, 'createHousehold', (uid) => createHouseholdForUser(uid), {
    collections: () => ['households'],
    householdId: () => null,
  })

  registerCallable(app, 'joinHousehold', (uid, body) => {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!code) throw new HttpsError('invalid-argument', 'Invite code required')
    const db = getDb()
    const codeRow = db.prepare('SELECT household_id FROM invite_codes WHERE code = ?').get(code) as
      | { household_id: string }
      | undefined
    if (!codeRow) throw new HttpsError('not-found', 'Invalid invite code')
    const householdId = codeRow.household_id
    const h = loadHousehold(householdId)
    if (!h.members.includes(uid)) {
      const members = [...h.members, uid]
      const roles = { ...h.memberRoles, [uid]: 'member' as MemberRole }
      db.prepare('UPDATE households SET members = ?, member_roles = ? WHERE id = ?').run(
        toJson(members),
        toJson(roles),
        householdId,
      )
    }
    db.prepare('UPDATE users SET household_id = ?, updated_at = ? WHERE uid = ?').run(
      householdId,
      nowIso(),
      uid,
    )
    return { householdId }
  })

  registerCallable(app, 'getHousehold', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const inviteCode = autoRotateInviteCodeIfStale(householdId)
    const h = loadHousehold(householdId)
    const db = getDb()
    const memberProfiles = h.members.map((memberUid) => {
      const u = db.prepare('SELECT display_name, email FROM users WHERE uid = ?').get(memberUid) as
        | { display_name: string | null; email: string | null }
        | undefined
      return {
        uid: memberUid,
        displayName: u?.display_name ?? null,
        email: u?.email ?? null,
      }
    })
    return {
      household: {
        id: h.id,
        inviteCode: inviteCode || h.inviteCode,
        members: h.members,
        memberProfiles,
        personNicknames: h.personNicknames,
        memberShowOnHome: h.memberShowOnHome,
        ownerUid: h.ownerUid,
        memberRoles: h.memberRoles,
        createdAt: h.createdAt,
      },
    }
  })

  registerCallable(
    app,
    'setPersonNickname',
    (uid, body) => {
      const householdId = body.householdId as string
      const personId = body.personId as string
      const nickname = body.nickname as string | undefined
      if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
      if (!personId || typeof personId !== 'string') {
        throw new HttpsError('invalid-argument', 'personId required')
      }
      if (!/^(baby:[a-z0-9_-]+|member:[a-zA-Z0-9]+)$/.test(personId)) {
        throw new HttpsError('invalid-argument', 'invalid personId')
      }
      assertHouseholdMember(uid, householdId)
      const h = loadHousehold(householdId)
      const map = { ...h.personNicknames }
      const trimmed = typeof nickname === 'string' ? nickname.trim() : ''
      if (!trimmed) delete map[personId]
      else map[personId] = trimmed.slice(0, 40)
      getDb()
        .prepare('UPDATE households SET person_nicknames = ? WHERE id = ?')
        .run(toJson(map), householdId)
      return { ok: true }
    },
    { collections: () => ['households'] },
  )

  registerCallable(
    app,
    'setMemberShowOnHome',
    (uid, body) => {
      const householdId = body.householdId as string
      const memberUid = body.memberUid as string
      if (!householdId || !memberUid) {
        throw new HttpsError('invalid-argument', 'householdId and memberUid required')
      }
      assertHouseholdMember(uid, householdId)
      const h = loadHousehold(householdId)
      if (!h.members.includes(memberUid)) {
        throw new HttpsError('invalid-argument', 'Not a household member')
      }
      const map = { ...h.memberShowOnHome }
      if (body.showOnHome === true) map[memberUid] = true
      else delete map[memberUid]
      getDb()
        .prepare('UPDATE households SET member_show_on_home = ? WHERE id = ?')
        .run(toJson(map), householdId)
      return { ok: true }
    },
    { collections: () => ['households'] },
  )

  registerCallable(
    app,
    'rotateHouseholdInviteCode',
    (uid, body) => {
      const householdId = body.householdId as string
      if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
      assertHouseholdMember(uid, householdId)
      const h = loadHousehold(householdId)
      const role = roleOf(uid, h.ownerUid, h.memberRoles)
      if (!canManageMembers(role)) {
        throw new HttpsError('permission-denied', 'Only owner or admin can rotate invite code')
      }
      const inviteCode = applyInviteCodeRotation(householdId, h.inviteCode)
      return { ok: true, inviteCode }
    },
    { collections: () => ['households'] },
  )

  registerCallable(
    app,
    'removeHouseholdMember',
    (uid, body) => {
      const householdId = body.householdId as string
      const memberUid = body.memberUid as string
      if (!householdId || !memberUid) {
        throw new HttpsError('invalid-argument', 'householdId and memberUid required')
      }
      assertHouseholdMember(uid, householdId)
      const h = loadHousehold(householdId)
      const actorRole = roleOf(uid, h.ownerUid, h.memberRoles)
      const targetRole = roleOf(memberUid, h.ownerUid, h.memberRoles)
      if (memberUid === uid) {
        throw new HttpsError('invalid-argument', 'Use leave household to remove yourself')
      }
      if (!canManageMembers(actorRole)) {
        throw new HttpsError('permission-denied', 'Only owner or admin can remove members')
      }
      if (targetRole === 'owner') {
        throw new HttpsError('permission-denied', 'Transfer ownership before removing the owner')
      }
      if (actorRole === 'admin' && targetRole === 'admin') {
        throw new HttpsError('permission-denied', 'Admins cannot remove other admins')
      }
      if (!h.members.includes(memberUid)) throw new HttpsError('not-found', 'Member not found')
      const nextMembers = h.members.filter((m) => m !== memberUid)
      const nextRoles = { ...h.memberRoles }
      delete nextRoles[memberUid]
      const db = getDb()
      const tx = db.transaction(() => {
        db.prepare('UPDATE households SET members = ?, member_roles = ? WHERE id = ?').run(
          toJson(nextMembers),
          toJson(nextRoles),
          householdId,
        )
        db.prepare('UPDATE users SET household_id = NULL, updated_at = ? WHERE uid = ?').run(
          nowIso(),
          memberUid,
        )
      })
      tx()
      return { ok: true }
    },
    { collections: () => ['households'] },
  )

  registerCallable(
    app,
    'setHouseholdMemberRole',
    (uid, body) => {
      const householdId = body.householdId as string
      const memberUid = body.memberUid as string
      const role = body.role as MemberRole
      if (!householdId || !memberUid || !role) {
        throw new HttpsError('invalid-argument', 'householdId, memberUid, and role required')
      }
      if (role !== 'admin' && role !== 'member') {
        throw new HttpsError('invalid-argument', 'Role must be admin or member')
      }
      assertHouseholdMember(uid, householdId)
      const h = loadHousehold(householdId)
      if (roleOf(uid, h.ownerUid, h.memberRoles) !== 'owner') {
        throw new HttpsError('permission-denied', 'Only the owner can change roles')
      }
      if (memberUid === h.ownerUid) {
        throw new HttpsError('invalid-argument', 'Use transfer ownership to change owner')
      }
      if (!h.members.includes(memberUid)) throw new HttpsError('not-found', 'Member not found')
      getDb()
        .prepare('UPDATE households SET member_roles = ? WHERE id = ?')
        .run(toJson({ ...h.memberRoles, [memberUid]: role }), householdId)
      return { ok: true }
    },
    { collections: () => ['households'] },
  )

  registerCallable(
    app,
    'transferHouseholdOwnership',
    (uid, body) => {
      const householdId = body.householdId as string
      const newOwnerUid = body.newOwnerUid as string
      if (!householdId || !newOwnerUid) {
        throw new HttpsError('invalid-argument', 'householdId and newOwnerUid required')
      }
      assertHouseholdMember(uid, householdId)
      const h = loadHousehold(householdId)
      if (uid !== h.ownerUid) {
        throw new HttpsError('permission-denied', 'Only the owner can transfer ownership')
      }
      if (!h.members.includes(newOwnerUid)) {
        throw new HttpsError('not-found', 'New owner must be a household member')
      }
      if (newOwnerUid === h.ownerUid) throw new HttpsError('invalid-argument', 'Already the owner')
      const nextRoles: Record<string, MemberRole> = {
        ...h.memberRoles,
        [newOwnerUid]: 'owner',
        [h.ownerUid]: 'admin',
      }
      getDb()
        .prepare('UPDATE households SET owner_uid = ?, member_roles = ? WHERE id = ?')
        .run(newOwnerUid, toJson(nextRoles), householdId)
      return { ok: true }
    },
    { collections: () => ['households'] },
  )

  registerCallable(
    app,
    'leaveHousehold',
    (uid, body) => {
      const householdId = body.householdId as string
      if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
      assertHouseholdMember(uid, householdId)
      const h = loadHousehold(householdId)
      if (uid === h.ownerUid && h.members.length > 1) {
        throw new HttpsError(
          'failed-precondition',
          'Transfer ownership to another member before leaving',
        )
      }
      const nextMembers = h.members.filter((m) => m !== uid)
      const nextRoles = { ...h.memberRoles }
      delete nextRoles[uid]
      const db = getDb()
      const tx = db.transaction(() => {
        if (nextMembers.length === 0) {
          db.prepare('DELETE FROM invite_codes WHERE household_id = ?').run(householdId)
          db.prepare('DELETE FROM households WHERE id = ?').run(householdId)
        } else {
          db.prepare('UPDATE households SET members = ?, member_roles = ? WHERE id = ?').run(
            toJson(nextMembers),
            toJson(nextRoles),
            householdId,
          )
        }
        db.prepare('UPDATE users SET household_id = NULL, updated_at = ? WHERE uid = ?').run(
          nowIso(),
          uid,
        )
      })
      tx()
      return { ok: true }
    },
    { collections: () => ['households'] },
  )

  registerCallable(app, 'exportHouseholdData', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const db = getDb()
    const h = loadHousehold(householdId)
    const babies = db
      .prepare('SELECT * FROM babies WHERE household_id = ?')
      .all(householdId) as Record<string, unknown>[]
    const feedings = db
      .prepare('SELECT * FROM feedings WHERE household_id = ? ORDER BY created_at DESC')
      .all(householdId) as Record<string, unknown>[]
    const diapers = db
      .prepare('SELECT * FROM diapers WHERE household_id = ? ORDER BY changed_at DESC')
      .all(householdId) as Record<string, unknown>[]
    const milkLots = db
      .prepare('SELECT * FROM milk_lots WHERE household_id = ?')
      .all(householdId) as Record<string, unknown>[]
    const medicines = db
      .prepare('SELECT * FROM medicines WHERE household_id = ?')
      .all(householdId) as Record<string, unknown>[]

    return {
      exportedAt: new Date().toISOString(),
      household: {
        id: h.id,
        inviteCode: h.inviteCode,
        members: h.members,
        ownerUid: h.ownerUid,
      },
      babies: babies.map((b) => ({
        id: b.id,
        name: b.name,
        birthDate: b.birth_date,
        photoUrl: b.photo_url,
        sex: b.sex,
        showOnHome: b.show_on_home !== 0,
      })),
      feedings: feedings.map((f) => ({
        id: f.id,
        type: f.type,
        babyId: f.baby_id,
        side: f.side,
        startAt: f.start_at,
        endAt: f.end_at,
        volumeOz: f.volume_oz,
        milkStorage: f.milk_storage,
        storedAt: f.stored_at,
        milkLotId: f.milk_lot_id,
        milkDeductions: parseJson(f.milk_deductions as string, []),
        note: f.note,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
      diapers: diapers.map((d) => ({
        id: d.id,
        babyId: d.baby_id,
        kind: d.kind,
        changedAt: d.changed_at,
        note: d.note,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
      milkLots: milkLots.map((m) => ({
        id: m.id,
        pumpedAt: m.pumped_at,
        storedAt: m.stored_at,
        volumeOz: m.volume_oz,
        remainingOz: m.remaining_oz,
        storage: m.storage,
        feedingId: m.feeding_id,
        note: m.note,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
      medicines: medicines.map((m) => ({
        id: m.id,
        forPersonId: m.for_person_id,
        name: m.name,
        totalPills: m.total_pills,
        dosage: m.dosage,
        category: m.category,
        durationDays: m.duration_days,
        frequency: parseJson(m.frequency as string, null),
        startedAt: m.started_at,
        lastTakenAt: m.last_taken_at,
        active: m.active !== 0,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
    }
  })
}
