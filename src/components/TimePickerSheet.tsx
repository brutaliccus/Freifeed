import { useCallback, useMemo, useRef, useState } from 'react'
import { formatTimeOfDay } from '../lib/medicineSchedule'

export interface TimePickerContext {
  startTime?: string
  stopTime?: string
}

interface TimePickerSheetProps {
  value: string
  title?: string
  context?: TimePickerContext
  onClose: () => void
  onConfirm: (hhmm: string) => void
}

const SIZE = 280
const CX = 140
const CY = 140
const R_LABEL = 98
const R_FACE = 118

type Phase = 'hour' | 'minute'

function parseTime(hhmm: string): { h24: number; m: number } {
  const [hStr, mStr] = hhmm.split(':')
  const h24 = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h24) || !Number.isFinite(m)) return { h24: 8, m: 0 }
  return { h24: Math.min(23, Math.max(0, h24)), m: Math.min(59, Math.max(0, m)) }
}

function toHhmm(h24: number, m: number): string {
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function h24ToHour12(h24: number): { hour12: number; isPm: boolean } {
  const isPm = h24 >= 12
  const raw = h24 % 12
  return { hour12: raw === 0 ? 12 : raw, isPm }
}

function hour12ToH24(hour12: number, isPm: boolean): number {
  if (hour12 === 12) return isPm ? 12 : 0
  return isPm ? hour12 + 12 : hour12
}

function posOnCircle(index: number, total: number, radius: number) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  }
}

function pointerAngleDeg(clientX: number, clientY: number, rect: DOMRect): number {
  const x = clientX - rect.left - CX
  const y = clientY - rect.top - CY
  let deg = (Math.atan2(x, -y) * 180) / Math.PI
  if (deg < 0) deg += 360
  return deg
}

function snapHour12(deg: number): number {
  const snapped = Math.round(deg / 30) % 12
  return snapped === 0 ? 12 : snapped
}

function snapMinute(deg: number): number {
  return Math.round(deg / 6) % 60
}

function handRotationHour(hour12: number): number {
  return (hour12 % 12) * 30
}

function handRotationMinute(m: number): number {
  return m * 6
}

export function TimePickerSheet({
  value,
  title = 'Pick time',
  context,
  onClose,
  onConfirm,
}: TimePickerSheetProps) {
  const initial = useMemo(() => parseTime(value), [value])
  const initial12 = h24ToHour12(initial.h24)

  const [phase, setPhase] = useState<Phase>('hour')
  const [hour12, setHour12] = useState(initial12.hour12)
  const [isPm, setIsPm] = useState(initial12.isPm)
  const [minute, setMinute] = useState(initial.m)
  const [h24, setH24] = useState(initial.h24)

  const faceRef = useRef<SVGSVGElement>(null)
  const draggingRef = useRef(false)

  const preview = formatTimeOfDay(toHhmm(h24, minute))

  const applyHour12 = useCallback(
    (nextHour12: number, nextPm = isPm) => {
      setHour12(nextHour12)
      setIsPm(nextPm)
      const nextH24 = hour12ToH24(nextHour12, nextPm)
      setH24(nextH24)
    },
    [h24, isPm],
  )

  const applyMinute = useCallback((nextMinute: number) => {
    setMinute(nextMinute)
  }, [])

  const pickFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = faceRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const deg = pointerAngleDeg(clientX, clientY, rect)
      if (phase === 'hour') {
        applyHour12(snapHour12(deg))
      } else {
        applyMinute(snapMinute(deg))
      }
    },
    [phase, applyHour12, applyMinute],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    faceRef.current?.setPointerCapture(e.pointerId)
    pickFromPointer(e.clientX, e.clientY)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    pickFromPointer(e.clientX, e.clientY)
  }

  const onPointerUp = () => {
    draggingRef.current = false
  }

  const onFaceClick = (e: React.MouseEvent) => {
    pickFromPointer(e.clientX, e.clientY)
    if (phase === 'hour') setPhase('minute')
  }

  const hourLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const n = i === 0 ? 12 : i
        const { x, y } = posOnCircle(i, 12, R_LABEL)
        return { n, x, y }
      }),
    [],
  )

  const minuteLabels = useMemo(
    () =>
      [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((n, i) => {
        const { x, y } = posOnCircle(i, 12, R_LABEL)
        return { n, x, y }
      }),
    [],
  )

  const handRot = phase === 'hour' ? handRotationHour(hour12) : handRotationMinute(minute)
  const activeValue = phase === 'hour' ? hour12 : minute

  const handleDone = () => {
    if (phase === 'hour') {
      setPhase('minute')
      return
    }
    onConfirm(toHhmm(h24, minute))
  }

  return (
    <div className="modal-overlay picker-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet picker-sheet analog-clock-sheet"
        role="dialog"
        aria-labelledby="time-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="time-picker-title">{title}</h2>
        </header>

        {(context?.startTime || context?.stopTime) && (
          <div className="analog-clock-sheet__context" role="status">
            {context.startTime && (
              <span>
                Start <strong>{formatTimeOfDay(context.startTime)}</strong>
              </span>
            )}
            {context.stopTime && (
              <span>
                Stop <strong>{formatTimeOfDay(context.stopTime)}</strong>
              </span>
            )}
          </div>
        )}

        <p className="picker-sheet__preview analog-clock-sheet__preview">{preview}</p>

        <div className="analog-clock-sheet__phase" aria-live="polite">
          {phase === 'hour' ? 'Select hour' : 'Select minutes'}
        </div>

        <div className="analog-clock-sheet__ampm" role="group" aria-label="AM or PM">
          <button
            type="button"
            className={`analog-clock-sheet__ampm-btn${!isPm ? ' analog-clock-sheet__ampm-btn--active' : ''}`}
            aria-pressed={!isPm}
            onClick={() => applyHour12(hour12, false)}
          >
            AM
          </button>
          <button
            type="button"
            className={`analog-clock-sheet__ampm-btn${isPm ? ' analog-clock-sheet__ampm-btn--active' : ''}`}
            aria-pressed={isPm}
            onClick={() => applyHour12(hour12, true)}
          >
            PM
          </button>
        </div>

        <div className="analog-clock-sheet__face-wrap">
          <svg
            ref={faceRef}
            className="analog-clock-sheet__face"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width={SIZE}
            height={SIZE}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onFaceClick}
            role="slider"
            aria-valuenow={activeValue}
            aria-valuemin={phase === 'hour' ? 1 : 0}
            aria-valuemax={phase === 'hour' ? 12 : 59}
            aria-label={phase === 'hour' ? 'Hour' : 'Minutes'}
          >
            <circle className="analog-clock-sheet__ring" cx={CX} cy={CY} r={R_FACE} />
            {phase === 'hour'
              ? hourLabels.map(({ n, x, y }) => (
                  <text
                    key={n}
                    x={x}
                    y={y}
                    className={`analog-clock-sheet__tick${n === hour12 ? ' analog-clock-sheet__tick--active' : ''}`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {n}
                  </text>
                ))
              : minuteLabels.map(({ n, x, y }) => (
                  <text
                    key={n}
                    x={x}
                    y={y}
                    className={`analog-clock-sheet__tick analog-clock-sheet__tick--minute${
                      Math.abs(n - minute) <= 2 || (n === 0 && minute >= 58)
                        ? ' analog-clock-sheet__tick--active'
                        : ''
                    }`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {String(n).padStart(2, '0')}
                  </text>
                ))}
            <line
              className="analog-clock-sheet__hand"
              x1={CX}
              y1={CY}
              x2={CX}
              y2={CY - (phase === 'hour' ? 68 : 88)}
              transform={`rotate(${handRot} ${CX} ${CY})`}
            />
            <circle className="analog-clock-sheet__hub" cx={CX} cy={CY} r={6} />
            <circle
              className="analog-clock-sheet__knob"
              cx={CX}
              cy={CY - (phase === 'hour' ? 68 : 88)}
              r={10}
              transform={`rotate(${handRot} ${CX} ${CY})`}
            />
          </svg>
        </div>

        <footer className="modal__footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {phase === 'minute' && (
            <button type="button" className="btn btn-ghost" onClick={() => setPhase('hour')}>
              Hour
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={handleDone}>
            {phase === 'hour' ? 'Next' : 'Done'}
          </button>
        </footer>
      </div>
    </div>
  )
}
