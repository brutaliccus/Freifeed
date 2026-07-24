import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { InAppBanner } from './InAppBanner'
import {
  acknowledgeInAppDueBanner,
  formatMedicineNotificationBody,
  shouldShowInAppDueBanner,
} from '../lib/medicineSchedule'
import type { Medicine } from '../types'

interface MedicineDueBannerProps {
  medicines: Medicine[]
  onDismiss: () => void
  onOpenMedicines: () => void
  onMarkTaken: (medicineId: string) => void
}

export function MedicineDueBanner({
  medicines,
  onDismiss,
  onOpenMedicines,
  onMarkTaken,
}: MedicineDueBannerProps) {
  const due = useMemo(() => medicines.filter((m) => shouldShowInAppDueBanner(m)), [medicines])
  const dismissedRef = useRef(false)
  const onDismissRef = useRef(onDismiss)
  const medicinesRef = useRef(medicines)
  onDismissRef.current = onDismiss
  medicinesRef.current = medicines

  const dueKey = due.map((m) => m.id).join(',')

  useEffect(() => {
    dismissedRef.current = false
  }, [dueKey])

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    const toAck = medicinesRef.current.filter((m) => shouldShowInAppDueBanner(m))
    acknowledgeInAppDueBanner(toAck)
    onDismissRef.current()
  }, [dueKey])

  if (due.length === 0) return null

  return (
    <InAppBanner
      bannerKey={dueKey}
      onDismiss={dismiss}
      className="in-app-banner in-app-banner--medicine"
      style={{ zIndex: 400 }}
      role="alert"
      ariaLabel="Medicine due. Swipe right to dismiss."
    >
      <div className="in-app-banner__header">
        <AlertCircle size={20} aria-hidden />
        <strong>Medicine due</strong>
        <span className="in-app-banner__hint muted">Swipe right to dismiss</span>
      </div>
      <ul className="medicine-due-banner__list">
        {due.map((m) => (
          <li key={m.id} className="medicine-due-banner__item">
            <button type="button" className="medicine-due-banner__name" onClick={onOpenMedicines}>
              {m.name}
            </button>
            <span className="medicine-due-banner__dose muted">
              {formatMedicineNotificationBody(m.totalPills, m.dosage)}
            </span>
            <button
              type="button"
              className="btn btn-primary medicine-due-banner__taken"
              onClick={() => onMarkTaken(m.id)}
            >
              <Check size={14} aria-hidden /> Took it
            </button>
          </li>
        ))}
      </ul>
    </InAppBanner>
  )
}
