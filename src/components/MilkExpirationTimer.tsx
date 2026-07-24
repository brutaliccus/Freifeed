import { getMilkExpirationState } from '../lib/milkExpiration'
import type { MilkLot } from '../types'

interface MilkExpirationTimerProps {
  lot: MilkLot
}

export function MilkExpirationTimer({ lot }: MilkExpirationTimerProps) {
  if (lot.remainingOz <= 0) return null

  const { tone, label } = getMilkExpirationState(lot)

  return (
    <span className={`milk-expiration-timer milk-expiration-timer--${tone}`} title="Storage time remaining">
      {label}
    </span>
  )
}
