import { useEffect, useState } from 'react'

export function useCountdown(targetMs: number | null, tickMs = 1000): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (targetMs == null) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), tickMs)
    return () => window.clearInterval(id)
  }, [targetMs, tickMs])

  if (targetMs == null) return null
  return Math.max(0, targetMs - now)
}
