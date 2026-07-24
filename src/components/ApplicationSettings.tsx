import { useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw, Smartphone } from 'lucide-react'
import { formatApiError, type AndroidAppUpdateInfo } from '../lib/api'
import {
  fetchAndroidAppUpdateInfo,
  getInstalledAndroidVersion,
  getLastInstalledReleaseAt,
  installAndroidAppUpdate,
  isRemoteApkNewer,
  isUpdateAvailable,
} from '../lib/appUpdate'
import { ANDROID_APK_RELEASES_URL } from '../lib/appUpdateConfig'
import { isAndroidNative } from '../lib/platform'
import {
  applyWebContentUpdate,
  fetchRemoteBuildId,
  getInstalledBuildId,
} from '../lib/webContentUpdate'
import { HomeAppPreferencesSettings } from './HomeAppPreferencesSettings'
import { ThemeSettings } from './ThemeSettings'
import { TrackerNavSettings } from './TrackerNavSettings'
import type { UserProfile } from '../types'

function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRemoteLabel(info: AndroidAppUpdateInfo): string {
  if (info.versionName) return info.versionName
  if (info.fileName) return info.fileName.replace(/\.apk$/i, '')
  return 'Latest'
}

interface ApplicationSettingsProps {
  profile: UserProfile | null
  onProfileUpdated: () => void
}

export function ApplicationSettings({ profile, onProfileUpdated }: ApplicationSettingsProps) {
  const nativeAndroid = isAndroidNative()
  const [webUpdateAvailable, setWebUpdateAvailable] = useState(false)
  const [webRefreshBusy, setWebRefreshBusy] = useState(false)

  const checkWebUpdate = useCallback(async () => {
    const remote = await fetchRemoteBuildId()
    const installed = getInstalledBuildId()
    setWebUpdateAvailable(!!remote && !!installed && remote !== installed)
  }, [])
  const [installed, setInstalled] = useState<{ versionCode: number; versionName: string } | null>(
    null,
  )
  const [remote, setRemote] = useState<AndroidAppUpdateInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const server = await fetchAndroidAppUpdateInfo()
      setRemote(server)
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setLoading(false)
    }

    if (nativeAndroid) {
      void getInstalledAndroidVersion()
        .then(setInstalled)
        .catch(() => setInstalled(null))
    } else {
      setInstalled(null)
    }
  }, [nativeAndroid])

  useEffect(() => {
    void refresh()
    void checkWebUpdate()
  }, [refresh, checkWebUpdate])

  const lastRecorded = getLastInstalledReleaseAt()
  const updateReady = remote
    ? nativeAndroid && installed
      ? isUpdateAvailable(installed.versionCode, remote, lastRecorded)
      : isRemoteApkNewer(remote, lastRecorded, installed?.versionCode)
    : false

  const handleDownload = async () => {
    if (!remote) return
    setDownloading(true)
    setProgress(0)
    setError(null)
    try {
      await installAndroidAppUpdate(remote, (pct) => setProgress(pct))
      if (nativeAndroid) {
        void getInstalledAndroidVersion()
          .then(setInstalled)
          .catch(() => setInstalled(null))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : formatApiError(e))
    } finally {
      setDownloading(false)
      setProgress(null)
    }
  }

  return (
    <>
      <ThemeSettings profile={profile} onUpdated={onProfileUpdated} />
      <HomeAppPreferencesSettings profile={profile} onUpdated={onProfileUpdated} />
      <TrackerNavSettings profile={profile} onUpdated={onProfileUpdated} />

      <section className="profile-section profile-section--web-refresh">
        <h2>App refresh</h2>
        <p className="muted">
          Freifeed loads from the web. After we deploy updates, use refresh here if you do not see a
          banner at the bottom of the screen.
        </p>
        <dl className="app-update-readout">
          <div className="app-update-readout__row">
            <dt>Loaded build</dt>
            <dd className="app-update-readout__mono">{getInstalledBuildId() || '—'}</dd>
          </div>
        </dl>
        {webUpdateAvailable ? (
          <p className="app-update-status app-update-status--ready">New version available on the server</p>
        ) : (
          <p className="app-update-status muted">This device has the latest hosted build</p>
        )}
        <div className="app-update-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void checkWebUpdate()}
            disabled={webRefreshBusy}
          >
            <RefreshCw size={18} aria-hidden />
            Check for updates
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setWebRefreshBusy(true)
              void applyWebContentUpdate().finally(() => setWebRefreshBusy(false))
            }}
            disabled={webRefreshBusy}
          >
            <RefreshCw size={18} aria-hidden />
            {webRefreshBusy ? 'Refreshing…' : webUpdateAvailable ? 'Refresh now' : 'Reload app'}
          </button>
        </div>
      </section>

      <section className="profile-section profile-section--app-update">
      <h2>Android APK</h2>
      <p className="muted">
        Download the latest Freifeed Android APK from GitHub Releases
        {nativeAndroid
          ? '. New releases appear here automatically after a GitHub publish.'
          : '. Use this in the browser or PWA, then open the file on your phone to install.'}
      </p>

      <dl className="app-update-readout">
        {nativeAndroid && (
          <div className="app-update-readout__row">
            <dt>Installed</dt>
            <dd>
              {installed ? (
                <>
                  v{installed.versionName}
                  <span className="muted"> (build {installed.versionCode})</span>
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
        )}
        <div className="app-update-readout__row">
          <dt>On GitHub</dt>
          <dd>
            {remote ? (
              <>
                {formatRemoteLabel(remote)}
                {remote.versionCode != null && (
                  <span className="muted"> (build {remote.versionCode})</span>
                )}
                <span className="muted"> · {formatBytes(remote.sizeBytes)}</span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      {updateReady ? (
        <p className="app-update-status app-update-status--ready">New build available on GitHub</p>
      ) : remote ? (
        <p className="app-update-status muted">You have the latest APK from GitHub</p>
      ) : null}

      {error && <p className="error-text">{error}</p>}
      {progress != null && downloading && (
        <p className="muted app-update-progress">Downloading… {progress}%</p>
      )}

      <div className="app-update-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void refresh()}
          disabled={loading || downloading}
        >
          <RefreshCw size={18} aria-hidden />
          {loading ? 'Checking…' : 'Check for updates'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleDownload()}
          disabled={!remote || downloading}
        >
          <Download size={18} aria-hidden />
          {downloading
            ? 'Downloading…'
            : nativeAndroid
              ? updateReady
                ? 'Download & install'
                : 'Download APK'
              : updateReady
                ? 'Download latest APK'
                : 'Download APK'}
        </button>
      </div>

      {nativeAndroid ? (
        <p className="muted app-update-hint">
          <Smartphone size={16} aria-hidden className="app-update-hint__icon" />
          You may need to allow &quot;Install unknown apps&quot; for Freifeed when prompted.
        </p>
      ) : (
        <p className="muted app-update-hint">
          The APK saves to your device downloads. Open it from your files app to install on Android.
        </p>
      )}

      <a
        className="app-update-drive-link muted"
        href={remote?.releaseUrl || ANDROID_APK_RELEASES_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open releases on GitHub
      </a>
    </section>
    </>
  )
}
