import {
  apiListMedicines,
  apiCreateMedicine,
  apiUpdateMedicine,
  apiDeleteMedicine,
  apiSetMedicineActive,
  apiMarkMedicineTaken,
  type MedicineInput,
} from './api'
import { clearMedicineAlertFired } from './medicineAlertState'
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
  await apiMarkMedicineTaken(householdId, medicineId, takenAt)
  clearMedicineAlertFired(medicineId)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('freifeed-medicines-schedule-dirty'))
  }
}
