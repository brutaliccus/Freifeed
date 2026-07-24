/** CSS class suffix for timeline grid column layout (corner + data columns). */
export function timelineDataColumnClass(dataColumnCount: number): string {
  if (dataColumnCount <= 1) return 'timeline-layout--data-1'
  if (dataColumnCount === 2) return 'timeline-layout--data-2'
  if (dataColumnCount === 3) return 'timeline-layout--data-3'
  return 'timeline-layout--data-4'
}
