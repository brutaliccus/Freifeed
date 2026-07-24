import { useEffect, useState, type CSSProperties } from 'react'
import { Flower2 } from 'lucide-react'
import { babyBorderRingStyle } from '../lib/babyBorderColors'
import type { Baby, BabyId } from '../types'

interface BabyAvatarProps {
  baby: Baby | BabyId
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showName?: boolean
  selected?: boolean
  onClick?: () => void
}

const sizes = { sm: 48, md: 72, lg: 96, xl: 192 }

export function BabyAvatar({ baby, size = 'md', showName = false, selected, onClick }: BabyAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const rawPhotoUrl = typeof baby === 'string' ? null : baby?.photoUrl

  useEffect(() => {
    setImgFailed(false)
  }, [rawPhotoUrl])

  if (baby == null) return null
  const id = typeof baby === 'string' ? baby : baby.id
  if (!id) return null
  const data = typeof baby === 'string' ? null : baby
  const name = data?.name ?? id
  const photoUrl = !imgFailed ? rawPhotoUrl : null
  const px = sizes[size]
  const framed = typeof baby !== 'string'
  const ringStyle: CSSProperties = {
    width: px,
    height: px,
    ...(framed ? babyBorderRingStyle(baby) : {}),
  }
  const className = [
    'baby-avatar',
    `baby-avatar--${size}`,
    framed ? 'baby-avatar--framed' : '',
    selected ? 'baby-avatar--selected' : '',
    onClick ? 'baby-avatar--clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <div className="baby-avatar__ring" style={ringStyle}>
        {photoUrl ? (
          <img
            key={photoUrl}
            src={photoUrl}
            alt={name}
            className="baby-avatar__img"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="baby-avatar__placeholder" aria-hidden>
            <Flower2 size={px * 0.35} />
          </span>
        )}
      </div>
      {showName && <span className="baby-avatar__name">{name}</span>}
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={selected}>
        {inner}
      </button>
    )
  }

  return <div className={className}>{inner}</div>
}
