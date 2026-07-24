import { initializeApp, getApps } from 'firebase-admin/app'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp()
}

export const db = getFirestore()

export function requireUid(request: CallableRequest): string {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required')
  }
  return request.auth.uid
}

export function serializeTimestamp(ts: Timestamp | undefined | null): string | null {
  if (!ts) return null
  return ts.toDate().toISOString()
}

export function parseOptionalDate(iso: string | null | undefined): Timestamp | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid date')
  }
  return Timestamp.fromDate(d)
}

const MEMBERSHIP_CACHE_TTL_MS = 5 * 60 * 1000
const membershipCache = new Map<string, number>()

export async function assertHouseholdMember(uid: string, householdId: string) {
  const cacheKey = `${uid}:${householdId}`
  const cachedUntil = membershipCache.get(cacheKey)
  if (cachedUntil != null && cachedUntil > Date.now()) return

  const snap = await db.doc(`households/${householdId}`).get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Household not found')
  }
  const members: string[] = snap.data()?.members ?? []
  if (!members.includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a household member')
  }
  membershipCache.set(cacheKey, Date.now() + MEMBERSHIP_CACHE_TTL_MS)
}

export async function getUserHouseholdId(uid: string): Promise<string | null> {
  const snap = await db.doc(`users/${uid}`).get()
  return snap.exists ? (snap.data()?.householdId ?? null) : null
}

export async function assertBabyExists(householdId: string, babyId: string): Promise<void> {
  const snap = await db.doc(`households/${householdId}/babies/${babyId}`).get()
  if (!snap.exists) throw new HttpsError('invalid-argument', 'Invalid baby')
}

/** `baby:<id>` or `member:<uid>` */
export async function parseForPersonId(householdId: string, raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || !raw.includes(':')) {
    const babiesSnap = await db.collection(`households/${householdId}/babies`).limit(1).get()
    const firstBabyId = babiesSnap.docs[0]?.id
    if (!firstBabyId) throw new HttpsError('invalid-argument', 'No people found in household')
    return `baby:${firstBabyId}`
  }
  if (raw.startsWith('baby:')) {
    const babyId = raw.slice(5)
    const babySnap = await db.doc(`households/${householdId}/babies/${babyId}`).get()
    if (!babySnap.exists) {
      throw new HttpsError('invalid-argument', 'Invalid baby')
    }
    return raw
  }
  if (raw.startsWith('member:')) {
    const uid = raw.slice(7)
    if (!uid) throw new HttpsError('invalid-argument', 'Invalid household member')
    const household = await db.doc(`households/${householdId}`).get()
    const members: string[] = household.data()?.members ?? []
    if (!members.includes(uid)) {
      throw new HttpsError('invalid-argument', 'Person is not in this household')
    }
    return raw
  }
  throw new HttpsError('invalid-argument', 'Invalid person')
}

export { FieldValue, Timestamp }
