export const BABY_IDS = ['ingrid', 'willow'] as const
export type BabyId = string

export const BABY_NAMES: Record<BabyId, string> = {
  ingrid: 'Ingrid',
  willow: 'Willow',
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return code
}
