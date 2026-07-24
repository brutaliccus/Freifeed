import { Download, Share, X } from 'lucide-react'
import { usePwaInstall } from '../hooks/usePwaInstall'

/** Prompts mobile users to install the PWA (see PwaUpdatePrompt for SW registration). */
export function PwaInstallPrompt() {
  const { visible, showIosHint, canNativeInstall, install, dismiss } = usePwaInstall()

  if (!visible) return null

  return (
    <div className="pwa-install-banner" role="dialog" aria-labelledby="pwa-install-title">
      <button type="button" className="pwa-install-banner__close icon-btn" onClick={dismiss} aria-label="Dismiss">
        <X size={18} />
      </button>
      <div className="pwa-install-banner__body">
        <Download size={22} className="pwa-install-banner__icon" aria-hidden />
        <div>
          <h2 id="pwa-install-title" className="pwa-install-banner__title">
            Install Buba
          </h2>
          {showIosHint ? (
            <p className="pwa-install-banner__text">
              Tap <Share size={14} className="pwa-install-banner__inline-icon" aria-hidden /> Share, then{' '}
              <strong>Add to Home Screen</strong> for quick access.
            </p>
          ) : (
            <p className="pwa-install-banner__text">Add to your home screen for a full-screen app experience.</p>
          )}
        </div>
      </div>
      {canNativeInstall && (
        <button type="button" className="btn btn-primary pwa-install-banner__action" onClick={() => void install()}>
          Install
        </button>
      )}
      {showIosHint && (
        <button type="button" className="btn btn-secondary pwa-install-banner__action" onClick={dismiss}>
          Got it
        </button>
      )}
    </div>
  )
}
