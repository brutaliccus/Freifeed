import { useState } from 'react'
import { Plus, SkipForward } from 'lucide-react'
import { addBaby, skipBabyOnboarding } from '../lib/household'

interface BabyOnboardingProps {
  householdId: string
  uid: string
  existingNames: string[]
  onComplete: () => void | Promise<void>
}

export function BabyOnboarding({ householdId, uid, existingNames, onComplete }: BabyOnboardingProps) {
  const [names, setNames] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addName = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setNames((prev) => [...prev, trimmed.slice(0, 40)])
    setInput('')
  }

  const finish = async (skip: boolean) => {
    setSaving(true)
    setError(null)
    try {
      if (skip) {
        await skipBabyOnboarding(uid)
        await onComplete()
        return
      }
      const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()))
      for (const name of names) {
        const key = name.trim().toLowerCase()
        if (!key || existing.has(key)) continue
        await addBaby(householdId, name)
      }
      await skipBabyOnboarding(uid)
      await onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save babies')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <h2>Add your babies</h2>
        <p className="muted">Add any baby names you want to track. You can always edit this later.</p>
        <div className="field">
          <span className="field-label">Baby name</span>
          <div className="inline-row">
            <input
              type="text"
              className="input"
              value={input}
              maxLength={40}
              placeholder="Enter a name"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addName()
                }
              }}
              disabled={saving}
            />
            <button type="button" className="btn btn-secondary" onClick={addName} disabled={saving}>
              <Plus size={16} aria-hidden />
              Add
            </button>
          </div>
        </div>

        {names.length > 0 && (
          <ul className="onboarding-names">
            {names.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void finish(false)}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void finish(true)} disabled={saving}>
          <SkipForward size={16} aria-hidden />
          Skip for now
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  )
}
