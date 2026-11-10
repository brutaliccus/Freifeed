import type { FastifyInstance } from 'fastify'
import { getDb, nowIso, parseJson, toJson, newId } from '../db/db.js'
import { HttpsError } from '../errors.js'
import { assertBabyExists, assertHouseholdMember } from '../household.js'
import { parseBabyId } from '../milk/validation.js'
import { uploadBabyAvatar } from '../photos.js'
import { registerCallable } from './helpers.js'

function normalizeBabyName(raw: unknown, fallback = 'Baby'): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  return (text || fallback).slice(0, 40)
}

function normalizeBabyTrackers(raw: unknown) {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    nursing: o.nursing !== false,
    milk: o.milk !== false,
    diaper: o.diaper !== false,
    medicine: o.medicine !== false,
    notes: o.notes !== false,
    measurements: o.measurements !== false,
  }
}

function normalizeBabySex(raw: unknown): 'male' | 'female' | null {
  if (raw === 'male' || raw === 'female') return raw
  return null
}

function normalizeBirthDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const day = String(raw).trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : String(raw).trim() || null
}

export function registerBabyRoutes(app: FastifyInstance) {
  registerCallable(app, 'getBabies', (uid, body) => {
    const householdId = body.householdId as string
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
    assertHouseholdMember(uid, householdId)
    const rows = getDb()
      .prepare('SELECT * FROM babies WHERE household_id = ?')
      .all(householdId) as Record<string, unknown>[]
    const babies = rows
      .map((data) => ({
        id: String(data.id),
        name: normalizeBabyName(data.name),
        birthDate: normalizeBirthDate(data.birth_date),
        birthWeightLb: (data.birth_weight_lb as number | null) ?? null,
        birthWeightOz: (data.birth_weight_oz as number | null) ?? null,
        birthHeightIn: (data.birth_height_in as number | null) ?? null,
        photoUrl: (data.photo_url as string | null) ?? null,
        borderColorId: (data.border_color_id as string | null) ?? null,
        sex: normalizeBabySex(data.sex),
        trackerVisibility: normalizeBabyTrackers(parseJson(data.tracker_visibility as string, {})),
        showOnHome: data.show_on_home !== 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { babies }
  })

  registerCallable(
    app,
    'uploadBabyAvatar',
    (uid, body) =>
      uploadBabyAvatar({
        uid,
        householdId: body.householdId as string,
        babyId: body.babyId as string,
        imageBase64: body.imageBase64 as string,
        contentType: body.contentType as string | undefined,
      }),
    { collections: () => ['babies'] },
  )

  registerCallable(
    app,
    'updateBaby',
    (uid, body) => {
      const householdId = body.householdId as string
      const babyId = body.babyId as string
      const data = (body.data ?? {}) as Record<string, unknown>
      if (!householdId || !babyId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      assertBabyExists(householdId, babyId)

      const sets: string[] = []
      const vals: unknown[] = []
      if ('name' in data) {
        sets.push('name = ?')
        vals.push(normalizeBabyName(data.name))
      }
      if ('trackerVisibility' in data) {
        sets.push('tracker_visibility = ?')
        vals.push(toJson(normalizeBabyTrackers(data.trackerVisibility)))
      }
      if ('showOnHome' in data) {
        sets.push('show_on_home = ?')
        vals.push(data.showOnHome !== false ? 1 : 0)
      }
      if ('sex' in data) {
        sets.push('sex = ?')
        vals.push(normalizeBabySex(data.sex))
      }
      if ('birthDate' in data) {
        sets.push('birth_date = ?')
        vals.push(normalizeBirthDate(data.birthDate))
      }
      if ('birthWeightLb' in data) {
        sets.push('birth_weight_lb = ?')
        vals.push(data.birthWeightLb ?? null)
      }
      if ('birthWeightOz' in data) {
        sets.push('birth_weight_oz = ?')
        vals.push(data.birthWeightOz ?? null)
      }
      if ('birthHeightIn' in data) {
        sets.push('birth_height_in = ?')
        vals.push(data.birthHeightIn ?? null)
      }
      if ('photoUrl' in data) {
        sets.push('photo_url = ?')
        vals.push(data.photoUrl ?? null)
      }
      if ('borderColorId' in data) {
        sets.push('border_color_id = ?')
        vals.push(data.borderColorId ?? null)
      }
      if (sets.length === 0) return { ok: true }
      getDb()
        .prepare(`UPDATE babies SET ${sets.join(', ')} WHERE household_id = ? AND id = ?`)
        .run(...vals, householdId, babyId)
      return { ok: true }
    },
    { collections: () => ['babies'] },
  )

  registerCallable(
    app,
    'addBaby',
    (uid, body) => {
      const householdId = body.householdId as string
      if (!householdId) throw new HttpsError('invalid-argument', 'householdId required')
      assertHouseholdMember(uid, householdId)
      const babyName = normalizeBabyName(body.name)
      const idBase =
        babyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 24) || 'baby'
      const unique = `${idBase}-${Math.random().toString(36).slice(2, 7)}`
      const babyId = parseBabyId(unique)
      getDb()
        .prepare(
          `INSERT INTO babies (id, household_id, name, birth_date, birth_weight_lb, birth_weight_oz,
            birth_height_in, photo_url, border_color_id, sex, tracker_visibility, show_on_home)
           VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1)`,
        )
        .run(babyId, householdId, babyName, toJson(normalizeBabyTrackers({})))
      return { babyId }
    },
    { collections: () => ['babies'] },
  )

  registerCallable(
    app,
    'deleteBaby',
    (uid, body) => {
      const householdId = body.householdId as string
      const babyId = body.babyId as string
      if (!householdId || !babyId) throw new HttpsError('invalid-argument', 'Missing fields')
      assertHouseholdMember(uid, householdId)
      assertBabyExists(householdId, babyId)
      const db = getDb()
      const count = (
        db.prepare('SELECT COUNT(*) AS c FROM babies WHERE household_id = ?').get(householdId) as {
          c: number
        }
      ).c
      if (count <= 1) {
        throw new HttpsError('failed-precondition', 'You must keep at least one baby')
      }
      const feedingHit = db
        .prepare('SELECT 1 AS ok FROM feedings WHERE household_id=? AND baby_id=? LIMIT 1')
        .get(householdId, babyId)
      const medHit = db
        .prepare(
          `SELECT 1 AS ok FROM medicines WHERE household_id=? AND for_person_id=? LIMIT 1`,
        )
        .get(householdId, `baby:${babyId}`)
      const diaperHit = db
        .prepare('SELECT 1 AS ok FROM diapers WHERE household_id=? AND baby_id=? LIMIT 1')
        .get(householdId, babyId)
      if (feedingHit || medHit || diaperHit) {
        throw new HttpsError(
          'failed-precondition',
          'This baby has feedings, diapers, or medicines. Keep it to preserve history.',
        )
      }
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM babies WHERE household_id = ? AND id = ?').run(householdId, babyId)
        const h = db.prepare('SELECT person_nicknames FROM households WHERE id = ?').get(
          householdId,
        ) as { person_nicknames: string } | undefined
        const nicknames = parseJson<Record<string, string>>(h?.person_nicknames, {})
        if (`baby:${babyId}` in nicknames) {
          delete nicknames[`baby:${babyId}`]
          db.prepare('UPDATE households SET person_nicknames = ? WHERE id = ?').run(
            toJson(nicknames),
            householdId,
          )
        }
      })
      tx()
      return { ok: true }
    },
    { collections: () => ['babies'] },
  )
}

void nowIso
void newId
