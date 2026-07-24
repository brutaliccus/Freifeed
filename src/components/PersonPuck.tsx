import { User } from 'lucide-react'
import { BabyAvatar } from './BabyAvatar'
import type { Baby, HouseholdMember } from '../types'
import type { NoteSubject } from '../lib/noteSubjects'

interface PersonPuckProps {
  subject: NoteSubject
  babies: Baby[]
  members: HouseholdMember[]
  size?: 'lg'
  selected?: boolean
  onClick?: () => void
}

function memberInitials(member: HouseholdMember): string {
  const name = (member.displayName ?? member.email ?? '?').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function PersonPuck({ subject, babies, members, size = 'lg', selected, onClick }: PersonPuckProps) {
  if (subject.kind === 'baby') {
    const babyId = subject.id.slice(5)
    const baby = babies.find((b) => b.id === babyId) ?? babyId
    return (
      <BabyAvatar
        baby={baby}
        size={size}
        showName={false}
        selected={selected}
        onClick={onClick}
      />
    )
  }

  const uid = subject.id.startsWith('member:') ? subject.id.slice(7) : ''
  const member = members.find((m) => m.uid === uid)
  const initials = member ? memberInitials(member) : '?'

  const className = [
    'person-puck',
    `person-puck--${size}`,
    selected ? 'person-puck--selected' : '',
    onClick ? 'person-puck--clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <span className="person-puck__ring" aria-hidden>
      <span className="person-puck__initials">{initials}</span>
      {!initials && <User size={28} />}
    </span>
  )

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={subject.label}>
        {inner}
      </button>
    )
  }
  return <div className={className}>{inner}</div>
}
