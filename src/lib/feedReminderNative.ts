import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type FeedReminderActionEvent = {
  babyId: string
  lastStartIso: string
}

export type FeedReminderShownEvent = FeedReminderActionEvent & {
  kind: string
}

export interface FeedReminderNativePlugin {
  syncReminders(options: { json: string }): Promise<void>
  cancelAll(): Promise<void>
  addListener(
    eventName: 'feedReminderShown',
    listenerFunc: (event: FeedReminderShownEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'feedReminderDismiss',
    listenerFunc: (event: FeedReminderActionEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'feedReminderSnooze',
    listenerFunc: (event: FeedReminderActionEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const FeedReminderNative = registerPlugin<FeedReminderNativePlugin>('FeedReminder')
