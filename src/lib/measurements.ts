import {
  apiCreateMeasurement,
  apiDeleteMeasurement,
  apiListMeasurements,
  apiUpdateMeasurement,
  formatApiError,
  type MeasurementInput,
} from './api'
import type { Measurement } from '../types'

export type { MeasurementInput }

export async function fetchMeasurements(householdId: string): Promise<Measurement[]> {
  try {
    return await apiListMeasurements(householdId)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function createMeasurement(
  householdId: string,
  input: MeasurementInput,
): Promise<string> {
  try {
    return await apiCreateMeasurement(householdId, input)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function updateMeasurement(
  householdId: string,
  measurementId: string,
  input: MeasurementInput,
): Promise<void> {
  try {
    await apiUpdateMeasurement(householdId, measurementId, input)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function deleteMeasurement(
  householdId: string,
  measurementId: string,
): Promise<void> {
  try {
    await apiDeleteMeasurement(householdId, measurementId)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export function latestMeasurementForBaby(
  measurements: Measurement[],
  babyId: string,
): Measurement | null {
  return measurements.find((m) => m.babyId === babyId) ?? null
}

export function latestByField(
  measurements: Measurement[],
  babyId: string,
  field: 'weightLb' | 'lengthIn' | 'headCircIn',
): Measurement | null {
  for (const m of measurements) {
    if (m.babyId !== babyId) continue
    if (field === 'weightLb' && (m.weightLb != null || m.weightOz != null)) return m
    if (field !== 'weightLb' && m[field] != null) return m
  }
  return null
}
