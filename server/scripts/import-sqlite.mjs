#!/usr/bin/env node
/**
 * Import a Firebase export dump into SQLite, preserving document IDs.
 *
 * Usage:
 *   node scripts/import-sqlite.mjs [dumpDir] [dbPath]
 * Defaults: ../../export  ./data/freifeed.sqlite
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importDumpToSqlite, printVerification } from './import-lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dumpDir = resolve(process.argv[2] ?? join(__dirname, '../../export'))
const dbPath = resolve(process.argv[3] ?? join(__dirname, '../data/freifeed.sqlite'))

if (!existsSync(join(dumpDir, 'dump.json'))) {
  console.error(`No dump.json in ${dumpDir}`)
  process.exit(1)
}

const manifestPath = join(dumpDir, 'manifest.json')
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null

console.log(`Importing ${dumpDir} → ${dbPath}`)
const counts = importDumpToSqlite(dumpDir, dbPath)
printVerification(counts, manifest)
console.log('Done.')
