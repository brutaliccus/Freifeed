import { useEffect, useState } from 'react'

/** Re-render once per second while `active` (live timers). */
export function useSecondTick(active: boolean): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [active])
}
