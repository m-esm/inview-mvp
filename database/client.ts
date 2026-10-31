import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import type { AppDatabase } from './context'

let cached: { sql: ReturnType<typeof postgres>; db: AppDatabase } | null = null

export function createDatabase(databaseUrl: string): AppDatabase {
  if (cached) return cached.db
  const sql = postgres(databaseUrl, { max: 10 })
  const db = drizzle(sql, { schema })
  cached = { sql, db }
  return db
}

export async function closeDatabase() {
  if (!cached) return
  await cached.sql.end({ timeout: 5 })
  cached = null
}
