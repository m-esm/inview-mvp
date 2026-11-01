import type { AppDatabase } from '../database/context'
import { auditLogs } from '../database/schema'

const SECRET_KEYS = new Set(['password', 'token', 'code', 'access_code', 'phone'])

export function redactSummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSummary)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEYS.has(key.toLowerCase()))
        .map(([key, item]) => [key, redactSummary(item)]),
    )
  }
  return value
}

export async function writeAudit(
  db: Pick<AppDatabase, 'insert'>,
  input: {
    actorUserId?: string | null
    galleryId?: string | null
    action: string
    targetType: string
    targetId: string
    summary?: Record<string, unknown>
  },
) {
  await db.insert(auditLogs).values({
    ...input,
    summary: redactSummary(input.summary ?? {}) as Record<string, unknown>,
  })
}
