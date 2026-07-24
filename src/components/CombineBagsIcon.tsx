import { ArrowRight } from 'lucide-react'
import { BottleIcon } from './BottleIcon'

interface CombineBagsIconProps {
  className?: string
}

/** Two bottles overlapping a center arrow (left in front, right behind). */
export function CombineBagsIcon({ className = '' }: CombineBagsIconProps) {
  return (
    <span className={`combine-bags-icon ${className}`.trim()} aria-hidden>
      <BottleIcon size={26} className="combine-bags-icon__bottle combine-bags-icon__bottle--left" />
      <ArrowRight className="combine-bags-icon__arrow" size={13} strokeWidth={2} aria-hidden />
      <BottleIcon size={26} className="combine-bags-icon__bottle combine-bags-icon__bottle--right" />
    </span>
  )
}
