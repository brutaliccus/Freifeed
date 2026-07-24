import { memberSubjectId } from './medicineSubjects'
import type { HouseholdMember } from '../types'

function memberFallbackLabel(member: HouseholdMember): string {
  const name = member.displayName?.trim()
  if (name) return name
  const email = member.email?.trim()
  if (email) {
    const local = email.split('@')[0]
    if (local) return local
  }
  return 'Household member'
}

/** Primary label for a household member row. */
export function householdMemberLabel(
  member: HouseholdMember,
  currentUid: string | null,
  personNicknames?: Record<string, string>,
): string {
  if (member.uid === currentUid) return 'You'
  const nick = personNicknames?.[memberSubjectId(member.uid)]?.trim()
  if (nick) return nick
  return memberFallbackLabel(member)
}

/** Full name / email for subtitle when a nickname is shown. */
export function householdMemberLegalLabel(member: HouseholdMember): string {
  return memberFallbackLabel(member)
}

/** Secondary line (email), when different from the primary label. */
export function householdMemberSubtitle(member: HouseholdMember): string | null {
  const email = member.email?.trim()
  if (!email) return null
  const name = member.displayName?.trim()
  if (name && name.toLowerCase() !== email.toLowerCase()) return email
  if (!name) return null
  return null
}
