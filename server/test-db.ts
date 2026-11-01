import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import fs from 'node:fs'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../database/schema'
import { LocalObjectStorage } from './storage'

export async function createTestDb() {
  const client = new PGlite()
  const drizzleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../drizzle')
  const files = fs.readdirSync(drizzleDir).filter((name) => name.endsWith('.sql')).sort()
  for (const file of files) {
    const migration = readFileSync(path.join(drizzleDir, file), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) {
      await client.exec(statement)
    }
  }
  const db = drizzle(client, { schema })
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inview-media-'))
  const storage = new LocalObjectStorage(mediaRoot)
  return {
    client,
    db,
    storage,
    mediaRoot,
    async close() {
      await client.close()
      fs.rmSync(mediaRoot, { recursive: true, force: true })
    },
  }
}
