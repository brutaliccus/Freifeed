import { useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { apiRotateHouseholdInviteCode, formatApiError } from '../lib/api'
import type { Household, MemberRole } from '../types'

interface HouseholdInviteCodeSectionProps {
  household: Household
  householdId: string
  currentUid: string | null
  onRefresh?: () => void
}

function roleOf(household: Household, currentUid: string | null): MemberRole {
  if (currentUid && household.ownerUid === currentUid) return 'owner'
  return (currentUid && household.memberRoles[currentUid]) || 'member'
}

export function HouseholdInviteCodeSection({
  household,
  householdId,
  currentUid,
  onRefresh,
}: HouseholdInviteCodeSectionProps) {
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myRole = roleOf(household, currentUid)
  const canRefresh = myRole === 'owner' || myRole === 'admin'

  const copyCode = async () => {
    if (!household.inviteCode) return
    await navigator.clipboard.writeText(household.inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const refreshCode = async () => {
    setError(null)
    setRefreshing(true)
    try {
      await apiRotateHouseholdInviteCode(householdId)
      onRefresh?.()
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section className="profile-section profile-section--household-code">
      <h2>Join code</h2>
      <p className="muted">Share this code so your partner can join your household.</p>
      <div className="invite-code-card">
        <button type="button" className="invite-code-btn" onClick={() => void copyCode()}>
          <span className="invite-code">{household.inviteCode}</span>
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
        </button>
        {canRefresh && (
          <button
            type="button"
            className="btn btn-secondary invite-code-refresh"
            disabled={refreshing}
            onClick={() => void refreshCode()}
          >
            <RefreshCw size={16} aria-hidden className={refreshing ? 'spin' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh code'}
          </button>
        )}
      </div>
      <p className="muted invite-code-note">Codes refresh automatically every 24 hours.</p>
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}
