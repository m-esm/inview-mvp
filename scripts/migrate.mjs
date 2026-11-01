import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const MIGRATION_LOCK = 742001

const sql = postgres(url, { max: 1 })
await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK})`
await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`
await sql`
  CREATE TABLE IF NOT EXISTS inview_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`

const dir = path.join(process.cwd(), 'drizzle')
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort()

for (const file of files) {
  const applied = await sql`SELECT 1 FROM inview_migrations WHERE id = ${file}`
  if (applied.length) {
    console.info(`skip ${file}`)
    continue
  }
  const raw = readFileSync(path.join(dir, file), 'utf8')
  const statements = raw
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter(Boolean)
  await sql.begin(async (tx) => {
    for (const statement of statements) {
      await tx.unsafe(statement)
    }
    await tx`INSERT INTO inview_migrations (id) VALUES (${file})`
  })
  console.info(`apply ${file}`)
}

await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK})`
await sql.end({ timeout: 5 })
console.info('Migrations complete.')
