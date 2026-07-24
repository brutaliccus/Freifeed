import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type MedicineAlertActionEvent = {
  medicineId: string
}

export type MedicineAlertShownEvent = {
  medicineId: string
  dueMs: number
}

export type MedicineAlertScheduleItem = {
  id: number
  atMs: number
  title: string
  body: string
  medicineId: string
  dueMs: number
}

export interface MedicineAlertNativePlugin {
  show(options: {
    id: number
    title: string
    body: string
    alert?: boolean
    medicineId: string
    dueMs: number
  }): Promise<void>
  scheduleAlarms(options: { items: MedicineAlertScheduleItem[] }): Promise<void>
  cancelScheduledInRange(options: { baseId: number; count: number }): Promise<void>
  cancelScheduledIds(options: { ids: number[] }): Promise<void>
  dismissDeliveredInRange(options: { baseId: number; count: number }): Promise<void>
  syncAlertFiredFromWeb(options: { json: string }): Promise<void>
  getAlertFiredJson(): Promise<{ json: string }>
  addListener(
    eventName: 'medicineAlertActionPerformed',
    listenerFunc: (event: MedicineAlertActionEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'medicineAlertShown',
    listenerFunc: (event: MedicineAlertShownEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const MedicineAlertNative = registerPlugin<MedicineAlertNativePlugin>('MedicineAlert')

/** Must match MedicineAlertPlugin.java MED_ID_BASE / MED_ID_SPAN. */
export const MEDICINE_ALERT_ID_BASE = 20_000
export const MEDICINE_ALERT_ID_SPAN = 8_000
