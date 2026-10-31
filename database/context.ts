import { AsyncLocalStorage } from 'node:async_hooks'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from './schema'

export type AppDatabase = PostgresJsDatabase<typeof schema>

export const DatabaseContext = new AsyncLocalStorage<AppDatabase>()

export function database(): AppDatabase {
  const db = DatabaseContext.getStore()
  if (!db) throw new Error('DatabaseContext is not set.')
  return db
}
