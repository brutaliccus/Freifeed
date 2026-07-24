import { useEffect, useState } from 'react'
import { DoorOpen } from 'lucide-react'
import {
  apiLeaveHousehold,
  apiRemoveHouseholdMember,
  apiSetHouseholdMemberRole,
  apiTransferHouseholdOwnership,
  formatApiError,
} from '../lib/api'
import { setPersonNickname, setMemberShowOnHome } from '../lib/household'
import { memberSubjectId } from '../lib/medicineSubjects'
import {
  householdMemberLabel,
  householdMemberLegalLabel,
  householdMemberSubtitle,
} from '../lib/householdMembers'
import type { Household, HouseholdMember, MemberRole } from '../types'

interface HouseholdManagementPanelProps {
  household: Household
  householdId: string
  currentUid: string | null
  onRefresh: () => void
  onLeftHousehold: () => void
}

function roleLabel(role: MemberRole): string {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  return 'Member'
}

function roleOf(household: Household, uid: string): MemberRole {
  if (uid === household.ownerUid) return 'owner'
  return household.memberRoles[uid] ?? 'member'
}

function HouseholdMemberRow({
  member,
  household,
  householdId,
  currentUid,
  myRole,
  busy,
  onSaved,
  onRun,
}: {
  member: HouseholdMember
  household: Household
  householdId: string
  currentUid: string | null
  myRole: MemberRole
  busy: string | null
  onSaved: () => void
  onRun: (key: string, fn: () => Promise<void>) => void
}) {
  const personId = memberSubjectId(member.uid)
  const savedNick = household.personNicknames[personId] ?? ''
  const [nickname, setNickname] = useState(savedNick)
  const [saving, setSaving] = useState(false)
  const [showOnHome, setShowOnHome] = useState(
    household.memberShowOnHome?.[member.uid] === true,
  )
  const [showOnHomeBusy, setShowOnHomeBusy] = useState(false)

  useEffect(() => {
    setNickname(savedNick)
  }, [savedNick])

  useEffect(() => {
    setShowOnHome(household.memberShowOnHome?.[member.uid] === true)
  }, [household.memberShowOnHome, member.uid])

  const role = roleOf(household, member.uid)
  const isSelf = member.uid === currentUid
  const label = householdMemberLabel(member, currentUid, household.personNicknames)
  const hasNick = member.uid !== currentUid && !!household.personNicknames[personId]?.trim()
  const subtitle = hasNick ? householdMemberLegalLabel(member) : householdMemberSubtitle(member)

  const saveNickname = async () => {
    const trimmed = nickname.trim()
    if (trimmed === savedNick.trim()) return
    setSaving(true)
    try {
      await setPersonNickname(householdId, personId, trimmed)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const toggleShowOnHome = async () => {
    const next = !showOnHome
    setShowOnHomeBusy(true)
    try {
      await setMemberShowOnHome(householdId, member.uid, next)
      setShowOnHome(next)
      onSaved()
    } finally {
      setShowOnHomeBusy(false)
    }
  }

  return (
    <li className="household-members__item">
      <div className="household-members__header">
        <span className="household-members__name">{label}</span>
        <span className="household-members__role muted">{roleLabel(role)}</span>
      </div>
      {subtitle && <span className="household-members__id muted">{subtitle}</span>}
      <label className="household-members__nickname-label muted">
        Nickname
        <input
          type="text"
          className="input household-members__nickname"
          value={nickname}
          maxLength={40}
          placeholder={householdMemberLegalLabel(member)}
          disabled={saving}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={() => void saveNickname()}
        />
      </label>

      <label className="household-members__show-home">
        <input
          type="checkbox"
          checked={showOnHome}
          disabled={showOnHomeBusy}
          onChange={() => void toggleShowOnHome()}
        />
        <span>Show on home screen</span>
      </label>

      {myRole === 'owner' && !isSelf && role !== 'owner' && (
        <div className="household-admin-list__actions">
          {role === 'member' ? (
            <button
              type="button"
              className="btn btn-secondary btn--compact"
              disabled={!!busy}
              onClick={() =>
                void onRun(`promote-${member.uid}`, () =>
                  apiSetHouseholdMemberRole(householdId, member.uid, 'admin'),
                )
              }
            >
              Make admin
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn--compact"
              disabled={!!busy}
              onClick={() =>
                void onRun(`demote-${member.uid}`, () =>
                  apiSetHouseholdMemberRole(householdId, member.uid, 'member'),
                )
              }
            >
              Remove admin
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn--compact"
            disabled={!!busy}
            onClick={() => {
              if (!window.confirm(`Remove ${householdMemberLegalLabel(member)} from the household?`)) return
              void onRun(`remove-${member.uid}`, () =>
                apiRemoveHouseholdMember(householdId, member.uid),
              )
            }}
          >
            Remove
          </button>
          <button
            type="button"
            className="btn btn-secondary btn--compact"
            disabled={!!busy}
            onClick={() => {
              if (
                !window.confirm(
                  `Transfer ownership to ${householdMemberLegalLabel(member)}? You will become an admin.`,
                )
              )
                return
              void onRun(`transfer-${member.uid}`, () =>
                apiTransferHouseholdOwnership(householdId, member.uid),
              )
            }}
          >
            Make owner
          </button>
        </div>
      )}
      {myRole === 'admin' && !isSelf && role === 'member' && (
        <button
          type="button"
          className="btn btn-secondary btn--compact"
          disabled={!!busy}
          onClick={() => {
            if (!window.confirm(`Remove ${householdMemberLegalLabel(member)}?`)) return
            void onRun(`remove-${member.uid}`, () =>
              apiRemoveHouseholdMember(householdId, member.uid),
            )
          }}
        >
          Remove
        </button>
      )}
    </li>
  )
}

export function HouseholdManagementPanel({
  household,
  householdId,
  currentUid,
  onRefresh,
  onLeftHousehold,
}: HouseholdManagementPanelProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const myRole: MemberRole =
    currentUid && household.ownerUid === currentUid
      ? 'owner'
      : (currentUid && household.memberRoles[currentUid]) || 'member'

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
      onRefresh()
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setBusy(null)
    }
  }

  const handleLeave = () => {
    if (!window.confirm('Leave this household? You will lose access to shared data.')) return
    void run('leave', async () => {
      await apiLeaveHousehold(householdId)
      onLeftHousehold()
    })
  }

  return (
    <section className="profile-section profile-section--household-admin household-management-card">
      <h2>Household</h2>
      <p className="muted">
        {household.memberProfiles.length} people · your role: {roleLabel(myRole)}. Nicknames show on
        the Medicines tab instead of full names.
      </p>

      <ul className="household-members">
        {household.memberProfiles.map((member) => (
          <HouseholdMemberRow
            key={member.uid}
            member={member}
            household={household}
            householdId={householdId}
            currentUid={currentUid}
            myRole={myRole}
            busy={busy}
            onSaved={onRefresh}
            onRun={run}
          />
        ))}
      </ul>

      <button
        type="button"
        className="icon-btn household-management-leave"
        disabled={!!busy}
        aria-label="Leave household"
        title="Leave household"
        onClick={handleLeave}
      >
        <DoorOpen size={20} aria-hidden />
      </button>

      {error && <p className="error-text">{error}</p>}
    </section>
  )
}
