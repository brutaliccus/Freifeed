import type { AndroidAppUpdateInfo } from './api'

const DISMISSED_KEY = 'freifeed-apk-update-alert-dismissed'
const SHOWN_KEY = 'freifeed-apk-update-alert-shown'

export function getApkReleaseKey(
  remote: Pick<AndroidAppUpdateInfo, 'releasedAt' | 'driveModifiedTime' | 'versionCode'>,
): string {
  if (remote.releasedAt) return remote.releasedAt
  if (remote.driveModifiedTime) return remote.driveModifiedTime
  if (remote.versionCode != null) return `vc:${remote.versionCode}`
  return ''
}

function readKey(storageKey: string): string | null {
  try {
    const v = localStorage.getItem(storageKey)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

function writeKey(storageKey: string, value: string | null): void {
  try {
    if (!value) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, value)
  } catch {
    /* ignore */
  }
}

export function isApkUpdateAlertDismissed(releaseKey: string): boolean {
  return readKey(DISMISSED_KEY) === releaseKey
}

export function isApkUpdateAlertShown(releaseKey: string): boolean {
  return readKey(SHOWN_KEY) === releaseKey
}

export function markApkUpdateAlertShown(releaseKey: string): void {
  writeKey(SHOWN_KEY, releaseKey)
}

export function markApkUpdateAlertDismissed(releaseKey: string): void {
  writeKey(DISMISSED_KEY, releaseKey)
}
