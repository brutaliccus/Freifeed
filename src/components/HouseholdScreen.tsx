import { useState } from 'react'
import { Home, Users } from 'lucide-react'
import { createHousehold, joinHousehold } from '../lib/household'

interface HouseholdScreenProps {
  uid: string
  onJoined: () => void
}

export function HouseholdScreen({ uid, onJoined }: HouseholdScreenProps) {
  const [mode, setMode] = useState<'choose' | 'join'>('choose')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      await createHousehold(uid)
      onJoined()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create household'
      setError(msg.includes('permission') ? 'Permission denied — try again in a moment.' : msg)
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    try {
      await joinHousehold(uid, code)
      onJoined()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join household')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'join') {
    return (
      <div className="auth-screen">
        <div className="auth-screen__panel">
          <h2 className="auth-screen__title">Join household</h2>
          <p className="muted">Enter the invite code from your partner.</p>
          <input
            className="input input--code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button type="button" className="btn btn-primary" onClick={handleJoin} disabled={loading || !code.trim()}>
            Join
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('choose')} disabled={loading}>
            Back
          </button>
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen__panel">
        <h2 className="auth-screen__title">Your household</h2>
        <p className="muted">Create a new household or join one to share feeds with your partner.</p>
        <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={loading}>
          <Home size={20} aria-hidden />
          Create household
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setMode('join')} disabled={loading}>
          <Users size={20} aria-hidden />
          Join with code
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  )
}
