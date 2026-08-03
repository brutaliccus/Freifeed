import {
  apiListMedicines,
  apiCreateMedicine,
  apiUpdateMedicine,
  apiDeleteMedicine,
  apiSetMedicineActive,
  medicineInputToPayload,
  type MedicineInput,
} from './api'
import { clearMedicineAlertFired } from './medicineAlertState'
import { runMutation, newClientId } from './mutationQueue'
import type { Medicine } from '../types'

export type { MedicineInput }

export async function fetchMedicines(householdId: string): Promise<Medicine[]> {
  return apiListMedicines(householdId)
}

export async function createMedicine(householdId: string, input: MedicineInput): Promise<string> {
  return apiCreateMedicine(householdId, input)
}

export async function updateMedicine(
  householdId: string,
  medicineId: string,
  input: MedicineInput,
): Promise<void> {
  await apiUpdateMedicine(householdId, medicineId, input)
}

export async function deleteMedicine(householdId: string, medicineId: string): Promise<void> {
  await apiDeleteMedicine(householdId, medicineId)
}

export async function setMedicineActive(
  householdId: string,
  medicineId: string,
  active: boolean,
  restartDuration = false,
): Promise<void> {
  await apiSetMedicineActive(householdId, medicineId, active, restartDuration)
}

export async function markMedicineTaken(
  householdId: string,
  medicineId: string,
  takenAt?: Date | null,
): Promise<void> {
  markMedicineTakenBackground(householdId, medicineId, takenAt)
}

function bumpMedicineSchedule() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('freifeed-medicines-schedule-dirty'))
  }
}

export function createMedicineBackground(householdId: string, input: MedicineInput): void {
  runMutation({
    name: 'createMedicine',
    payload: { householdId, input: medicineInputToPayload(input) },
    coalesceKey: `createMedicine:${newClientId()}`,
  })
  bumpMedicineSchedule()
}

export function updateMedicineBackground(
  householdId: string,
  medicineId: string,
  input: MedicineInput,
): void {
  runMutation({
    name: 'updateMedicine',
    payload: {
      householdId,
      medicineId,
      input: medicineInputToPayload(input),
    },
    coalesceKey: `updateMedicine:${medicineId}`,
  })
  bumpMedicineSchedule()
}

export function deleteMedicineBackground(householdId: string, medicineId: string): void {
  runMutation({
    name: 'deleteMedicine',
    payload: { householdId, medicineId },
    coalesceKey: `deleteMedicine:${medicineId}`,
  })
  bumpMedicineSchedule()
}

export function setMedicineActiveBackground(
  householdId: string,
  medicineId: string,
  active: boolean,
  restartDuration = false,
): void {
  runMutation({
    name: 'setMedicineActive',
    payload: { householdId, medicineId, active, restartDuration },
    coalesceKey: `setMedicineActive:${medicineId}`,
  })
  bumpMedicineSchedule()
}

export function markMedicineTakenBackground(
  householdId: string,
  medicineId: string,
  takenAt?: Date | null,
): void {
  clearMedicineAlertFired(medicineId)
  bumpMedicineSchedule()
  runMutation({
    name: 'markMedicineTaken',
    payload: {
      householdId,
      medicineId,
      takenAt: takenAt?.toISOString() ?? null,
    },
    coalesceKey: `markMedicineTaken:${medicineId}`,
  })
}
