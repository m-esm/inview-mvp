const WINDOW_MS = 10 * 60 * 1000

type Bucket = { count: number; resetAt: number }

const hits = new Map<string, Bucket>()

function limit(): number {
  const parsed = Number(process.env.AUTH_FAIL_LIMIT || 8)
  if (!Number.isFinite(parsed) || parsed < 1) return 8
  return Math.floor(parsed)
}

export function resetAuthFailures() {
  hits.clear()
}

export function isAuthLimited(key: string, now = Date.now()): boolean {
  const row = hits.get(key)
  if (!row || now >= row.resetAt) return false
  return row.count >= limit()
}

export function registerAuthFailure(key: string, now = Date.now()) {
  const row = hits.get(key)
  if (!row || now >= row.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  row.count += 1
}

export function clearAuthFailures(key: string) {
  hits.delete(key)
}
