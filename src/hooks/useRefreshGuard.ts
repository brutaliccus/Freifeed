import { useRef } from 'react'

/** Ignore stale fetch errors when a newer refresh is in flight or finished. */
export function useRefreshGuard() {
  const seqRef = useRef(0)
  const apiRef = useRef({
    begin: () => ++seqRef.current,
    isLatest: (token: number) => token === seqRef.current,
  })
  return apiRef.current
}
