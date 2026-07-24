import { auth } from '../firebase'
import { apiGetAndroidAppUpdate, type AndroidAppUpdateInfo } from './api'
import {
  APK_DRIVE_MODIFIED_STORAGE_KEY,
  APK_RELEASED_AT_STORAGE_KEY,
} from './appUpdateConfig'
import { AppUpdateNative } from './appUpdateNative'
import { isAndroidNative } from './platform'

function releaseFingerprint(remote: Pick<AndroidAppUpdateInfo, 'releasedAt' | 'driveModifiedTime'>): string | null {
  return remote.releasedAt ?? remote.driveModifiedTime ?? null
}

export function getLastInstalledReleaseAt(): string | null {
  try {
    return (
      localStorage.getItem(APK_RELEASED_AT_STORAGE_KEY) ||
      localStorage.getItem(APK_DRIVE_MODIFIED_STORAGE_KEY)
    )
  } catch {
    return null
  }
}

/** @deprecated use getLastInstalledReleaseAt */
export const getLastInstalledDriveModified = getLastInstalledReleaseAt

export function markApkInstalled(releasedAt: string | null) {
  if (!releasedAt) return
  try {
    localStorage.setItem(APK_RELEASED_AT_STORAGE_KEY, releasedAt)
    localStorage.removeItem(APK_DRIVE_MODIFIED_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function isUpdateAvailable(
  installedVersionCode: number,
  remote: Pick<AndroidAppUpdateInfo, 'versionCode' | 'releasedAt' | 'driveModifiedTime'>,
  lastInstalledReleaseAt: string | null,
): boolean {
  if (remote.versionCode != null && remote.versionCode > installedVersionCode) {
    return true
  }
  const stamp = releaseFingerprint(remote)
  if (!stamp) return false
  if (lastInstalledReleaseAt === stamp) return false
  if (lastInstalledReleaseAt == null) {
    return remote.versionCode == null || remote.versionCode > installedVersionCode
  }
  return true
}

export async function fetchAndroidAppUpdateInfo(): Promise<AndroidAppUpdateInfo> {
  return apiGetAndroidAppUpdate()
}

/** True when GitHub has a newer APK than the last download/install on this device. */
export function isRemoteApkNewer(
  remote: Pick<AndroidAppUpdateInfo, 'versionCode' | 'releasedAt' | 'driveModifiedTime'>,
  lastRecordedReleaseAt: string | null,
  installedVersionCode?: number | null,
): boolean {
  if (
    installedVersionCode != null &&
    remote.versionCode != null &&
    remote.versionCode > installedVersionCode
  ) {
    return true
  }
  const stamp = releaseFingerprint(remote)
  if (!stamp) return false
  if (lastRecordedReleaseAt === stamp) return false
  return true
}

async function downloadApkInBrowser(
  info: AndroidAppUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in required')
  const token = await user.getIdToken()

  const res = await fetch(info.downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail.trim() || `Download failed (${res.status})`)
  }

  const total = Number(res.headers.get('Content-Length')) || 0
  const fileName =
    info.fileName && info.fileName.toLowerCase().endsWith('.apk') ? info.fileName : 'freifeed.apk'

  let blob: Blob
  const body = res.body
  if (body && total > 0 && onProgress) {
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      onProgress(Math.min(100, Math.round((received / total) * 100)))
    }
    blob = new Blob(chunks as BlobPart[], { type: 'application/vnd.android.package-archive' })
    onProgress(100)
  } else {
    blob = await res.blob()
    onProgress?.(100)
  }

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }

  markApkInstalled(releaseFingerprint(info))
}

export async function downloadAndInstallAndroidUpdate(
  info: AndroidAppUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in required')
  const token = await user.getIdToken()

  let handle: { remove: () => Promise<void> } | undefined
  if (onProgress) {
    handle = await AppUpdateNative.addListener('downloadProgress', (e) => {
      onProgress(e.percent)
    })
  }

  try {
    await AppUpdateNative.downloadAndInstall({
      url: info.downloadUrl,
      authToken: token,
    })
    markApkInstalled(releaseFingerprint(info))
  } finally {
    await handle?.remove()
  }
}

/** Native: download + install. Web/PWA: download APK file via Cloud Function. */
export async function downloadApkFile(
  info: AndroidAppUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (isAndroidNative()) {
    await downloadAndInstallAndroidUpdate(info, onProgress)
  } else {
    await downloadApkInBrowser(info, onProgress)
  }
}

export async function getInstalledAndroidVersion(): Promise<{
  versionCode: number
  versionName: string
}> {
  const timeoutMs = 5_000
  return Promise.race([
    AppUpdateNative.getInstalledVersion(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('Version check timed out')), timeoutMs)
    }),
  ])
}

/** Download (and on native Android, install) the latest APK from GitHub Releases. */
export async function installAndroidAppUpdate(
  info?: AndroidAppUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<AndroidAppUpdateInfo> {
  const remote = info ?? (await fetchAndroidAppUpdateInfo())
  await downloadApkFile(remote, onProgress)
  return remote
}
