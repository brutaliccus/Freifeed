import milkBagSvg from '../assets/milkbag.svg?raw'

interface MilkBagIconProps {
  className?: string
  size?: number
  /** Solid black silhouette for buttons on accent backgrounds. */
  variant?: 'inherit' | 'black'
}

function parseViewBox(svg: string): string {
  const match = svg.match(/viewBox="([^"]+)"/i)
  return match?.[1] ?? '0 0 512 512'
}

function parsePath(svg: string): string {
  return svg.match(/\sd="([^"]+)"/)?.[1] ?? ''
}

const VIEW_BOX = parseViewBox(milkBagSvg)
const MILK_BAG_PATH = parsePath(milkBagSvg)

/** Milk storage bag silhouette — fill follows `currentColor` or solid black. */
export function MilkBagIcon({ className = '', size = 24, variant = 'inherit' }: MilkBagIconProps) {
  const fill = variant === 'black' ? '#0a080e' : 'currentColor'
  return (
    <svg
      className={`milk-bag-icon${variant === 'black' ? ' milk-bag-icon--black' : ''} ${className}`.trim()}
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      aria-hidden
    >
      <path fill={fill} fillRule="evenodd" d={MILK_BAG_PATH} />
    </svg>
  )
}
