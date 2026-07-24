import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import type { DocumentData } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { db, serializeTimestamp } from './helpers'

function isInProgress(data: DocumentData | undefined): boolean {
  if (!data) return false
  if ((data.type ?? 'nursing') === 'bottle') return false
  return !!data.startAt && !data.endAt
}

async function collectHouseholdFcmTokens(
  householdId: string,
  excludeUid: string | null,
): Promise<string[]> {
  const household = await db.doc(`households/${householdId}`).get()
  if (!household.exists) return []
  const members: string[] = household.data()?.members ?? []
  const tokens: string[] = []

  for (const uid of members) {
    if (excludeUid && uid === excludeUid) continue
    const user = await db.doc(`users/${uid}`).get()
    const list = user.data()?.fcmTokens
    if (!Array.isArray(list)) continue
    for (const t of list) {
      if (typeof t === 'string' && t.length > 0) tokens.push(t)
    }
  }

  return [...new Set(tokens)]
}

async function pruneInvalidTokens(
  householdId: string,
  invalidTokens: string[],
): Promise<void> {
  if (invalidTokens.length === 0) return
  const household = await db.doc(`households/${householdId}`).get()
  if (!household.exists) return
  const members: string[] = household.data()?.members ?? []
  const batch = db.batch()
  let writes = 0
  for (const uid of members) {
    const userRef = db.doc(`users/${uid}`)
    const user = await userRef.get()
    if (!user.exists) continue
    const list = user.data()?.fcmTokens
    if (!Array.isArray(list)) continue
    const next = list.filter((t: unknown) => typeof t === 'string' && !invalidTokens.includes(t))
    if (next.length !== list.length) {
      batch.set(userRef, { fcmTokens: next }, { merge: true })
      writes++
    }
  }
  if (writes > 0) await batch.commit()
}

async function sendFeedPush(
  householdId: string,
  excludeUid: string | null,
  data: Record<string, string>,
): Promise<void> {
  const tokens = await collectHouseholdFcmTokens(householdId, excludeUid)
  if (tokens.length === 0) {
    console.error('feed push: no FCM tokens for household', householdId, data.type)
    return
  }

  const collapseKey =
    data.feedingId && data.type ? `${data.type}_${data.feedingId}` : data.type ?? 'feed'

  const result = await getMessaging().sendEachForMulticast({
    tokens,
    data,
    android: {
      priority: 'high',
      ttl: 120 * 1000,
      collapseKey,
    },
  })

  const invalid: string[] = []
  result.responses.forEach((resp, i) => {
    if (!resp.success) {
      const code = resp.error?.code
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        invalid.push(tokens[i])
      }
      console.warn('feed push FCM failed', code, resp.error?.message)
    }
  })
  await pruneInvalidTokens(householdId, invalid)

  console.info(
    'feed push',
    data.type,
    'household',
    householdId,
    'ok',
    result.successCount,
    'fail',
    result.failureCount,
  )
}

/** Partner feed alerts: session started / ended (FCM data messages). */
export const onFeedingInProgress = onDocumentWritten(
  {
    document: 'households/{householdId}/feedings/{feedingId}',
    region: 'us-central1',
  },
  async (event) => {
    const afterSnap = event.data?.after
    const beforeSnap = event.data?.before

    const afterData = afterSnap?.exists ? afterSnap.data() : undefined
    const beforeData = beforeSnap?.exists ? beforeSnap.data() : undefined

    const wasInProgress = isInProgress(beforeData)
    const nowInProgress = isInProgress(afterData)

    const householdId = event.params.householdId
    const feedingId = event.params.feedingId

    if (wasInProgress === nowInProgress) {
      console.log('onFeedingInProgress: no transition', {
        householdId,
        feedingId,
        wasInProgress,
        nowInProgress,
      })
      return
    }

    const data = afterData ?? beforeData
    if (!data) return

    const babyId = String(data.babyId ?? '')
    const babySnap = babyId
      ? await db.doc(`households/${householdId}/babies/${babyId}`).get()
      : null
    const babyName = (babySnap?.data()?.name as string | undefined)?.trim() || 'Baby'
    const startAtIso =
      serializeTimestamp(afterData?.startAt ?? beforeData?.startAt) ?? ''
    const side =
      data.side === 'left' ? 'Left' : data.side === 'right' ? 'Right' : ''

    const actorUid =
      (typeof afterData?.lastActorUid === 'string' && afterData.lastActorUid) ||
      (typeof beforeData?.lastActorUid === 'string' && beforeData.lastActorUid) ||
      null

    if (nowInProgress && !wasInProgress) {
      if (!startAtIso) return
      const startMs = new Date(startAtIso).getTime()
      await sendFeedPush(householdId, actorUid, {
        type: 'feed_started',
        householdId,
        feedingId,
        babyId,
        babyName,
        startAtIso,
        startAtMs: String(Number.isFinite(startMs) ? startMs : Date.now()),
        side,
      })
      return
    }

    if (wasInProgress && !nowInProgress) {
      const startMs = startAtIso ? new Date(startAtIso).getTime() : Date.now()
      await sendFeedPush(householdId, actorUid, {
        type: 'feed_ended',
        householdId,
        feedingId,
        babyId,
        babyName,
        startAtIso,
        startAtMs: String(Number.isFinite(startMs) ? startMs : Date.now()),
        side,
      })
    }
  },
)
