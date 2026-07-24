import { onCall, HttpsError } from 'firebase-functions/v2/https'
import type { DocumentReference } from 'firebase-admin/firestore'
import { db, requireUid, assertHouseholdMember, FieldValue, Timestamp } from './helpers'
import { generateInviteCode } from './constants'

const INVITE_CODE_TTL_MS = 24 * 60 * 60 * 1000

async function generateUniqueInviteCode(): Promise<string> {
  let newCode = generateInviteCode()
  for (let i = 0; i < 5; i++) {
    const taken = await db.doc(`inviteCodes/${newCode}`).get()
    if (!taken.exists) return newCode
    newCode = generateInviteCode()
  }
  return newCode
}

async function applyInviteCodeRotation(
  ref: DocumentReference,
  oldCode: string | undefined,
): Promise<string> {
  const newCode = await generateUniqueInviteCode()
  const batch = db.batch()
  batch.update(ref, { inviteCode: newCode, inviteRotatedAt: FieldValue.serverTimestamp() })
  if (oldCode) batch.delete(db.doc(`inviteCodes/${oldCode}`))
  batch.set(db.doc(`inviteCodes/${newCode}`), { householdId: ref.id })
  await batch.commit()
  return newCode
}

/** Rotate invite code when older than 24h (uses inviteRotatedAt, else createdAt). */
export async function autoRotateInviteCodeIfStale(
  ref: DocumentReference,
  data: FirebaseFirestore.DocumentData,
): Promise<string> {
  const currentCode = data.inviteCode as string | undefined
  if (!currentCode) return ''

  const rotatedAt = data.inviteRotatedAt as Timestamp | undefined
  const createdAt = data.createdAt as Timestamp | undefined
  const anchor = rotatedAt ?? createdAt
  if (!anchor) return currentCode

  const ageMs = Date.now() - anchor.toMillis()
  if (ageMs < INVITE_CODE_TTL_MS) return currentCode

  return applyInviteCodeRotation(ref, currentCode)
}

export type MemberRole = 'owner' | 'admin' | 'member'

const callableOptions = { region: 'us-central1' as const, invoker: 'public' as const }

function normalizeRoles(
  raw: unknown,
  members: string[],
  ownerUid: string,
): Record<string, MemberRole> {
  const roles: Record<string, MemberRole> = {}
  if (raw && typeof raw === 'object') {
    for (const [uid, role] of Object.entries(raw as Record<string, unknown>)) {
      if (role === 'owner' || role === 'admin' || role === 'member') {
        roles[uid] = role
      }
    }
  }
  for (const uid of members) {
    if (!roles[uid]) roles[uid] = uid === ownerUid ? 'owner' : 'member'
  }
  if (ownerUid && members.includes(ownerUid)) roles[ownerUid] = 'owner'
  return roles
}

async function loadHousehold(householdId: string) {
  const snap = await db.doc(`households/${householdId}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Household not found')
  const d = snap.data()!
  const members: string[] = d.members ?? []
  const ownerUid = (d.ownerUid as string | undefined) ?? members[0] ?? ''
  const memberRoles = normalizeRoles(d.memberRoles, members, ownerUid)
  return { ref: snap.ref, data: d, members, ownerUid, memberRoles, inviteCode: d.inviteCode as string }
}

function roleOf(uid: string, ownerUid: string, memberRoles: Record<string, MemberRole>): MemberRole {
  if (uid === ownerUid) return 'owner'
  return memberRoles[uid] ?? 'member'
}

function canManageMembers(role: MemberRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function householdRoleFields(
  d: FirebaseFirestore.DocumentData,
  members: string[],
): { ownerUid: string; memberRoles: Record<string, MemberRole> } {
  const ownerUid = (d.ownerUid as string | undefined) ?? members[0] ?? ''
  return { ownerUid, memberRoles: normalizeRoles(d.memberRoles, members, ownerUid) }
}

export const rotateHouseholdInviteCode = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId?: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const { ref, ownerUid, memberRoles, inviteCode: oldCode } = await loadHousehold(householdId)
  const role = roleOf(uid, ownerUid, memberRoles)
  if (!canManageMembers(role)) {
    throw new HttpsError('permission-denied', 'Only owner or admin can rotate invite code')
  }

  const newCode = await applyInviteCodeRotation(ref, oldCode)
  return { ok: true, inviteCode: newCode }
})

export const removeHouseholdMember = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, memberUid } = request.data as { householdId?: string; memberUid?: string }
  if (!householdId || !memberUid) {
    throw new HttpsError('invalid-argument', 'householdId and memberUid required')
  }

  await assertHouseholdMember(uid, householdId)
  const { ref, members, ownerUid, memberRoles } = await loadHousehold(householdId)
  const actorRole = roleOf(uid, ownerUid, memberRoles)
  const targetRole = roleOf(memberUid, ownerUid, memberRoles)

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
  if (!members.includes(memberUid)) {
    throw new HttpsError('not-found', 'Member not found')
  }

  const nextMembers = members.filter((m) => m !== memberUid)
  const nextRoles = { ...memberRoles }
  delete nextRoles[memberUid]

  const batch = db.batch()
  batch.update(ref, { members: nextMembers, memberRoles: nextRoles })
  batch.set(db.doc(`users/${memberUid}`), { householdId: null }, { merge: true })
  await batch.commit()
  return { ok: true }
})

export const setHouseholdMemberRole = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, memberUid, role } = request.data as {
    householdId?: string
    memberUid?: string
    role?: MemberRole
  }
  if (!householdId || !memberUid || !role) {
    throw new HttpsError('invalid-argument', 'householdId, memberUid, and role required')
  }
  if (role !== 'admin' && role !== 'member') {
    throw new HttpsError('invalid-argument', 'Role must be admin or member')
  }

  await assertHouseholdMember(uid, householdId)
  const { ref, members, ownerUid, memberRoles } = await loadHousehold(householdId)
  if (roleOf(uid, ownerUid, memberRoles) !== 'owner') {
    throw new HttpsError('permission-denied', 'Only the owner can change roles')
  }
  if (memberUid === ownerUid) {
    throw new HttpsError('invalid-argument', 'Use transfer ownership to change owner')
  }
  if (!members.includes(memberUid)) {
    throw new HttpsError('not-found', 'Member not found')
  }

  await ref.update({ memberRoles: { ...memberRoles, [memberUid]: role } })
  return { ok: true }
})

export const transferHouseholdOwnership = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, newOwnerUid } = request.data as { householdId?: string; newOwnerUid?: string }
  if (!householdId || !newOwnerUid) {
    throw new HttpsError('invalid-argument', 'householdId and newOwnerUid required')
  }

  await assertHouseholdMember(uid, householdId)
  const { ref, members, ownerUid, memberRoles } = await loadHousehold(householdId)
  if (uid !== ownerUid) {
    throw new HttpsError('permission-denied', 'Only the owner can transfer ownership')
  }
  if (!members.includes(newOwnerUid)) {
    throw new HttpsError('not-found', 'New owner must be a household member')
  }
  if (newOwnerUid === ownerUid) {
    throw new HttpsError('invalid-argument', 'Already the owner')
  }

  const nextRoles: Record<string, MemberRole> = { ...memberRoles, [newOwnerUid]: 'owner' }
  nextRoles[ownerUid] = 'admin'

  await ref.update({ ownerUid: newOwnerUid, memberRoles: nextRoles })
  return { ok: true }
})

export const leaveHousehold = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId?: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const { ref, members, ownerUid, memberRoles } = await loadHousehold(householdId)
  if (uid === ownerUid && members.length > 1) {
    throw new HttpsError(
      'failed-precondition',
      'Transfer ownership to another member before leaving',
    )
  }

  const nextMembers = members.filter((m) => m !== uid)
  const nextRoles = { ...memberRoles }
  delete nextRoles[uid]

  const batch = db.batch()
  const snap = await ref.get()
  const oldCode = snap.data()?.inviteCode as string | undefined
  if (nextMembers.length === 0) {
    batch.delete(ref)
    if (oldCode) batch.delete(db.doc(`inviteCodes/${oldCode}`))
  } else {
    batch.update(ref, { members: nextMembers, memberRoles: nextRoles })
  }
  batch.set(db.doc(`users/${uid}`), { householdId: null }, { merge: true })
  await batch.commit()
  return { ok: true }
})
