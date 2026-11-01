import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'

export const READY_TIMEOUT_MS = 800

export interface ReadyReply {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void }
}

export async function pingDatabase(db: AppDatabase): Promise<void> {
  await db.execute(sql`select 1`)
}

export async function runChecks(
  checks: Record<string, () => Promise<void>>,
  timeoutMs = READY_TIMEOUT_MS,
): Promise<{ status: number; body: { ok: boolean; checks: Record<string, 'ok' | 'down'> } }> {
  const names = Object.keys(checks)
  const results = await Promise.all(
    names.map(async (name) => [name, await settle(checks[name], timeoutMs)] as const),
  )
  const body = {
    ok: results.every(([, status]) => status === 'ok'),
    checks: Object.fromEntries(results) as Record<string, 'ok' | 'down'>,
  }
  return { status: body.ok ? 200 : 503, body }
}

export async function sendReady(
  res: ReadyReply,
  deps: { draining: boolean; db: () => Promise<void>; storage: () => Promise<void> },
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (deps.draining) {
    res.status(503).json({ ok: false, draining: true })
    return
  }
  const result = await runChecks(
    { db: deps.db, storage: deps.storage },
    READY_TIMEOUT_MS,
  )
  res.status(result.status).json(result.body)
}

async function settle(fn: () => Promise<void>, timeoutMs: number): Promise<'ok' | 'down'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
      }),
    ])
    return 'ok'
  } catch {
    return 'down'
  } finally {
    if (timer) clearTimeout(timer)
  }
}
