import { redact, requestIdFrom, requestPath } from './redact.js'

/** @type {(status: number) => void} */
let recordStatus = () => {}

/**
 * @param {(status: number) => void} fn
 */
export function setStatusRecorder(fn) {
  recordStatus = typeof fn === 'function' ? fn : () => {}
}

export function requestLog() {
  /**
   * @param {{ headers: Record<string, string | string[] | undefined>, originalUrl?: string, url?: string, method?: string }} req
   * @param {{ setHeader: (name: string, value: string) => void, on: (event: string, cb: () => void) => void, statusCode: number }} res
   * @param {() => void} next
   */
  return function requestLogMiddleware(req, res, next) {
    const started = process.hrtime.bigint()
    const requestId = requestIdFrom(req.headers['x-request-id'])
    res.setHeader('x-request-id', requestId)
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6
      recordStatus(res.statusCode)
      const line = {
        time: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : 'info',
        msg: 'request',
        requestId,
        method: req.method,
        path: requestPath(req.originalUrl || req.url || ''),
        status: res.statusCode,
        ms: Math.round(ms),
      }
      process.stdout.write(`${JSON.stringify(line)}\n`)
    })
    next()
  }
}

/**
 * @param {unknown[]} args
 * @returns {string}
 */
function errorText(args) {
  return args
    .map((arg) => {
      if (arg instanceof Error) return arg.message
      if (typeof arg === 'string') return arg
      return ''
    })
    .filter(Boolean)
    .join(' ')
}

export function installProcessLog() {
  const write = console.error.bind(console)
  console.error = (...args) => {
    const text = errorText(args)
    if (!text || text.includes('No route matches URL')) return
    write(
      JSON.stringify({
        time: new Date().toISOString(),
        level: 'error',
        msg: 'error',
        error: redact(text).slice(0, 500),
      }),
    )
  }
}

/**
 * @param {string} level
 * @param {string} msg
 * @param {Record<string, unknown>} [extra]
 */
export function logEvent(level, msg, extra = {}) {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra })}\n`,
  )
}
