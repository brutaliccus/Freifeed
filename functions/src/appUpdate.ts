import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { db, requireUid } from './helpers'

const region = 'us-central1'

/** Default GitHub repo that hosts Freifeed APK releases. */
export const GITHUB_APK_OWNER = 'brutaliccus'
export const GITHUB_APK_REPO = 'Freifeed'

const callableOptions = { region, invoker: 'public' as const }

const httpOptions = {
  region,
  cors: true,
  timeoutSeconds: 540,
  memory: '512MiB' as const,
  invoker: 'public' as const,
}

interface GithubAsset {
  name: string
  size: number
  browser_download_url: string
  url: string
  content_type?: string
}

interface GithubRelease {
  id: number
  tag_name: string
  name: string | null
  published_at: string | null
  html_url: string
  assets: GithubAsset[]
}

interface UpdateMeta {
  versionCode: number | null
  versionName: string | null
  fileName: string
  sizeBytes: number | null
  releasedAt: string | null
  downloadAssetUrl: string
  apiAssetUrl: string
  releaseTag: string
  releaseUrl: string
}

function downloadUrlForProject(): string {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'freifeed-3b861'
  return `https://${region}-${projectId}.cloudfunctions.net/downloadAndroidApk`
}

function githubHeaders(accept = 'application/vnd.github+json'): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'freifeed-functions',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_UPDATE_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function resolveGithubRepo(): Promise<{ owner: string; repo: string }> {
  const snap = await db.doc('config/androidApk').get()
  const data = snap.data() ?? {}
  const owner =
    typeof data.githubOwner === 'string' && data.githubOwner.trim()
      ? data.githubOwner.trim()
      : GITHUB_APK_OWNER
  const repo =
    typeof data.githubRepo === 'string' && data.githubRepo.trim()
      ? data.githubRepo.trim()
      : GITHUB_APK_REPO
  return { owner, repo }
}

function parseVersionNameFromTag(tag: string): string {
  return tag.replace(/^v/i, '').trim() || tag
}

/** Prefer explicit versionCode from update-info.json / config; else derive from semver tag. */
function versionCodeFromName(versionName: string | null): number | null {
  if (!versionName) return null
  const parts = versionName.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  return major * 10000 + minor * 100 + patch
}

async function fetchGithubJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: githubHeaders() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 404) {
      throw new HttpsError(
        'failed-precondition',
        'No GitHub release found. Publish a release with an APK asset on brutaliccus/Freifeed.',
      )
    }
    if (res.status === 401 || res.status === 403) {
      throw new HttpsError(
        'permission-denied',
        'GitHub access denied. For a private repo, set GITHUB_TOKEN on the Cloud Functions runtime.',
      )
    }
    throw new HttpsError(
      'internal',
      `GitHub API error (${res.status}): ${body.slice(0, 200) || res.statusText}`,
    )
  }
  return (await res.json()) as T
}

async function fetchUpdateInfoJson(
  asset: GithubAsset | undefined,
): Promise<{ versionCode?: number; versionName?: string } | null> {
  if (!asset) return null
  try {
    const res = await fetch(asset.url, {
      headers: githubHeaders('application/octet-stream'),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { versionCode?: unknown; versionName?: unknown }
    return {
      versionCode: typeof data.versionCode === 'number' ? data.versionCode : undefined,
      versionName: typeof data.versionName === 'string' ? data.versionName : undefined,
    }
  } catch {
    return null
  }
}

async function resolveLatestUpdate(): Promise<UpdateMeta> {
  const { owner, repo } = await resolveGithubRepo()
  const release = await fetchGithubJson<GithubRelease>(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
  )

  const apk =
    release.assets.find((a) => a.name.toLowerCase().endsWith('.apk')) ??
    release.assets.find((a) => (a.content_type ?? '').includes('android'))
  if (!apk) {
    throw new HttpsError(
      'failed-precondition',
      `Latest GitHub release (${release.tag_name}) has no APK asset.`,
    )
  }

  const infoAsset = release.assets.find(
    (a) => a.name === 'update-info.json' || a.name.endsWith('.update.json'),
  )
  const infoJson = await fetchUpdateInfoJson(infoAsset)

  const configSnap = await db.doc('config/androidApk').get()
  const config = configSnap.data() ?? {}

  const versionName =
    (typeof infoJson?.versionName === 'string' && infoJson.versionName) ||
    (typeof config.versionName === 'string' && config.versionName) ||
    parseVersionNameFromTag(release.tag_name)

  const versionCode =
    (typeof infoJson?.versionCode === 'number' && infoJson.versionCode) ||
    (typeof config.versionCode === 'number' && config.versionCode) ||
    versionCodeFromName(versionName)

  return {
    versionCode,
    versionName,
    fileName: apk.name,
    sizeBytes: Number.isFinite(apk.size) ? apk.size : null,
    releasedAt: release.published_at,
    downloadAssetUrl: apk.browser_download_url,
    apiAssetUrl: apk.url,
    releaseTag: release.tag_name,
    releaseUrl: release.html_url,
  }
}

/** Returns latest APK metadata and authenticated download URL for the native app. */
export const getAndroidAppUpdate = onCall(callableOptions, async (request) => {
  requireUid(request)
  const meta = await resolveLatestUpdate()

  return {
    fileName: meta.fileName,
    sizeBytes: meta.sizeBytes,
    /** ISO publish time — used as the release fingerprint on the client. */
    releasedAt: meta.releasedAt,
    /** @deprecated alias kept for older clients */
    driveModifiedTime: meta.releasedAt,
    versionCode: meta.versionCode,
    versionName: meta.versionName,
    downloadUrl: downloadUrlForProject(),
    releaseTag: meta.releaseTag,
    releaseUrl: meta.releaseUrl,
    /** @deprecated unused; kept so older clients do not break on missing field */
    driveFileId: meta.releaseTag,
  }
})

async function verifyBearer(req: { headers: { authorization?: string } }): Promise<void> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) {
    throw new HttpsError('unauthenticated', 'Sign in required')
  }
  try {
    await getAuth().verifyIdToken(token)
  } catch {
    throw new HttpsError('unauthenticated', 'Invalid auth token')
  }
}

/** Streams the GitHub release APK to the device (Authorization: Bearer Firebase ID token). */
export const downloadAndroidApk = onRequest(httpOptions, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed')
    return
  }

  try {
    await verifyBearer(req)
  } catch (e) {
    const code = e instanceof HttpsError ? e.code : 'unauthenticated'
    const message = e instanceof HttpsError ? e.message : 'Unauthorized'
    res.status(code === 'unauthenticated' ? 401 : 403).send(message)
    return
  }

  try {
    const meta = await resolveLatestUpdate()
    // Prefer the API asset URL so private repos work when GITHUB_TOKEN is set.
    const upstream = await fetch(meta.apiAssetUrl, {
      headers: githubHeaders('application/octet-stream'),
    })
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      res
        .status(upstream.status === 404 ? 404 : 502)
        .send(detail.trim() || `GitHub download failed (${upstream.status})`)
      return
    }

    const fileName = meta.fileName.toLowerCase().endsWith('.apk')
      ? meta.fileName
      : 'freifeed-update.apk'

    res.setHeader('Content-Type', 'application/vnd.android.package-archive')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    if (meta.sizeBytes != null) {
      res.setHeader('Content-Length', String(meta.sizeBytes))
    }
    if (meta.releasedAt) {
      res.setHeader('X-Freifeed-Released-At', meta.releasedAt)
    }

    const { Readable } = await import('node:stream')
    // Node 20 fetch body is a web ReadableStream — convert for Express res.
    Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res)
  } catch (e) {
    console.error('downloadAndroidApk', e)
    const message = e instanceof HttpsError ? e.message : 'Download failed'
    const status =
      e instanceof HttpsError
        ? e.code === 'permission-denied'
          ? 403
          : e.code === 'failed-precondition'
            ? 404
            : 500
        : 500
    if (!res.headersSent) res.status(status).send(message)
  }
})
