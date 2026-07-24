export function parseLbOz(lb: string, oz: string): { lb: number | null; oz: number | null } {
  const lbNum = lb.trim() === '' ? null : Number(lb)
  const ozNum = oz.trim() === '' ? null : Number(oz)
  if (lbNum !== null && (Number.isNaN(lbNum) || lbNum < 0)) return { lb: null, oz: null }
  if (ozNum !== null && (Number.isNaN(ozNum) || ozNum < 0 || ozNum >= 16)) return { lb: null, oz: null }
  return { lb: lbNum, oz: ozNum }
}

export function formatLbOz(lb: number | null, oz: number | null): string {
  if (lb == null && oz == null) return ''
  const parts: string[] = []
  if (lb != null) parts.push(`${lb} lb`)
  if (oz != null) parts.push(`${oz} oz`)
  return parts.join(' ')
}

export function formatBirthHeightIn(inches: number | null): string {
  if (inches == null) return ''
  const rounded = Math.round(inches * 100) / 100
  return `${rounded} in`
}
