import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import {
  db,
  requireUid,
  serializeTimestamp,
  parseOptionalDate,
  assertHouseholdMember,
  assertBabyExists,
  FieldValue,
  Timestamp,
} from './helpers'
import { generateInviteCode } from './constants'
import { householdRoleFields, autoRotateInviteCodeIfStale } from './householdAdmin'
import { MAX_LIST_LIMIT, parseSinceDays, sinceTimestamp } from './listQuery'
import {
  type FeedingInputPayload,
  parseBabyId,
  validateFeedingInput,
  type MilkStorage,
} from './feedValidation'

export {
  listMedicines,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  setMedicineActive,
  markMedicineTaken,
} from './medicines'

export { listDiapers, createDiaper, updateDiaper, deleteDiaper } from './diapers'

export {
  listMeasurements,
  createMeasurement,
  updateMeasurement,
  deleteMeasurement,
} from './measurements'

export { listNotes, createNote, updateNote, archiveNote, unarchiveNote, deleteNote } from './notes'

export { getAndroidAppUpdate, downloadAndroidApk } from './appUpdate'
export { onFeedingInProgress } from './feedPush'
export {
  rotateHouseholdInviteCode,
  removeHouseholdMember,
  setHouseholdMemberRole,
  transferHouseholdOwnership,
  leaveHousehold,
  householdRoleFields,
  autoRotateInviteCodeIfStale,
} from './householdAdmin'
export {
  onFeedingSyncPulse,
  onDiaperSyncPulse,
  onMilkLotSyncPulse,
  onMedicineSyncPulse,
  onMeasurementSyncPulse,
  onNoteSyncPulse,
} from './syncPulse'

const region = 'us-central1'

/**
 * Gen 2 callables run on Cloud Run. Browsers must be allowed to invoke without a
 * Cloud Run OAuth header; Firebase Auth is validated inside the callable payload.
 * (Freilifts uses the same pattern; its callables work because deploy applied IAM
 * to every function — partial skips left getUserProfile private.)
 */
const callableOptions = { region, invoker: 'public' as const }

function normalizeBabyName(raw: unknown, fallback = 'Baby'): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  return (text || fallback).slice(0, 40)
}

export const getUserProfile = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const snap = await db.doc(`users/${uid}`).get()
  if (!snap.exists) return { profile: null }
  const d = snap.data()!
  return {
    profile: {
      uid,
      email: d.email ?? null,
      displayName: d.displayName ?? null,
      photoURL: d.photoURL ?? null,
      householdId: d.householdId ?? null,
      skippedBabyOnboarding: d.skippedBabyOnboarding ?? false,
      skippedPhotoOnboarding: d.skippedPhotoOnboarding ?? false,
      navTrackers: normalizeNavTrackers(d.navTrackers),
      homePrimaryAction: normalizeHomePrimaryAction(d.homePrimaryAction),
      uiScale: normalizeUiScale(d.uiScale),
      appTheme: normalizeAppTheme(d.appTheme),
    },
  }
})

function normalizeNavTrackers(raw: unknown): {
  nursing: boolean
  milk: boolean
  diaper: boolean
  medicine: boolean
  notes: boolean
  measurements: boolean
} {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    nursing: o.nursing !== false,
    milk: o.milk !== false,
    diaper: o.diaper !== false,
    medicine: o.medicine !== false,
    notes: o.notes !== false,
    measurements: o.measurements !== false,
  }
}

const HOME_PRIMARY_ACTIONS = new Set(['nursing', 'milk', 'diaper', 'medicine'])

function normalizeHomePrimaryAction(raw: unknown): string {
  if (typeof raw === 'string' && HOME_PRIMARY_ACTIONS.has(raw)) return raw
  return 'nursing'
}

function normalizeUiScale(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1
  return Math.min(1.25, Math.max(0.85, raw))
}

const APP_THEMES = new Set(['buba', 'ocean', 'sage'])

function normalizeAppTheme(raw: unknown): string {
  if (typeof raw === 'string' && APP_THEMES.has(raw)) return raw
  return 'buba'
}

export const updateAppSettings = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { navTrackers, homePrimaryAction, uiScale, appTheme } = request.data as {
    navTrackers?: Record<string, unknown>
    homePrimaryAction?: unknown
    uiScale?: unknown
    appTheme?: unknown
  }
  const patch: Record<string, unknown> = {}
  if (navTrackers && typeof navTrackers === 'object') {
    patch.navTrackers = normalizeNavTrackers(navTrackers)
  }
  if (homePrimaryAction !== undefined) {
    patch.homePrimaryAction = normalizeHomePrimaryAction(homePrimaryAction)
  }
  if (uiScale !== undefined) {
    patch.uiScale = normalizeUiScale(uiScale)
  }
  if (appTheme !== undefined) {
    patch.appTheme = normalizeAppTheme(appTheme)
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpsError('invalid-argument', 'No settings to update')
  }
  await db.doc(`users/${uid}`).set(patch, { merge: true })
  return { ok: true }
})

export const updateNavTrackers = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { navTrackers } = request.data as { navTrackers?: Record<string, unknown> }
  if (!navTrackers || typeof navTrackers !== 'object') {
    throw new HttpsError('invalid-argument', 'navTrackers required')
  }
  await db.doc(`users/${uid}`).set(
    { navTrackers: normalizeNavTrackers(navTrackers) },
    { merge: true },
  )
  return { ok: true }
})

export const upsertUserProfile = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { email, displayName, photoURL } = request.data as {
    email?: string | null
    displayName?: string | null
    photoURL?: string | null
  }
  const ref = db.doc(`users/${uid}`)
  const existing = await ref.get()
  if (existing.exists) {
    await ref.set(
      {
        email: email ?? null,
        displayName: displayName ?? null,
        photoURL: photoURL ?? null,
      },
      { merge: true },
    )
  } else {
    await ref.set({
      email: email ?? null,
      displayName: displayName ?? null,
      photoURL: photoURL ?? null,
      householdId: null,
      skippedBabyOnboarding: false,
      skippedPhotoOnboarding: false,
    })
  }
  return { ok: true }
})

export const registerPushToken = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { token } = request.data as { token?: string }
  if (!token || typeof token !== 'string') {
    throw new HttpsError('invalid-argument', 'token required')
  }
  await db.doc(`users/${uid}`).set({ fcmTokens: FieldValue.arrayUnion(token) }, { merge: true })
  console.error('registerPushToken ok', uid, token.slice(0, 12))
  return { ok: true }
})

export const createHousehold = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const householdRef = db.collection('households').doc()
  const householdId = householdRef.id

  let inviteCode = generateInviteCode()
  for (let i = 0; i < 5; i++) {
    const taken = await db.doc(`inviteCodes/${inviteCode}`).get()
    if (!taken.exists) break
    inviteCode = generateInviteCode()
  }

  const batch = db.batch()
  batch.set(householdRef, {
    inviteCode,
    members: [uid],
    ownerUid: uid,
    memberRoles: { [uid]: 'owner' },
    createdAt: FieldValue.serverTimestamp(),
    inviteRotatedAt: FieldValue.serverTimestamp(),
  })
  batch.set(db.doc(`inviteCodes/${inviteCode}`), { householdId })
  batch.set(db.doc(`users/${uid}`), { householdId }, { merge: true })
  await batch.commit()

  return { householdId, inviteCode }
})

export const joinHousehold = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { code } = request.data as { code: string }
  if (!code?.trim()) throw new HttpsError('invalid-argument', 'Invite code required')

  const normalized = code.trim().toUpperCase()
  const codeSnap = await db.doc(`inviteCodes/${normalized}`).get()
  if (!codeSnap.exists) throw new HttpsError('not-found', 'Invalid invite code')

  const householdId = codeSnap.data()!.householdId as string
  const householdRef = db.doc(`households/${householdId}`)
  const householdSnap = await householdRef.get()
  if (!householdSnap.exists) throw new HttpsError('not-found', 'Household not found')

  const members: string[] = householdSnap.data()?.members ?? []
  const existingRoles = (householdSnap.data()?.memberRoles ?? {}) as Record<string, string>
  if (!members.includes(uid)) {
    await householdRef.update({
      members: [...members, uid],
      memberRoles: { ...existingRoles, [uid]: 'member' },
    })
  }
  await db.doc(`users/${uid}`).set({ householdId }, { merge: true })

  return { householdId }
})

export const getHousehold = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const snap = await db.doc(`households/${householdId}`).get()
  if (!snap.exists) return { household: null }

  const d = snap.data()!
  const inviteCode = await autoRotateInviteCodeIfStale(snap.ref, d)
  const memberIds: string[] = d.members ?? []
  const { ownerUid, memberRoles } = householdRoleFields(d, memberIds)
  const memberProfiles = await Promise.all(
    memberIds.map(async (memberUid) => {
      const userSnap = await db.doc(`users/${memberUid}`).get()
      const u = userSnap.data()
      return {
        uid: memberUid,
        displayName: (u?.displayName as string | null | undefined) ?? null,
        email: (u?.email as string | null | undefined) ?? null,
      }
    }),
  )
  const rawNicknames = d.personNicknames
  const personNicknames: Record<string, string> = {}
  if (rawNicknames && typeof rawNicknames === 'object') {
    for (const [key, val] of Object.entries(rawNicknames as Record<string, unknown>)) {
      if (typeof val === 'string' && val.trim()) personNicknames[key] = val.trim()
    }
  }

  const rawMemberShowOnHome = d.memberShowOnHome
  const memberShowOnHome: Record<string, boolean> = {}
  if (rawMemberShowOnHome && typeof rawMemberShowOnHome === 'object') {
    for (const [key, val] of Object.entries(rawMemberShowOnHome as Record<string, unknown>)) {
      if (val === true) memberShowOnHome[key] = true
    }
  }

  return {
    household: {
      id: snap.id,
      inviteCode: inviteCode || d.inviteCode,
      members: memberIds,
      memberProfiles,
      personNicknames,
      memberShowOnHome,
      ownerUid,
      memberRoles,
      createdAt: serializeTimestamp(d.createdAt as Timestamp),
    },
  }
})

export const setPersonNickname = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, personId, nickname } = request.data as {
    householdId?: string
    personId?: string
    nickname?: string
  }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
  if (!personId || typeof personId !== 'string') {
    throw new HttpsError('invalid-argument', 'personId required')
  }
  if (!/^(baby:[a-z0-9_-]+|member:[a-zA-Z0-9]+)$/.test(personId)) {
    throw new HttpsError('invalid-argument', 'invalid personId')
  }

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Household not found')

  const existing = (snap.data()?.personNicknames ?? {}) as Record<string, string>
  const map = { ...existing }
  const trimmed = typeof nickname === 'string' ? nickname.trim() : ''
  if (!trimmed) delete map[personId]
  else map[personId] = trimmed.slice(0, 40)

  await ref.update({ personNicknames: map })
  return { ok: true }
})

export const setMemberShowOnHome = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, memberUid, showOnHome } = request.data as {
    householdId?: string
    memberUid?: string
    showOnHome?: unknown
  }
  if (!householdId || !memberUid) {
    throw new HttpsError('invalid-argument', 'householdId and memberUid required')
  }

  await assertHouseholdMember(uid, householdId)
  const ref = db.doc(`households/${householdId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Household not found')

  const members: string[] = snap.data()?.members ?? []
  if (!members.includes(memberUid)) {
    throw new HttpsError('invalid-argument', 'Not a household member')
  }

  const existing = (snap.data()?.memberShowOnHome ?? {}) as Record<string, boolean>
  const map = { ...existing }
  if (showOnHome === true) map[memberUid] = true
  else delete map[memberUid]

  await ref.update({ memberShowOnHome: map })
  return { ok: true }
})

export const skipPhotoOnboarding = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  await db.doc(`users/${uid}`).set({ skippedPhotoOnboarding: true }, { merge: true })
  return { ok: true }
})

export const skipBabyOnboarding = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  await db.doc(`users/${uid}`).set({ skippedBabyOnboarding: true }, { merge: true })
  return { ok: true }
})

export const getBabies = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const snap = await db.collection(`households/${householdId}/babies`).get()

  const babies = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as Record<string, unknown>)
    .map((data) => {
      const id = String(data.id)
      return {
        id,
        name: normalizeBabyName(data.name),
        birthDate: normalizeBirthDate(data.birthDate),
        birthWeightLb: (data.birthWeightLb as number | null | undefined) ?? null,
        birthWeightOz: (data.birthWeightOz as number | null | undefined) ?? null,
        birthHeightIn: (data.birthHeightIn as number | null | undefined) ?? null,
        photoUrl: (data.photoUrl as string | null | undefined) ?? null,
        borderColorId: (data.borderColorId as string | null | undefined) ?? null,
        sex: normalizeBabySex(data.sex),
        trackerVisibility: normalizeBabyTrackers(data.trackerVisibility),
        showOnHome: data.showOnHome !== false,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return { babies }
})

function normalizeBabyTrackers(raw: unknown): {
  nursing: boolean
  milk: boolean
  diaper: boolean
  medicine: boolean
  notes: boolean
  measurements: boolean
} {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    nursing: o.nursing !== false,
    milk: o.milk !== false,
    diaper: o.diaper !== false,
    medicine: o.medicine !== false,
    notes: o.notes !== false,
    measurements: o.measurements !== false,
  }
}

function normalizeBabySex(raw: unknown): 'male' | 'female' | null {
  if (raw === 'male' || raw === 'female') return raw
  return null
}

function normalizeBirthDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const day = String(raw).trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : String(raw).trim() || null
}

export const uploadBabyAvatar = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, babyId, imageBase64, contentType } = request.data as {
    householdId: string
    babyId: string
    imageBase64: string
    contentType?: string
  }
  if (!householdId || !babyId || !imageBase64) {
    throw new HttpsError('invalid-argument', 'householdId, babyId, and imageBase64 required')
  }

  await assertHouseholdMember(uid, householdId)
  await assertBabyExists(householdId, babyId)

  const ct = contentType?.trim() || 'image/jpeg'
  if (!ct.startsWith('image/')) {
    throw new HttpsError('invalid-argument', 'File must be an image')
  }

  const buffer = Buffer.from(imageBase64, 'base64')
  if (buffer.length === 0) {
    throw new HttpsError('invalid-argument', 'Empty image')
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'Image too large (max 5 MB)')
  }

  const path = `households/${householdId}/babies/${babyId}/avatar.jpg`
  const bucket = getStorage().bucket()
  const file = bucket.file(path)

  try {
    await file.save(buffer, {
      metadata: {
        contentType: ct,
        cacheControl: 'public, max-age=300, must-revalidate',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/bucket|storage|not exist|not found/i.test(msg)) {
      throw new HttpsError(
        'failed-precondition',
        'Firebase Storage is not enabled. Open Firebase Console → Storage → Get started, then redeploy storage rules.',
      )
    }
    throw new HttpsError('internal', `Upload failed: ${msg}`)
  }

  let photoUrl: string
  const cacheVersion = Date.now()
  try {
    await file.makePublic()
    photoUrl = `https://storage.googleapis.com/${bucket.name}/${path}?v=${cacheVersion}`
  } catch {
    const [signed] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    })
    photoUrl = signed
  }

  return { photoUrl }
})

export const updateBaby = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, babyId, data } = request.data as {
    householdId: string
    babyId: string
    data: Record<string, unknown>
  }
  if (!householdId || !babyId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  await assertBabyExists(householdId, babyId)
  const patch: Record<string, unknown> = { ...data }
  if ('name' in patch) patch.name = normalizeBabyName(patch.name)
  if ('trackerVisibility' in patch) {
    patch.trackerVisibility = normalizeBabyTrackers(patch.trackerVisibility)
  }
  if ('showOnHome' in patch) {
    patch.showOnHome = patch.showOnHome !== false
  }
  if ('sex' in patch) {
    patch.sex = normalizeBabySex(patch.sex)
  }
  if ('birthDate' in patch) {
    patch.birthDate = normalizeBirthDate(patch.birthDate)
  }
  await db.doc(`households/${householdId}/babies/${babyId}`).set(patch, { merge: true })
  return { ok: true }
})

export const addBaby = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, name } = request.data as { householdId?: string; name?: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
  await assertHouseholdMember(uid, householdId)

  const babyName = normalizeBabyName(name)
  const idBase = babyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'baby'
  const unique = `${idBase}-${Math.random().toString(36).slice(2, 7)}`
  const babyId = parseBabyId(unique)

  await db.doc(`households/${householdId}/babies/${babyId}`).set({
    id: babyId,
    name: babyName,
    birthDate: null,
    birthWeightLb: null,
    birthWeightOz: null,
    birthHeightIn: null,
    photoUrl: null,
    borderColorId: null,
  })
  return { babyId }
})

export const deleteBaby = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, babyId } = request.data as { householdId?: string; babyId?: string }
  if (!householdId || !babyId) throw new HttpsError('invalid-argument', 'Missing fields')
  await assertHouseholdMember(uid, householdId)
  await assertBabyExists(householdId, babyId)

  const babiesSnap = await db.collection(`households/${householdId}/babies`).get()
  if (babiesSnap.size <= 1) {
    throw new HttpsError('failed-precondition', 'You must keep at least one baby')
  }

  const [feedingHit, medHit, diaperHit] = await Promise.all([
    db
      .collection(`households/${householdId}/feedings`)
      .where('babyId', '==', babyId)
      .limit(1)
      .get(),
    db
      .collection(`households/${householdId}/medicines`)
      .where('forPersonId', '==', `baby:${babyId}`)
      .limit(1)
      .get(),
    db
      .collection(`households/${householdId}/diapers`)
      .where('babyId', '==', babyId)
      .limit(1)
      .get(),
  ])
  if (!feedingHit.empty || !medHit.empty || !diaperHit.empty) {
    throw new HttpsError(
      'failed-precondition',
      'This baby has feedings, diapers, or medicines. Keep it to preserve history.',
    )
  }

  const batch = db.batch()
  batch.delete(db.doc(`households/${householdId}/babies/${babyId}`))
  const householdRef = db.doc(`households/${householdId}`)
  const householdSnap = await householdRef.get()
  const nicknames = (householdSnap.data()?.personNicknames ?? {}) as Record<string, string>
  if (`baby:${babyId}` in nicknames) {
    const next = { ...nicknames }
    delete next[`baby:${babyId}`]
    batch.update(householdRef, { personNicknames: next })
  }
  await batch.commit()
  return { ok: true }
})

function feedingDocFromInput(input: FeedingInputPayload) {
  const { type, babyId, side, volumeOz, milkStorage } = validateFeedingInput(input)
  return {
    type,
    babyId,
    side,
    startAt: parseOptionalDate(input.startAt),
    endAt: parseOptionalDate(input.endAt),
    volumeOz,
    milkStorage,
    storedAt: parseOptionalDate(input.storedAt) ?? parseOptionalDate(input.startAt),
    weightLb: input.weightLb,
    weightOz: input.weightOz,
    note: input.note?.trim() || null,
  }
}

async function upsertMilkLotForPump(
  householdId: string,
  feedingId: string,
  feedingData: ReturnType<typeof feedingDocFromInput>,
  existingLotId: string | null,
) {
  if (feedingData.type !== 'pump' || feedingData.volumeOz == null || !feedingData.endAt) {
    if (existingLotId) {
      await db.doc(`households/${householdId}/milkLots/${existingLotId}`).delete()
    }
    return null
  }

  const pumpedAt = feedingData.startAt ?? feedingData.endAt
  const storedAt = feedingData.storedAt ?? pumpedAt
  if (!pumpedAt || !storedAt) return existingLotId

  const lotPayload = {
    pumpedAt,
    storedAt,
    volumeOz: feedingData.volumeOz,
    remainingOz: feedingData.volumeOz,
    storage: feedingData.milkStorage as MilkStorage,
    feedingId,
    note: feedingData.note,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (existingLotId) {
    const lotRef = db.doc(`households/${householdId}/milkLots/${existingLotId}`)
    const lotSnap = await lotRef.get()
    const prevVolume = lotSnap.data()?.volumeOz ?? feedingData.volumeOz
    const prevRemaining = lotSnap.data()?.remainingOz ?? feedingData.volumeOz
    const consumed = Math.max(0, prevVolume - prevRemaining)
    const nextRemaining = Math.max(0, feedingData.volumeOz - consumed)
    await lotRef.set({ ...lotPayload, remainingOz: nextRemaining }, { merge: true })
    return existingLotId
  }

  const lotRef = await db.collection(`households/${householdId}/milkLots`).add({
    ...lotPayload,
    createdAt: FieldValue.serverTimestamp(),
  })
  return lotRef.id
}

function parseMilkBagVolumes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const oz = Number(item)
    if (!Number.isFinite(oz) || oz <= 0) continue
    out.push(roundOz(oz))
  }
  return out
}

async function deleteMilkLotIfExists(householdId: string, lotId: string | null) {
  if (!lotId) return
  await db.doc(`households/${householdId}/milkLots/${lotId}`).delete()
}

async function addOzToExistingLot(
  householdId: string,
  lotId: string,
  addOz: number,
  feedingData: ReturnType<typeof feedingDocFromInput>,
): Promise<string> {
  const lotRef = db.doc(`households/${householdId}/milkLots/${lotId}`)
  const snap = await lotRef.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Milk bag not found')
  const data = snap.data()!
  const remaining = roundOz(data.remainingOz ?? 0)
  const volume = roundOz(data.volumeOz ?? 0)
  const storage = feedingData.milkStorage as MilkStorage
  if (data.storage !== storage) {
    throw new HttpsError('invalid-argument', 'Storage must match the bag you are adding to')
  }
  if (remaining <= 0) {
    throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
  }
  const totalRemaining = roundOz(remaining + addOz)
  const totalVolume = roundOz(volume + addOz)
  await lotRef.update({
    volumeOz: totalVolume,
    remainingOz: totalRemaining,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return lotId
}

async function createMilkLotsFromVolumes(
  householdId: string,
  feedingId: string,
  feedingData: ReturnType<typeof feedingDocFromInput>,
  bagVolumes: number[],
): Promise<string | null> {
  const pumpedAt = feedingData.startAt ?? feedingData.endAt
  const storedAt = feedingData.storedAt ?? pumpedAt
  if (!pumpedAt || !storedAt) return null

  let firstId: string | null = null
  for (let i = 0; i < bagVolumes.length; i++) {
    const vol = bagVolumes[i]!
    const lotRef = await db.collection(`households/${householdId}/milkLots`).add({
      pumpedAt,
      storedAt,
      volumeOz: vol,
      remainingOz: vol,
      storage: feedingData.milkStorage as MilkStorage,
      feedingId: i === 0 ? feedingId : null,
      note: feedingData.note,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    if (i === 0) firstId = lotRef.id
  }
  return firstId
}

async function resolveMilkLotsForPump(
  householdId: string,
  feedingId: string,
  feedingData: ReturnType<typeof feedingDocFromInput>,
  existingLotId: string | null,
  input: FeedingInputPayload,
): Promise<string | null> {
  if (feedingData.type !== 'pump' || feedingData.volumeOz == null || !feedingData.endAt) {
    await deleteMilkLotIfExists(householdId, existingLotId)
    return null
  }

  const addToLotId = typeof input.addToLotId === 'string' ? input.addToLotId.trim() : ''
  const bagVolumes = parseMilkBagVolumes(input.milkBagVolumes)

  if (addToLotId) {
    await deleteMilkLotIfExists(householdId, existingLotId)
    return addOzToExistingLot(householdId, addToLotId, feedingData.volumeOz, feedingData)
  }

  if (bagVolumes.length > 0) {
    const total = roundOz(bagVolumes.reduce((sum, v) => sum + v, 0))
    if (Math.abs(total - feedingData.volumeOz) > 0.01) {
      throw new HttpsError(
        'invalid-argument',
        `Bag volumes must total ${feedingData.volumeOz} oz (got ${total} oz)`,
      )
    }
    await deleteMilkLotIfExists(householdId, existingLotId)
    return createMilkLotsFromVolumes(householdId, feedingId, feedingData, bagVolumes)
  }

  return upsertMilkLotForPump(householdId, feedingId, feedingData, existingLotId)
}

type MilkDeduction = { lotId: string; amountOz: number }

function roundOz(n: number): number {
  return Math.round(n * 100) / 100
}

function parseMilkDeductions(raw: unknown): MilkDeduction[] {
  if (!Array.isArray(raw)) return []
  const out: MilkDeduction[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const lotId = 'lotId' in item ? String(item.lotId) : ''
    const amountOz = 'amountOz' in item ? Number(item.amountOz) : NaN
    if (!lotId || !Number.isFinite(amountOz) || amountOz <= 0) continue
    out.push({ lotId, amountOz: roundOz(amountOz) })
  }
  return out
}

async function applyMilkDeductions(householdId: string, deductions: MilkDeduction[]): Promise<void> {
  for (const d of deductions) {
    const lotRef = db.doc(`households/${householdId}/milkLots/${d.lotId}`)
    const lotSnap = await lotRef.get()
    if (!lotSnap.exists) {
      throw new HttpsError('not-found', 'Selected milk bag was not found')
    }
    const data = lotSnap.data()!
    const available = roundOz(data.remainingOz ?? 0)
    if (d.amountOz > available + 0.01) {
      throw new HttpsError(
        'invalid-argument',
        `Not enough milk in that bag (${available} oz remaining)`,
      )
    }
    await lotRef.update({
      remainingOz: roundOz(Math.max(0, available - d.amountOz)),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
}

async function deductMilkForBottle(householdId: string, volumeOz: number): Promise<MilkDeduction[]> {
  let remaining = roundOz(volumeOz)
  if (remaining <= 0) return []

  // Only bags with milk left — avoids a full-collection scan of depleted lots.
  const snap = await db
    .collection(`households/${householdId}/milkLots`)
    .where('remainingOz', '>', 0)
    .get()
  const lots = snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .sort((a, b) => {
      const aStored = (a.data.storedAt as Timestamp | undefined)?.toMillis?.() ?? 0
      const bStored = (b.data.storedAt as Timestamp | undefined)?.toMillis?.() ?? 0
      if (a.data.storage === 'fridge' && b.data.storage === 'frozen') return -1
      if (a.data.storage === 'frozen' && b.data.storage === 'fridge') return 1
      if (aStored !== bStored) return aStored - bStored
      return 0
    })

  const deductions: MilkDeduction[] = []

  for (const lot of lots) {
    if (remaining <= 0) break
    const available = roundOz(lot.data.remainingOz ?? 0)
    if (available <= 0) continue

    const take = roundOz(Math.min(available, remaining))
    if (take <= 0) continue

    const lotRef = db.doc(`households/${householdId}/milkLots/${lot.id}`)
    await lotRef.update({
      remainingOz: roundOz(available - take),
      updatedAt: FieldValue.serverTimestamp(),
    })
    deductions.push({ lotId: lot.id, amountOz: take })
    remaining = roundOz(remaining - take)
  }

  return deductions
}

async function restoreMilkDeductions(householdId: string, deductions: MilkDeduction[]): Promise<void> {
  for (const d of deductions) {
    const lotRef = db.doc(`households/${householdId}/milkLots/${d.lotId}`)
    const lotSnap = await lotRef.get()
    if (!lotSnap.exists) continue

    const data = lotSnap.data()!
    const current = roundOz(data.remainingOz ?? 0)
    const volume = roundOz(data.volumeOz ?? current)
    const next = roundOz(Math.min(current + d.amountOz, volume))
    await lotRef.update({
      remainingOz: next,
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
}

export const listFeedings = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const sinceDays = parseSinceDays((request.data as { sinceDays?: number }).sinceDays)
  const snap = await db
    .collection(`households/${householdId}/feedings`)
    .where('createdAt', '>=', sinceTimestamp(sinceDays))
    .orderBy('createdAt', 'desc')
    .limit(MAX_LIST_LIMIT)
    .get()

  const feedings = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      type: data.type ?? 'nursing',
      babyId: data.babyId,
      side: data.side ?? null,
      startAt: serializeTimestamp(data.startAt),
      endAt: serializeTimestamp(data.endAt),
      volumeOz: data.volumeOz ?? null,
      milkStorage: data.milkStorage ?? null,
      storedAt: serializeTimestamp(data.storedAt),
      milkLotId: data.milkLotId ?? null,
      milkDeductions: Array.isArray(data.milkDeductions) ? data.milkDeductions : [],
      weightLb: data.weightLb ?? null,
      weightOz: data.weightOz ?? null,
      note: data.note ?? null,
      createdAt: serializeTimestamp(data.createdAt as Timestamp)!,
      updatedAt: serializeTimestamp(data.updatedAt as Timestamp)!,
    }
  })

  return { feedings }
})

export const createFeeding = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, input, clientId } = request.data as {
    householdId: string
    input: FeedingInputPayload
    /** Optional client-generated id for optimistic offline creates. */
    clientId?: string | null
  }
  if (!householdId || !input) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  await assertBabyExists(householdId, parseBabyId(input.babyId))
  const doc = feedingDocFromInput(input)

  const col = db.collection(`households/${householdId}/feedings`)
  const feedingBody = {
    ...doc,
    milkLotId: null as string | null,
    milkDeductions: [] as unknown[],
    lastActorUid: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  let ref = col.doc()
  if (typeof clientId === 'string' && clientId.trim().length >= 8 && clientId.trim().length <= 128) {
    const id = clientId.trim()
    ref = col.doc(id)
    const existing = await ref.get()
    if (existing.exists) {
      // Idempotent replay from offline queue — treat as success.
      return { feedingId: ref.id }
    }
    await ref.create(feedingBody)
  } else {
    ref = await col.add(feedingBody)
  }

  let milkDeductions: MilkDeduction[] = []
  if (doc.type === 'bottle' && doc.volumeOz != null) {
    const explicit = parseMilkDeductions(input.milkDeductions)
    if (explicit.length > 0) {
      const total = roundOz(explicit.reduce((sum, d) => sum + d.amountOz, 0))
      if (Math.abs(total - doc.volumeOz) > 0.01) {
        throw new HttpsError(
          'invalid-argument',
          'Milk taken from bags must match ounces given',
        )
      }
      await applyMilkDeductions(householdId, explicit)
      milkDeductions = explicit
    } else {
      milkDeductions = await deductMilkForBottle(householdId, doc.volumeOz)
    }
  }

  const milkLotId = await resolveMilkLotsForPump(householdId, ref.id, doc, null, input)

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (milkDeductions.length > 0) patch.milkDeductions = milkDeductions
  if (milkLotId) patch.milkLotId = milkLotId
  if (milkDeductions.length > 0 || milkLotId) {
    await ref.update(patch)
  }

  return { feedingId: ref.id }
})

export const updateFeeding = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, feedingId, input } = request.data as {
    householdId: string
    feedingId: string
    input: FeedingInputPayload
  }
  if (!householdId || !feedingId || !input) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  await assertHouseholdMember(uid, householdId)
  await assertBabyExists(householdId, parseBabyId(input.babyId))
  const feedingRef = db.doc(`households/${householdId}/feedings/${feedingId}`)
  const existing = await feedingRef.get()
  if (!existing.exists) throw new HttpsError('not-found', 'Feeding not found')

  const prevData = existing.data()!
  await restoreMilkDeductions(householdId, parseMilkDeductions(prevData.milkDeductions))

  const doc = feedingDocFromInput(input)
  const milkLotId = await resolveMilkLotsForPump(
    householdId,
    feedingId,
    doc,
    prevData.milkLotId ?? null,
    input,
  )

  let milkDeductions: MilkDeduction[] = []
  if (doc.type === 'bottle' && doc.volumeOz != null) {
    const explicit = parseMilkDeductions(input.milkDeductions)
    if (explicit.length > 0) {
      const total = roundOz(explicit.reduce((sum, d) => sum + d.amountOz, 0))
      if (Math.abs(total - doc.volumeOz) > 0.01) {
        throw new HttpsError(
          'invalid-argument',
          'Milk taken from bags must match ounces given',
        )
      }
      await applyMilkDeductions(householdId, explicit)
      milkDeductions = explicit
    } else {
      milkDeductions = await deductMilkForBottle(householdId, doc.volumeOz)
    }
  }

  await feedingRef.update({
    ...doc,
    milkLotId: milkLotId ?? null,
    milkDeductions,
    lastActorUid: uid,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true }
})

export const deleteFeeding = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, feedingId } = request.data as {
    householdId: string
    feedingId: string
  }
  if (!householdId || !feedingId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const feedingRef = db.doc(`households/${householdId}/feedings/${feedingId}`)
  const existing = await feedingRef.get()
  const data = existing.data()
  if (data?.type === 'bottle') {
    await restoreMilkDeductions(householdId, parseMilkDeductions(data.milkDeductions))
  }
  const milkLotId = data?.milkLotId as string | null | undefined
  if (milkLotId) {
    await db.doc(`households/${householdId}/milkLots/${milkLotId}`).delete()
  }
  await feedingRef.delete()
  return { ok: true }
})

export const listMilkLots = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  const snap = await db
    .collection(`households/${householdId}/milkLots`)
    .where('remainingOz', '>', 0)
    .orderBy('remainingOz', 'desc')
    .limit(MAX_LIST_LIMIT)
    .get()

  const lots = snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id,
        pumpedAt: serializeTimestamp(data.pumpedAt)!,
        storedAt: serializeTimestamp(data.storedAt)!,
        volumeOz: data.volumeOz ?? 0,
        remainingOz: data.remainingOz ?? 0,
        storage: data.storage,
        feedingId: data.feedingId,
        note: data.note ?? null,
        createdAt: serializeTimestamp(data.createdAt as Timestamp)!,
        updatedAt: serializeTimestamp(data.updatedAt as Timestamp)!,
      }
    })
    .sort((a, b) => {
      const aMs = a.storedAt ? new Date(a.storedAt).getTime() : 0
      const bMs = b.storedAt ? new Date(b.storedAt).getTime() : 0
      return bMs - aMs
    })

  return { lots }
})

export const getMilkSummary = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)
  // Active inventory only — depleted bags are excluded to cut reads.
  const snap = await db
    .collection(`households/${householdId}/milkLots`)
    .where('remainingOz', '>', 0)
    .get()

  let totalRemainingOz = 0
  let fridgeOz = 0
  let frozenOz = 0
  for (const d of snap.docs) {
    const data = d.data()
    const remaining = data.remainingOz ?? 0
    if (remaining <= 0) continue
    totalRemainingOz += remaining
    if (data.storage === 'frozen') frozenOz += remaining
    else fridgeOz += remaining
  }

  return { summary: { totalRemainingOz, fridgeOz, frozenOz } }
})

export const deleteMilkLot = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, lotId } = request.data as { householdId: string; lotId: string }
  if (!householdId || !lotId) throw new HttpsError('invalid-argument', 'Missing fields')

  await assertHouseholdMember(uid, householdId)
  const lotRef = db.doc(`households/${householdId}/milkLots/${lotId}`)
  const lotSnap = await lotRef.get()
  if (!lotSnap.exists) throw new HttpsError('not-found', 'Lot not found')

  const feedingId = lotSnap.data()?.feedingId as string | undefined
  if (feedingId) {
    await db.doc(`households/${householdId}/feedings/${feedingId}`).delete()
  }
  await lotRef.delete()
  return { ok: true }
})

export const updateMilkLot = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, lotId, volumeOz, remainingOz, note, storedAt } = request.data as {
    householdId: string
    lotId: string
    volumeOz: unknown
    remainingOz: unknown
    note?: unknown
    storedAt?: unknown
  }
  if (!householdId || !lotId) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  const total = roundOz(Number(volumeOz))
  const remaining = roundOz(Number(remainingOz))
  if (!Number.isFinite(total) || total <= 0) {
    throw new HttpsError('invalid-argument', 'Bag total must be greater than 0 oz')
  }
  if (!Number.isFinite(remaining) || remaining < 0) {
    throw new HttpsError('invalid-argument', 'Remaining amount must be 0 or more')
  }
  if (remaining > total + 0.001) {
    throw new HttpsError('invalid-argument', 'Remaining cannot exceed bag total')
  }

  await assertHouseholdMember(uid, householdId)
  const lotRef = db.doc(`households/${householdId}/milkLots/${lotId}`)
  const lotSnap = await lotRef.get()
  if (!lotSnap.exists) throw new HttpsError('not-found', 'Milk bag not found')

  const patch: Record<string, unknown> = {
    volumeOz: total,
    remainingOz: remaining,
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (note !== undefined) {
    const trimmed = typeof note === 'string' ? note.trim() : ''
    patch.note = trimmed || null
  }

  let storedAtTs: Timestamp | null = null
  if (storedAt !== undefined) {
    if (storedAt != null && typeof storedAt !== 'string') {
      throw new HttpsError('invalid-argument', 'storedAt must be an ISO date string')
    }
    storedAtTs = parseOptionalDate(typeof storedAt === 'string' ? storedAt : null)
    if (!storedAtTs) {
      throw new HttpsError('invalid-argument', 'Choose a valid stored date and time')
    }
    patch.storedAt = storedAtTs
  }

  await lotRef.update(patch)

  const feedingId = lotSnap.data()?.feedingId as string | undefined
  if (feedingId) {
    const feedingRef = db.doc(`households/${householdId}/feedings/${feedingId}`)
    const feedingSnap = await feedingRef.get()
    if (feedingSnap.exists) {
      const feedingPatch: Record<string, unknown> = {
        volumeOz: total,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (storedAtTs) {
        feedingPatch.storedAt = storedAtTs
      }
      await feedingRef.update(feedingPatch)
    }
  }

  return { ok: true, volumeOz: total, remainingOz: remaining }
})

export const transferMilkLotToFreezer = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, lotId, lotIds, bags } = request.data as {
    householdId: string
    lotId?: string
    lotIds?: string[]
    bags: unknown
  }
  const ids = Array.isArray(lotIds) && lotIds.length > 0
    ? lotIds.map(String)
    : lotId
      ? [String(lotId)]
      : []

  if (!householdId || ids.length === 0 || !Array.isArray(bags) || bags.length === 0) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  await assertHouseholdMember(uid, householdId)

  const bagVolumes = bags.map((raw) => {
    const n = roundOz(Number(raw))
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpsError('invalid-argument', 'Each bag needs a positive volume in oz')
    }
    return n
  })

  const lotSnaps = await Promise.all(
    ids.map((id) => db.doc(`households/${householdId}/milkLots/${id}`).get()),
  )

  let totalRemainingOz = 0
  let earliestPumped: Timestamp | null = null
  let feedingId: string | null = null
  const notes: string[] = []

  for (let i = 0; i < lotSnaps.length; i++) {
    const snap = lotSnaps[i]
    if (!snap.exists) throw new HttpsError('not-found', 'Milk bag not found')
    const data = snap.data()!
    if (data.storage !== 'fridge') {
      throw new HttpsError('invalid-argument', 'Only refrigerated milk can be transferred')
    }
    const remaining = roundOz(data.remainingOz ?? 0)
    if (remaining <= 0) {
      throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
    }
    totalRemainingOz = roundOz(totalRemainingOz + remaining)
    const pumped = data.pumpedAt as Timestamp | undefined
    if (pumped && (!earliestPumped || pumped.toMillis() < earliestPumped.toMillis())) {
      earliestPumped = pumped
    }
    if (!feedingId && data.feedingId) feedingId = data.feedingId as string
    if (data.note) notes.push(String(data.note))
  }

  if (totalRemainingOz <= 0) {
    throw new HttpsError('invalid-argument', 'No milk to transfer')
  }

  const totalBags = roundOz(bagVolumes.reduce((sum, v) => sum + v, 0))
  if (Math.abs(totalBags - totalRemainingOz) > 0.01) {
    throw new HttpsError(
      'invalid-argument',
      `Bag volumes must total ${totalRemainingOz} oz (got ${totalBags} oz)`,
    )
  }

  const transferAt = Timestamp.now()
  const batch = db.batch()

  for (const id of ids) {
    batch.delete(db.doc(`households/${householdId}/milkLots/${id}`))
  }

  const note = notes.length > 0 ? notes[0] : null

  for (let i = 0; i < bagVolumes.length; i++) {
    const vol = bagVolumes[i]
    const newRef = db.collection(`households/${householdId}/milkLots`).doc()
    batch.set(newRef, {
      pumpedAt: earliestPumped ?? transferAt,
      storedAt: transferAt,
      volumeOz: vol,
      remainingOz: vol,
      storage: 'frozen' as MilkStorage,
      feedingId: i === 0 ? feedingId : null,
      note,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  if (feedingId) {
    const feedingRef = db.doc(`households/${householdId}/feedings/${feedingId}`)
    const feedingSnap = await feedingRef.get()
    if (feedingSnap.exists) {
      batch.update(feedingRef, {
        milkStorage: 'frozen',
        storedAt: transferAt,
        milkLotId: null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  }

  await batch.commit()
  return { ok: true, bagCount: bagVolumes.length, lotCount: ids.length }
})

export const transferMilkLotToFridge = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, lotId, lotIds, bags } = request.data as {
    householdId: string
    lotId?: string
    lotIds?: string[]
    bags: unknown
  }
  const ids = Array.isArray(lotIds) && lotIds.length > 0
    ? lotIds.map(String)
    : lotId
      ? [String(lotId)]
      : []

  if (!householdId || ids.length === 0 || !Array.isArray(bags) || bags.length === 0) {
    throw new HttpsError('invalid-argument', 'Missing fields')
  }

  await assertHouseholdMember(uid, householdId)

  const bagVolumes = bags.map((raw) => {
    const n = roundOz(Number(raw))
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpsError('invalid-argument', 'Each bag needs a positive volume in oz')
    }
    return n
  })

  const lotSnaps = await Promise.all(
    ids.map((id) => db.doc(`households/${householdId}/milkLots/${id}`).get()),
  )

  let totalRemainingOz = 0
  let earliestPumped: Timestamp | null = null
  let feedingId: string | null = null
  const notes: string[] = []

  for (const snap of lotSnaps) {
    if (!snap.exists) throw new HttpsError('not-found', 'Milk bag not found')
    const data = snap.data()!
    if (data.storage !== 'frozen') {
      throw new HttpsError('invalid-argument', 'Only frozen milk can be transferred to the fridge')
    }
    const remaining = roundOz(data.remainingOz ?? 0)
    if (remaining <= 0) {
      throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
    }
    totalRemainingOz = roundOz(totalRemainingOz + remaining)
    const pumped = data.pumpedAt as Timestamp | undefined
    if (pumped && (!earliestPumped || pumped.toMillis() < earliestPumped.toMillis())) {
      earliestPumped = pumped
    }
    if (!feedingId && data.feedingId) feedingId = data.feedingId as string
    if (data.note) notes.push(String(data.note))
  }

  if (totalRemainingOz <= 0) {
    throw new HttpsError('invalid-argument', 'No milk to transfer')
  }

  const totalBags = roundOz(bagVolumes.reduce((sum, v) => sum + v, 0))
  if (Math.abs(totalBags - totalRemainingOz) > 0.01) {
    throw new HttpsError(
      'invalid-argument',
      `Bag volumes must total ${totalRemainingOz} oz (got ${totalBags} oz)`,
    )
  }

  const transferAt = Timestamp.now()
  const batch = db.batch()

  for (const id of ids) {
    batch.delete(db.doc(`households/${householdId}/milkLots/${id}`))
  }

  const note = notes.length > 0 ? notes[0] : null

  for (let i = 0; i < bagVolumes.length; i++) {
    const vol = bagVolumes[i]
    const newRef = db.collection(`households/${householdId}/milkLots`).doc()
    batch.set(newRef, {
      pumpedAt: earliestPumped ?? transferAt,
      storedAt: transferAt,
      volumeOz: vol,
      remainingOz: vol,
      storage: 'fridge' as MilkStorage,
      feedingId: i === 0 ? feedingId : null,
      note,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  if (feedingId) {
    const feedingRef = db.doc(`households/${householdId}/feedings/${feedingId}`)
    const feedingSnap = await feedingRef.get()
    if (feedingSnap.exists) {
      batch.update(feedingRef, {
        milkStorage: 'fridge',
        storedAt: transferAt,
        milkLotId: null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  }

  await batch.commit()
  return { ok: true, bagCount: bagVolumes.length, lotCount: ids.length }
})

export const combineMilkLots = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, lotIds, addOz } = request.data as {
    householdId?: string
    lotIds?: string[]
    addOz?: number | string | null
  }

  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  const ids = Array.isArray(lotIds) ? lotIds.map(String).filter(Boolean) : []
  const extraOz = addOz == null || addOz === '' ? 0 : roundOz(Number(addOz))

  if (ids.length === 0 && extraOz <= 0) {
    throw new HttpsError('invalid-argument', 'Select at least one bag or enter milk to add')
  }
  if (ids.length === 0 && extraOz > 0) {
    throw new HttpsError('invalid-argument', 'Choose a bag to add fresh milk into')
  }
  if (!Number.isFinite(extraOz) || extraOz < 0) {
    throw new HttpsError('invalid-argument', 'Invalid amount to add')
  }

  await assertHouseholdMember(uid, householdId)

  const lotSnaps = await Promise.all(
    ids.map((id) => db.doc(`households/${householdId}/milkLots/${id}`).get()),
  )

  type LotRow = {
    id: string
    remaining: number
    storage: MilkStorage
    pumpedAt: Timestamp
    storedAt: Timestamp
    feedingId: string | null
    note: string | null
  }

  const rows: LotRow[] = []

  for (const snap of lotSnaps) {
    if (!snap.exists) throw new HttpsError('not-found', 'Milk bag not found')
    const data = snap.data()!
    const remaining = roundOz(data.remainingOz ?? 0)
    if (remaining <= 0) {
      throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
    }
    const storage = data.storage as MilkStorage
    if (storage !== 'fridge' && storage !== 'frozen') {
      throw new HttpsError('invalid-argument', 'Invalid storage on milk bag')
    }
    const pumpedAt = (data.pumpedAt as Timestamp | undefined) ?? Timestamp.now()
    const storedAt = (data.storedAt as Timestamp | undefined) ?? pumpedAt
    rows.push({
      id: snap.id,
      remaining,
      storage,
      pumpedAt,
      storedAt,
      feedingId: (data.feedingId as string | null | undefined) ?? null,
      note: (data.note as string | null | undefined) ?? null,
    })
  }

  const storageSet = new Set(rows.map((r) => r.storage))
  if (storageSet.size > 1) {
    throw new HttpsError(
      'invalid-argument',
      'Combine bags from the same storage (all fridge or all frozen)',
    )
  }
  const storage = rows[0]?.storage ?? 'fridge'

  rows.sort((a, b) => a.storedAt.toMillis() - b.storedAt.toMillis())
  const survivor = rows[0]!
  const mergeOthers = rows.slice(1)

  const totalRemaining = roundOz(rows.reduce((sum, r) => sum + r.remaining, 0) + extraOz)
  if (totalRemaining <= 0) {
    throw new HttpsError('invalid-argument', 'No milk to combine')
  }

  let earliestPumped = survivor.pumpedAt
  let earliestStored = survivor.storedAt
  for (const r of rows) {
    if (r.pumpedAt.toMillis() < earliestPumped.toMillis()) earliestPumped = r.pumpedAt
    if (r.storedAt.toMillis() < earliestStored.toMillis()) earliestStored = r.storedAt
  }

  const note = rows.find((r) => r.note)?.note ?? null
  const batch = db.batch()
  const survivorRef = db.doc(`households/${householdId}/milkLots/${survivor.id}`)

  batch.update(survivorRef, {
    pumpedAt: earliestPumped,
    storedAt: earliestStored,
    volumeOz: totalRemaining,
    remainingOz: totalRemaining,
    storage,
    feedingId: survivor.feedingId,
    note,
    updatedAt: FieldValue.serverTimestamp(),
  })

  for (const other of mergeOthers) {
    batch.delete(db.doc(`households/${householdId}/milkLots/${other.id}`))
  }

  await batch.commit()
  return { ok: true, lotId: survivor.id, totalOz: totalRemaining }
})

function parseBagVolumes(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  return raw.map((item) => {
    const n = roundOz(Number(item))
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpsError('invalid-argument', 'Each bag needs a positive volume in oz')
    }
    return n
  })
}

export const redistributeMilkLot = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId, lotId, lotIds, bags } = request.data as {
    householdId?: string
    lotId?: string
    lotIds?: unknown
    bags?: unknown
  }

  const ids = Array.isArray(lotIds)
    ? lotIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : lotId
      ? [lotId]
      : []

  if (!householdId || ids.length === 0) {
    throw new HttpsError('invalid-argument', 'householdId and at least one lotId required')
  }

  await assertHouseholdMember(uid, householdId)

  const lotSnaps = await Promise.all(
    ids.map((id) => db.doc(`households/${householdId}/milkLots/${id}`).get()),
  )

  type LotRow = {
    id: string
    remaining: number
    storage: MilkStorage
    pumpedAt: Timestamp
    storedAt: Timestamp
    feedingId: string | null
    note: string | null
  }

  const rows: LotRow[] = []

  for (const snap of lotSnaps) {
    if (!snap.exists) throw new HttpsError('not-found', 'Milk bag not found')
    const data = snap.data()!
    const remaining = roundOz(data.remainingOz ?? 0)
    if (remaining <= 0) {
      throw new HttpsError('invalid-argument', 'Selected bag has no milk left')
    }
    const storage = data.storage as MilkStorage
    if (storage !== 'fridge' && storage !== 'frozen') {
      throw new HttpsError('invalid-argument', 'Invalid storage on milk bag')
    }
    const pumpedAt = (data.pumpedAt as Timestamp | undefined) ?? Timestamp.now()
    const storedAt = (data.storedAt as Timestamp | undefined) ?? pumpedAt
    rows.push({
      id: snap.id,
      remaining,
      storage,
      pumpedAt,
      storedAt,
      feedingId: (data.feedingId as string | null | undefined) ?? null,
      note: (data.note as string | null | undefined) ?? null,
    })
  }

  const storageSet = new Set(rows.map((r) => r.storage))
  if (storageSet.size > 1) {
    throw new HttpsError(
      'invalid-argument',
      'Redistribute bags from the same storage (all fridge or all frozen)',
    )
  }

  const remaining = roundOz(rows.reduce((sum, r) => sum + r.remaining, 0))

  const bagVolumes = parseBagVolumes(bags)
  if (bagVolumes.length < 1) {
    throw new HttpsError('invalid-argument', 'Enter at least one bag')
  }

  const totalBags = roundOz(bagVolumes.reduce((sum, v) => sum + v, 0))
  if (Math.abs(totalBags - remaining) > 0.01) {
    throw new HttpsError(
      'invalid-argument',
      `Bag volumes must total ${remaining} oz (got ${totalBags} oz)`,
    )
  }

  rows.sort((a, b) => a.storedAt.toMillis() - b.storedAt.toMillis())
  const survivor = rows[0]!
  const storage = survivor.storage

  let earliestPumped = survivor.pumpedAt
  let earliestStored = survivor.storedAt
  for (const row of rows) {
    if (row.pumpedAt.toMillis() < earliestPumped.toMillis()) earliestPumped = row.pumpedAt
    if (row.storedAt.toMillis() < earliestStored.toMillis()) earliestStored = row.storedAt
  }

  const note = rows.find((r) => r.note)?.note ?? null
  const batch = db.batch()

  for (const row of rows) {
    batch.delete(db.doc(`households/${householdId}/milkLots/${row.id}`))
  }

  for (let i = 0; i < bagVolumes.length; i++) {
    const vol = bagVolumes[i]!
    const newRef = db.collection(`households/${householdId}/milkLots`).doc()
    batch.set(newRef, {
      pumpedAt: earliestPumped,
      storedAt: earliestStored,
      volumeOz: vol,
      remainingOz: vol,
      storage,
      feedingId: i === 0 ? survivor.feedingId : null,
      note,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
  return { ok: true, bagCount: bagVolumes.length }
})

export const exportHouseholdData = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const { householdId } = request.data as { householdId?: string }
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')

  await assertHouseholdMember(uid, householdId)

  const [householdSnap, babiesSnap, feedingsSnap, diapersSnap, milkSnap, medicinesSnap] =
    await Promise.all([
      db.doc(`households/${householdId}`).get(),
      db.collection(`households/${householdId}/babies`).get(),
      db.collection(`households/${householdId}/feedings`).orderBy('createdAt', 'desc').get(),
      db.collection(`households/${householdId}/diapers`).orderBy('changedAt', 'desc').get(),
      db.collection(`households/${householdId}/milkLots`).get(),
      db.collection(`households/${householdId}/medicines`).get(),
    ])

  const serialize = (ts: Timestamp | undefined | null) => serializeTimestamp(ts)

  return {
    exportedAt: new Date().toISOString(),
    household: householdSnap.exists
      ? {
          id: householdSnap.id,
          inviteCode: householdSnap.data()?.inviteCode,
          members: householdSnap.data()?.members ?? [],
          ownerUid: householdSnap.data()?.ownerUid ?? null,
        }
      : null,
    babies: babiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    feedings: feedingsSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        startAt: serialize(data.startAt as Timestamp),
        endAt: serialize(data.endAt as Timestamp),
        storedAt: serialize(data.storedAt as Timestamp),
        createdAt: serialize(data.createdAt as Timestamp),
        updatedAt: serialize(data.updatedAt as Timestamp),
      }
    }),
    diapers: diapersSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        changedAt: serialize(data.changedAt as Timestamp),
        createdAt: serialize(data.createdAt as Timestamp),
        updatedAt: serialize(data.updatedAt as Timestamp),
      }
    }),
    milkLots: milkSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        pumpedAt: serialize(data.pumpedAt as Timestamp),
        storedAt: serialize(data.storedAt as Timestamp),
        createdAt: serialize(data.createdAt as Timestamp),
        updatedAt: serialize(data.updatedAt as Timestamp),
      }
    }),
    medicines: medicinesSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        startedAt: serialize(data.startedAt as Timestamp),
        lastTakenAt: serialize(data.lastTakenAt as Timestamp),
        createdAt: serialize(data.createdAt as Timestamp),
        updatedAt: serialize(data.updatedAt as Timestamp),
      }
    }),
  }
})
