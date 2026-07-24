import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type FeedWatchShownEvent = {
  babyId: string
  feedingId?: string
  startAtMs: number
}

export type FeedWatchEndedEvent = {
  babyId: string
  feedingId?: string
  startAtMs: number
}

export interface FeedWatchNativePlugin {
  setWatchConfig(options: {
    enabled: boolean
    householdId: string
    idToken: string
    projectId?: string
    ownedFeedingIds: string[]
  }): Promise<void>
  syncAlertSessionsFromWeb(options: { json: string }): Promise<void>
  registerPushToken(options: { authToken: string }): Promise<void>
  getPushToken(): Promise<{ token: string }>
  addListener(
    eventName: 'feedWatchShown',
    listenerFunc: (event: FeedWatchShownEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'feedWatchEnded',
    listenerFunc: (event: FeedWatchEndedEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'appResumed',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>
}

export const FeedWatchNative = registerPlugin<FeedWatchNativePlugin>('FeedWatch')
