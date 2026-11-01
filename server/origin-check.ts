import type { RequestHandler } from 'express'

const LEGACY_PATHS = new Set(['/api/pilot', '/api/v1/pilot', '/api/v1/uploads'])

export const originCheck: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    next()
    return
  }
  const origin = req.get('origin')
  if (!origin && LEGACY_PATHS.has(req.path.replace(/\/$/, '')) && req.get('sec-fetch-site')?.toLowerCase() !== 'cross-site') {
    next()
    return
  }
  let expected: string | null = null
  try {
    const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol
    expected = new URL(process.env.PUBLIC_APP_URL || `${proto}://${req.get('host')}`).origin
  } catch {
    expected = null
  }
  if (origin && expected && expected !== 'null' && origin === expected) {
    next()
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  res.status(403).json({ error: 'This request origin is not allowed.' })
}
