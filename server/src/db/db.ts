import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from '../config.js'
import { migrate } from './migrate.js'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  mkdirSync(dirname(config.dbPath), { recursive: true })
  db = new Database(config.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
}

/** Open an isolated in-memory DB (tests). */
export function openMemoryDb(): Database.Database {
  const mem = new Database(':memory:')
  mem.pragma('journal_mode = WAL')
  mem.pragma('foreign_keys = ON')
  mem.pragma('busy_timeout = 5000')
  migrate(mem)
  return mem
}

export function setDbForTests(testDb: Database.Database | null) {
  db = testDb
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let out = ''
  for (let i = 0; i < 20; i++) out += alphabet[bytes[i]! % alphabet.length]
  return out
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}
