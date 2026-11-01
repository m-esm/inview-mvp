import { randomUUID } from 'node:crypto'

const PHONE = /(?:\+98|0098|0)9\d{9}/g
const SECRET_FIELD =
  /((?:access[_-]?code|password|otp|phone|token|secret)["']?\s*[:=]\s*["']?)[^"',\s}&]+/gi

/**
 * @param {string} value
 * @returns {string}
 */
export function redact(value) {
  return String(value).replace(SECRET_FIELD, '$1[redacted]').replace(PHONE, '[redacted]')
}

/**
 * @param {string} url
 * @returns {string}
 */
export function requestPath(url) {
  const raw = String(url || '')
  const query = raw.indexOf('?')
  return redact(query === -1 ? raw : raw.slice(0, query))
    .replace(/(\/api\/v1\/invites\/|\/staff\/invite\/)[^/]+/gi, '$1[redacted]')
}

/**
 * @param {string | string[] | undefined} header
 * @returns {string}
 */
export function requestIdFrom(header) {
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value === 'string' && /^[A-Za-z0-9._-]{8,80}$/.test(value)) return value
  return randomUUID()
}
