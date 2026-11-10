import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config } from './config.js'
import { getDb, nowIso } from './db/db.js'
import { HttpsError } from './errors.js'
import { assertBabyExists, assertHouseholdMember } from './household.js'

export function avatarPath(householdId: string, babyId: string): string {
  return join(config.dataDir, 'households', householdId, 'babies', babyId, 'avatar.jpg')
}

export function avatarPublicUrl(householdId: string, babyId: string): string {
  return `${config.publicBaseUrl}/api/photos/households/${householdId}/babies/${babyId}/avatar?v=${Date.now()}`
}

export function uploadBabyAvatar(opts: {
  uid: string
  householdId: string
  babyId: string
  imageBase64: string
  contentType?: string
}): { photoUrl: string } {
  const { uid, householdId, babyId, imageBase64, contentType } = opts
  if (!householdId || !babyId || !imageBase64) {
    throw new HttpsError('invalid-argument', 'householdId, babyId, and imageBase64 required')
  }
  assertHouseholdMember(uid, householdId)
  assertBabyExists(householdId, babyId)

  const ct = contentType?.trim() || 'image/jpeg'
  if (!ct.startsWith('image/')) {
    throw new HttpsError('invalid-argument', 'File must be an image')
  }

  const buffer = Buffer.from(imageBase64, 'base64')
  if (buffer.length === 0) throw new HttpsError('invalid-argument', 'Empty image')
  if (buffer.length > 5 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'Image too large (max 5 MB)')
  }

  const path = avatarPath(householdId, babyId)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buffer)

  const photoUrl = avatarPublicUrl(householdId, babyId)
  getDb()
    .prepare('UPDATE babies SET photo_url = ? WHERE household_id = ? AND id = ?')
    .run(photoUrl, householdId, babyId)

  return { photoUrl }
}

export function readBabyAvatar(householdId: string, babyId: string): Buffer {
  const path = avatarPath(householdId, babyId)
  if (!existsSync(path)) throw new HttpsError('not-found', 'Avatar not found')
  return readFileSync(path)
}

export function touchBabyPhotoUrl(householdId: string, babyId: string) {
  const photoUrl = avatarPublicUrl(householdId, babyId)
  getDb()
    .prepare('UPDATE babies SET photo_url = ? WHERE household_id = ? AND id = ?')
    .run(photoUrl, householdId, babyId)
  return photoUrl
}

void nowIso
