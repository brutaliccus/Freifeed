/** Keeps bottom fixed chrome (nav, feed players) at the layout viewport when the keyboard opens. */
const INSET_VAR = '--viewport-chrome-inset'

function keyboardInsetPx(): number {
  const vv = window.visualViewport
  if (!vv) return 0
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
}

function applyKeyboardInset(): void {
  document.documentElement.style.setProperty(INSET_VAR, `${keyboardInsetPx()}px`)
}

export function initViewportChromeLock(): void {
  applyKeyboardInset()

  const vv = window.visualViewport
  if (!vv) return

  vv.addEventListener('resize', applyKeyboardInset)
  vv.addEventListener('scroll', applyKeyboardInset)
  window.addEventListener('resize', applyKeyboardInset)
}
