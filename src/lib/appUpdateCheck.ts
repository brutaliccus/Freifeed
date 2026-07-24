import { auth } from '../firebase'
import type { AndroidAppUpdateInfo } from './api'
import {
  fetchAndroidAppUpdateInfo,
  getInstalledAndroidVersion,
  getLastInstalledReleaseAt,
  isUpdateAvailable,
} from './appUpdate'
import { getApkReleaseKey } from './appUpdateAlertState'
import { isAndroidNative } from './platform'

export type AppUpdateCheckResult = {
  releaseKey: string
  remote: AndroidAppUpdateInfo
  versionLabel: string
}

/** Returns release info when a newer APK is on GitHub; null if up to date or unavailable. */
export async function checkAppUpdateRelease(): Promise<AppUpdateCheckResult | null> {
  if (!isAndroidNative() || !auth.currentUser) return null

  const remote = await fetchAndroidAppUpdateInfo()
  const releaseKey = getApkReleaseKey(remote)
  if (!releaseKey) return null

  const installed = await getInstalledAndroidVersion()
  const lastInstalled = getLastInstalledReleaseAt()
  const updateReady = isUpdateAvailable(installed.versionCode, remote, lastInstalled)
  if (!updateReady) return null

  const versionLabel = remote.versionName?.trim() || 'new version'
  return { releaseKey, remote, versionLabel }
}
