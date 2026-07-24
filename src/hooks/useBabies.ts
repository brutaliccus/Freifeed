import { useEffect, useState, useCallback } from 'react'
import { getBabies } from '../lib/household'
import { formatApiError } from '../lib/api'
import type { Baby } from '../types'
import { useRefreshGuard } from './useRefreshGuard'

export function useBabies(householdId: string | null) {
  const [babies, setBabies] = useState<Baby[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshGuard = useRefreshGuard()

  const refresh = useCallback(async () => {
    if (!householdId) {
      setBabies([])
      setLoading(false)
      setError(null)
      return
    }
    const token = refreshGuard.begin()
    setLoading(true)
    try {
      const data = await getBabies(householdId)
      if (!refreshGuard.isLatest(token)) return
      setBabies(data)
      setError(null)
    } catch (err) {
      if (!refreshGuard.isLatest(token)) return
      setError(formatApiError(err))
    } finally {
      if (refreshGuard.isLatest(token)) setLoading(false)
    }
  }, [householdId, refreshGuard])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { babies, loading, error, refresh }
}
