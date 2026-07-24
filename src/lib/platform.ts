import { Capacitor } from '@capacitor/core'

export function isNativeCapacitor(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function isAndroidNative(): boolean {
  return isNativeCapacitor() && Capacitor.getPlatform() === 'android'
}
