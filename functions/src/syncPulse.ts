import { onDocumentWritten } from 'firebase-functions/v2/firestore'

/**
 * Formerly bumped households/{id}/meta/sync on every subcollection write so the
 * client could poll for changes. The app now uses direct onSnapshot listeners,
 * so these pulses only burned writes (often many per transfer/combine).
 *
 * Triggers remain deployed as no-ops so existing function names do not 404;
 * delete them from Firebase Console / `firebase functions:delete` when convenient.
 */
function makePulseTrigger(document: string) {
  return onDocumentWritten({ document, region: 'us-central1' }, async () => {
    /* intentionally empty — do not write meta/sync */
  })
}

export const onFeedingSyncPulse = makePulseTrigger(
  'households/{householdId}/feedings/{docId}',
)
export const onDiaperSyncPulse = makePulseTrigger(
  'households/{householdId}/diapers/{docId}',
)
export const onMilkLotSyncPulse = makePulseTrigger(
  'households/{householdId}/milkLots/{docId}',
)
export const onMedicineSyncPulse = makePulseTrigger(
  'households/{householdId}/medicines/{docId}',
)
export const onMeasurementSyncPulse = makePulseTrigger(
  'households/{householdId}/measurements/{docId}',
)
export const onNoteSyncPulse = makePulseTrigger(
  'households/{householdId}/notes/{docId}',
)
