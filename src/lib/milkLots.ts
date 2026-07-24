import { fetchFeedings, createFeeding, updateFeeding, deleteFeeding, type FeedingInput } from './feedings'
import {
  apiListMilkLots,
  apiGetMilkSummary,
  apiDeleteMilkLot,
  apiUpdateMilkLot,
  apiCombineMilkLots,
  apiTransferMilkLotToFreezer,
  apiTransferMilkLotToFridge,
  apiRedistributeMilkLot,
} from './api'
import type { MilkLot, MilkSummary } from '../types'

export function computeMilkSummary(lots: MilkLot[]): MilkSummary {
  let totalRemainingOz = 0
  let fridgeOz = 0
  let frozenOz = 0
  for (const lot of lots) {
    const remaining = lot.remainingOz ?? 0
    if (remaining <= 0) continue
    totalRemainingOz += remaining
    if (lot.storage === 'frozen') frozenOz += remaining
    else fridgeOz += remaining
  }
  return { totalRemainingOz, fridgeOz, frozenOz }
}

export type { FeedingInput }

export async function fetchMilkLots(householdId: string): Promise<MilkLot[]> {
  return apiListMilkLots(householdId)
}

export async function fetchMilkSummary(householdId: string): Promise<MilkSummary> {
  return apiGetMilkSummary(householdId)
}

export async function deleteMilkLot(householdId: string, lotId: string): Promise<void> {
  await apiDeleteMilkLot(householdId, lotId)
}

export async function updateMilkLot(
  householdId: string,
  lotId: string,
  payload: {
    volumeOz: number
    remainingOz: number
    note?: string | null
    storedAt?: Date | null
  },
): Promise<void> {
  await apiUpdateMilkLot(householdId, lotId, payload)
}

export async function transferMilkLotsToFreezer(
  householdId: string,
  lotIds: string[],
  bags: number[],
): Promise<void> {
  await apiTransferMilkLotToFreezer(householdId, lotIds, bags)
}

export async function transferMilkLotsToFridge(
  householdId: string,
  lotIds: string[],
  bags: number[],
): Promise<void> {
  await apiTransferMilkLotToFridge(householdId, lotIds, bags)
}

export async function combineMilkLots(
  householdId: string,
  lotIds: string[],
  addOz?: number | null,
): Promise<{ lotId: string; totalOz: number }> {
  return apiCombineMilkLots(householdId, lotIds, addOz)
}

export async function redistributeMilkLot(
  householdId: string,
  lotIds: string[],
  bags: number[],
): Promise<void> {
  await apiRedistributeMilkLot(householdId, lotIds, bags)
}

export { fetchFeedings, createFeeding, updateFeeding, deleteFeeding }
