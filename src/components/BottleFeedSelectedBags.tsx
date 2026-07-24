import { MilkBagChip } from './MilkBagChip'
import { formatVolumeOz } from '../lib/feedingTypes'
import type { MilkDeduction, MilkLot } from '../types'

interface BottleFeedSelectedBagsProps {
  deductions: MilkDeduction[]
  lots: MilkLot[]
}

/** Selected milk bags for a bottle feed (read-only chips). */
export function BottleFeedSelectedBags({ deductions, lots }: BottleFeedSelectedBagsProps) {
  if (deductions.length === 0) return null

  const byId = new Map(lots.map((l) => [l.id, l]))

  return (
    <div className="bottle-feed-selected-bags">
      <span className="field-label">From storage</span>
      <div className="transfer-freezer-sheet__bag-grid bottle-feed-selected-bags__grid">
        {deductions.map((d) => {
          const lot = byId.get(d.lotId)
          if (!lot) return null
          const usedLabel = formatVolumeOz(d.amountOz) || String(d.amountOz)
          return (
            <MilkBagChip
              key={d.lotId}
              lot={lot}
              variant="transfer"
              usedOz={d.amountOz}
              label={`${usedLabel} oz from bag stored ${lot.storage}`}
            />
          )
        })}
      </div>
    </div>
  )
}
