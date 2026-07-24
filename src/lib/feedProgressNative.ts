import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type FeedProgressActionEvent = {
  actionId: string
  babyId: string
  feedingId?: string
}

export interface FeedProgressNativePlugin {
  show(options: {
    id: number
    title: string
    body: string
    alert: boolean
    babyId: string
    feedingId?: string
    /** Session start (epoch ms). Passed as string to avoid Capacitor number bridge issues. */
    startedAtMs: number
    startedAtMsText?: string
  }): Promise<void>
  dismiss(options: { id: number }): Promise<void>
  dismissAll(): Promise<void>
  addListener(
    eventName: 'feedProgressActionPerformed',
    listenerFunc: (event: FeedProgressActionEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const FeedProgressNative = registerPlugin<FeedProgressNativePlugin>('FeedProgress')
