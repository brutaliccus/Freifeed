import { format } from 'date-fns'

interface ExportPayload {
  exportedAt: string
  household: { id: string; inviteCode?: string; members?: string[]; ownerUid?: string | null } | null
  babies: Array<{ id: string; name?: string; birthDate?: string | null }>
  feedings: Array<Record<string, unknown>>
  diapers: Array<Record<string, unknown>>
  milkLots: Array<Record<string, unknown>>
  medicines: Array<Record<string, unknown>>
}

function fmt(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : format(d, 'EEE MMM d, yyyy h:mm a')
}

function babyNameMap(babies: ExportPayload['babies']): Map<string, string> {
  return new Map(babies.map((b) => [b.id, b.name ?? b.id]))
}

export function formatExportAsText(data: ExportPayload): string {
  const names = babyNameMap(data.babies)
  const lines: string[] = []

  lines.push('FREIFEED HOUSEHOLD BACKUP')
  lines.push('='.repeat(40))
  lines.push(`Exported: ${fmt(data.exportedAt)}`)
  if (data.household) {
    lines.push(`Household ID: ${data.household.id}`)
    lines.push(`Members: ${data.household.members?.length ?? 0}`)
  }
  lines.push('')

  lines.push('BABIES')
  lines.push('-'.repeat(40))
  if (data.babies.length === 0) {
    lines.push('(none)')
  } else {
    for (const b of data.babies) {
      lines.push(`• ${b.name ?? b.id}${b.birthDate ? ` — born ${b.birthDate}` : ''}`)
    }
  }
  lines.push('')

  lines.push('FEEDINGS')
  lines.push('-'.repeat(40))
  for (const f of data.feedings) {
    const type = String(f.type ?? 'nursing')
    const baby = names.get(String(f.babyId)) ?? String(f.babyId)
    const start = fmt(f.startAt)
    const end = fmt(f.endAt)
    const vol = f.volumeOz != null ? ` — ${f.volumeOz} oz` : ''
    const side = f.side ? ` (${f.side})` : ''
    lines.push(`• [${type}] ${baby}${side}: ${start}${end !== '—' ? ` → ${end}` : ''}${vol}`)
    if (f.note) lines.push(`  Note: ${f.note}`)
  }
  if (data.feedings.length === 0) lines.push('(none)')
  lines.push('')

  lines.push('DIAPERS')
  lines.push('-'.repeat(40))
  for (const d of data.diapers) {
    const baby = names.get(String(d.babyId)) ?? String(d.babyId)
    lines.push(`• ${baby} — ${String(d.kind ?? 'change')} at ${fmt(d.changedAt)}`)
    if (d.note) lines.push(`  Note: ${d.note}`)
  }
  if (data.diapers.length === 0) lines.push('(none)')
  lines.push('')

  lines.push('MILK STORAGE')
  lines.push('-'.repeat(40))
  for (const m of data.milkLots) {
    lines.push(
      `• ${String(m.storage ?? 'fridge')} — ${m.remainingOz}/${m.volumeOz} oz remaining — stored ${fmt(m.storedAt)}`,
    )
    if (m.note) lines.push(`  Note: ${m.note}`)
  }
  if (data.milkLots.length === 0) lines.push('(none)')
  lines.push('')

  lines.push('MEDICINES')
  lines.push('-'.repeat(40))
  for (const med of data.medicines) {
    const active = med.active === false ? ' (inactive)' : ''
    lines.push(`• ${med.name}${active} — ${med.dosage}`)
    lines.push(`  Started ${fmt(med.startedAt)}`)
    if (med.lastTakenAt) lines.push(`  Last taken ${fmt(med.lastTakenAt)}`)
  }
  if (data.medicines.length === 0) lines.push('(none)')
  lines.push('')
  lines.push('End of backup')

  return lines.join('\n')
}

export async function downloadTextFile(filename: string, text: string): Promise<void> {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })

  if (typeof navigator.share === 'function' && typeof File !== 'undefined') {
    try {
      const file = new File([blob], filename, { type: 'text/plain' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
        return
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      /* fall through to download */
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export type { ExportPayload }
