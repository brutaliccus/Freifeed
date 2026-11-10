import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function migrate(db: Database.Database): void {
  const schemaPath = join(__dirname, 'schema.sql')
  const sql = readFileSync(schemaPath, 'utf8')
  db.exec(sql)
  const row = db.prepare('SELECT id FROM schema_migrations WHERE id = 1').get() as
    | { id: number }
    | undefined
  if (!row) {
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (1, ?)').run(
      new Date().toISOString(),
    )
  }
}
