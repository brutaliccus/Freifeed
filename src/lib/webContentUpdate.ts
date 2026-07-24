/** Injected at build time (see vite.config.ts). */
declare const __FREIFEED_BUILD_ID__: string

const BUILD_META = 'freifeed-build'
const DISMISS_KEY = 'freifeed-web-update-dismissed'
const ACK_KEY = 'freifeed-web-update-acknowledged'
const PWA_SW_DISMISS_KEY = 'freifeed-pwa-sw-update-dismissed'

export function getInstalledBuildId(): string {
  const fromMeta = document.querySelector(`meta[name="${BUILD_META}"]`)?.getAttribute('content')
  if (fromMeta) return fromMeta
  try {
    return typeof __FREIFEED_BUILD_ID__ !== 'undefined' ? __FREIFEED_BUILD_ID__ : ''
  } catch {
    return ''
  }
}

export function parseBuildIdFromHtml(html: string): string | null {
  const m = html.match(
    new RegExp(`<meta\\s+name=["']${BUILD_META}["']\\s+content=["']([^"']+)["']`, 'i'),
  )
  return m?.[1] ?? null
}

export async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const url = new URL(window.location.origin)
    url.pathname = '/'
    url.search = `_ff_build_check=${Date.now()}`
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    })
    if (!res.ok) return null
    return parseBuildIdFromHtml(await res.text())
  } catch {
    return null
  }
}

export function isWebContentUpdateDismissed(remoteBuildId: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === remoteBuildId
  } catch {
    return false
  }
}

export function dismissWebContentUpdate(remoteBuildId: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, remoteBuildId)
  } catch {
    /* ignore */
  }
}

export function clearWebContentUpdateDismiss(): void {
  try {
    sessionStorage.removeItem(DISMISS_KEY)
  } catch {
    /* ignore */
  }
}

export function getAcknowledgedBuildId(): string | null {
  try {
    return localStorage.getItem(ACK_KEY)
  } catch {
    return null
  }
}

/** User refreshed or dismissed this hosted build — hide until a newer deploy. */
export function acknowledgeWebContentBuild(buildId: string): void {
  if (!buildId) return
  try {
    localStorage.setItem(ACK_KEY, buildId)
    sessionStorage.setItem(DISMISS_KEY, buildId)
  } catch {
    /* ignore */
  }
}

export function clearAcknowledgedWebContentBuild(): void {
  try {
    localStorage.removeItem(ACK_KEY)
  } catch {
    /* ignore */
  }
}

export function isWebContentUpdateSuppressed(
  remoteBuildId: string,
  installedBuildId: string,
): boolean {
  if (!remoteBuildId || remoteBuildId === installedBuildId) return true
  if (isWebContentUpdateDismissed(remoteBuildId)) return true
  if (getAcknowledgedBuildId() === remoteBuildId) return true
  return false
}

export function isPwaSwUpdateDismissed(): boolean {
  try {
    return sessionStorage.getItem(PWA_SW_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissPwaSwUpdate(): void {
  try {
    sessionStorage.setItem(PWA_SW_DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearPwaSwUpdateDismiss(): void {
  try {
    sessionStorage.removeItem(PWA_SW_DISMISS_KEY)
  } catch {
    /* ignore */
  }
}

/** True when the app just reloaded after the user tapped Refresh now. */
export function consumePostUpdateReload(): boolean {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('_ff_reload')) return false
    url.searchParams.delete('_ff_reload')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next)
    return true
  } catch {
    return false
  }
}

/** Reload to pick up a new hosted build (WebView cache-bust friendly). */
export async function applyWebContentUpdate(
  updateServiceWorker?: (reloadPage?: boolean) => Promise<void>,
): Promise<void> {
  if (updateServiceWorker) {
    try {
      await updateServiceWorker(true)
      return
    } catch {
      /* fall through to hard reload */
    }
  }
  const url = new URL(window.location.href)
  url.searchParams.set('_ff_reload', String(Date.now()))
  window.location.replace(url.toString())
}
