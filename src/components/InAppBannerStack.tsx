import { Children, type ReactNode } from 'react'

/** Fixed top stack so multiple in-app banners push down instead of overlapping. */
export function InAppBannerStack({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean)
  if (items.length === 0) return null
  return <div className="in-app-banner-stack">{items}</div>
}
