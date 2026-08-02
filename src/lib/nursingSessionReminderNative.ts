import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type NursingSessionReminderEvent = {
  sessionKey: string
}

export interface NursingSessionReminderNativePlugin {
  syncReminders(options: { json: string }): Promise<void>
  cancelAll(): Promise<void>
  addListener(
    eventName: 'nursingSessionReminderShown',
    listenerFunc: (event: NursingSessionReminderEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'nursingSessionReminderDismiss',
    listenerFunc: (event: NursingSessionReminderEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const NursingSessionReminderNative =
  registerPlugin<NursingSessionReminderNativePlugin>('NursingSessionReminder')
