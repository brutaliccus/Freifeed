import logoUrl from '../assets/logo.png'

interface AppBrandProps {
  className?: string
  /** `splash` — full-screen loading; `default` — page header */
  variant?: 'default' | 'splash'
}

export function AppBrand({ className = '', variant = 'default' }: AppBrandProps) {
  return (
    <div
      className={['app-brand', `app-brand--${variant}`, className].filter(Boolean).join(' ')}
    >
      <img src={logoUrl} alt="Buba" className="app-brand__logo" decoding="async" />
    </div>
  )
}
