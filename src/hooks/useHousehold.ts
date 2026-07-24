import { useCallback, useEffect, useState } from 'react'
import { getHousehold } from '../lib/household'
import type { Household } from '../types'

export function useHousehold(householdId: string | null) {
  const [household, setHousehold] = useState<Household | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => {
    setRevision((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!householdId) {
      setHousehold(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getHousehold(householdId).then((h) => {
      if (!cancelled) {
        setHousehold(h)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [householdId, revision])

  return { household, loading, refresh }
}
