import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'

const KEEP = 48 // ~2 days of hourly backups

export function runSqliteBackup(): string | null {
  if (!existsSync(config.dbPath)) return null
  const dir = join(config.dataDir, 'backups')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(dir, `freifeed-${stamp}.sqlite`)
  copyFileSync(config.dbPath, dest)

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)

  for (const old of files.slice(KEEP)) {
    try {
      unlinkSync(join(dir, old.f))
    } catch {
      /* ignore */
    }
  }
  return dest
}

export function startHourlyBackups() {
  runSqliteBackup()
  const hourMs = 60 * 60 * 1000
  setInterval(() => {
    try {
      runSqliteBackup()
    } catch (err) {
      console.error('backup failed', err)
    }
  }, hourMs).unref()
}
