import {
  apiCreateDiaper,
  apiDeleteDiaper,
  apiListDiapers,
  apiUpdateDiaper,
  diaperInputToPayload,
  formatApiError,
  type DiaperInput,
} from './api'
import { runMutation, newClientId } from './mutationQueue'
import type { BabyId, Diaper } from '../types'

export type { DiaperInput }

export async function fetchDiapers(householdId: string): Promise<Diaper[]> {
  try {
    return await apiListDiapers(householdId)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function createDiaper(householdId: string, input: DiaperInput): Promise<string> {
  try {
    return await apiCreateDiaper(householdId, input)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function updateDiaper(
  householdId: string,
  diaperId: string,
  input: DiaperInput,
): Promise<void> {
  try {
    await apiUpdateDiaper(householdId, diaperId, input)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function deleteDiaper(householdId: string, diaperId: string): Promise<void> {
  try {
    await apiDeleteDiaper(householdId, diaperId)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

/** Background save — closes UI immediately; syncs via offline queue. */
export function saveDiaperBackground(
  householdId: string,
  editingId: string | null,
  input: DiaperInput,
): void {
  if (editingId) {
    runMutation({
      name: 'updateDiaper',
      payload: { householdId, diaperId: editingId, input: diaperInputToPayload(input) },
      coalesceKey: `updateDiaper:${editingId}`,
    })
    return
  }
  runMutation({
    name: 'createDiaper',
    payload: { householdId, input: diaperInputToPayload(input) },
    coalesceKey: `createDiaper:${newClientId()}`,
  })
}

export function deleteDiaperBackground(householdId: string, diaperId: string): void {
  runMutation({
    name: 'deleteDiaper',
    payload: { householdId, diaperId },
    coalesceKey: `deleteDiaper:${diaperId}`,
  })
}

export function diaperKindLabel(kind: Diaper['kind']): string {
  if (kind === 'wet') return 'Wet'
  if (kind === 'poop') return 'Poop'
  return 'Both'
}

export function defaultBabyForDiaper(babyIds: BabyId[]): BabyId | null {
  return babyIds[0] ?? null
}
