import { useCallback, useRef, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import type { MedicineSubject } from '../lib/medicineSubjects'

interface MedicineSubjectTabsProps {
  subjects: MedicineSubject[]
  activeId: string
  counts: Record<string, number>
  watchEnabled: Record<string, boolean>
  onSelect: (id: string) => void
  onToggleWatch: (id: string) => void
  onReorder: (orderedIds: string[]) => void
}

const DRAG_CLICK_THRESHOLD_PX = 6

function reorderIds(ids: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return ids
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0) return ids
  const next = [...ids]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function MedicineSubjectTabs({
  subjects,
  activeId,
  counts,
  watchEnabled,
  onSelect,
  onToggleWatch,
  onReorder,
}: MedicineSubjectTabsProps) {
  const dragIdRef = useRef<string | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const didDragRef = useRef(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const finishDrag = useCallback(() => {
    dragIdRef.current = null
    pointerStartRef.current = null
    setDraggingId(null)
    setDragOverId(null)
  }, [])

  const applyReorder = useCallback(
    (fromId: string, toId: string) => {
      const ids = subjects.map((s) => s.id)
      const next = reorderIds(ids, fromId, toId)
      if (next.join(',') !== ids.join(',')) onReorder(next)
    },
    [subjects, onReorder],
  )

  const updateDragOverFromPoint = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY)
    const item = el?.closest('[data-subject-id]') as HTMLElement | null
    const overId = item?.dataset.subjectId
    if (overId) setDragOverId(overId)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    didDragRef.current = true
    dragIdRef.current = id
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }

  const handleDrop = (e: React.DragEvent, toId: string) => {
    e.preventDefault()
    const fromId = dragIdRef.current ?? e.dataTransfer.getData('text/plain')
    if (fromId) applyReorder(fromId, toId)
    finishDrag()
  }

  const handlePillPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    didDragRef.current = false
    dragIdRef.current = id
    setDraggingId(id)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePillPointerMove = (e: React.PointerEvent) => {
    if (!dragIdRef.current) return
    const start = pointerStartRef.current
    if (start) {
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.hypot(dx, dy) > DRAG_CLICK_THRESHOLD_PX) didDragRef.current = true
    }
    updateDragOverFromPoint(e.clientX, e.clientY)
  }

  const handlePillPointerUp = (e: React.PointerEvent) => {
    const fromId = dragIdRef.current
    const toId = dragOverId
    if (fromId && toId && didDragRef.current) applyReorder(fromId, toId)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    finishDrag()
  }

  const handlePillClick = (id: string) => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    onSelect(id)
  }

  if (subjects.length === 0) return null

  return (
    <div className="medicine-subject-tabs" role="tablist" aria-label="Medicine by person">
      {subjects.map((subject) => {
        const count = counts[subject.id] ?? 0
        const active = subject.id === activeId
        const watching = watchEnabled[subject.id] !== false
        const tabId = `medicine-subject-tab-${subject.id.replace(/[^a-z0-9]+/gi, '-')}`
        const dragging = draggingId === subject.id
        const dragOver = dragOverId === subject.id && draggingId !== subject.id
        return (
          <div
            key={subject.id}
            data-subject-id={subject.id}
            className={`medicine-subject-tabs__item${dragging ? ' medicine-subject-tabs__item--dragging' : ''}${dragOver ? ' medicine-subject-tabs__item--drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, subject.id)}
            onDrop={(e) => handleDrop(e, subject.id)}
          >
            <button
              id={tabId}
              type="button"
              role="tab"
              className={`medicine-subject-tabs__btn soft-glow-control${active ? ' medicine-subject-tabs__btn--active soft-glow-control--on' : ''}`}
              aria-selected={active}
              aria-controls={`medicine-subject-panel-${subject.id.replace(/[^a-z0-9]+/gi, '-')}`}
              aria-label={`${subject.label}, drag to reorder`}
              draggable
              onDragStart={(e) => handleDragStart(e, subject.id)}
              onDragEnd={finishDrag}
              onPointerDown={(e) => handlePillPointerDown(e, subject.id)}
              onPointerMove={handlePillPointerMove}
              onPointerUp={handlePillPointerUp}
              onPointerCancel={handlePillPointerUp}
              onClick={() => handlePillClick(subject.id)}
            >
              {subject.label}
              {count > 0 && <span className="medicine-subject-tabs__count">{count}</span>}
            </button>
            <button
              type="button"
              className={`medicine-subject-tabs__watch soft-glow-control${watching ? '' : ' medicine-subject-tabs__watch--off'}`}
              onClick={() => onToggleWatch(subject.id)}
              aria-label={
                watching
                  ? `Notifications on for ${subject.label}`
                  : `Notifications off for ${subject.label}`
              }
              title={watching ? 'Notifications on' : 'Notifications off'}
            >
              {watching ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
