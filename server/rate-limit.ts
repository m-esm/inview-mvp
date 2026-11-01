import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { rateLimits } from '../database/schema'
import { sha256, verifySecret } from './crypto'
import {
  ensureOGalleryTenant,
  GALLERY_SLUG_PATTERN,
  publishGalleryRecordForSession,
  readStaffReportForSession,
} from './gallery-record'
import { gallerySlugOf, handlePilotApi, handleStaffApi } from './pilot-api'
import { signInWithAccessCode } from './staff-session'
import type { ObjectStorage } from './storage'

type Db = AppDatabase

const GALLERY = 'o-gallery'
const IP_TEXT = /^[0-9A-Fa-f:.]+$/

const LIMIT_DEFAULTS = {
  accessFailIpMax: 8,
  accessFailIpWindowSec: 900,
  accessFailGalleryMax: 100,
  accessFailGalleryWindowSec: 900,
  accessAcceptIpMax: 120,
  accessAcceptIpWindowSec: 900,
  accessAcceptGalleryMax: 300,
  accessAcceptGalleryWindowSec: 900,
  visitVisitorMax: 40,
  visitVisitorWindowSec: 600,
  visitIpMax: 600,
  visitIpWindowSec: 600,
  leadVisitorMax: 5,
  leadVisitorWindowSec: 3600,
  leadIpMax: 40,
  leadIpWindowSec: 3600,
  uploadGalleryMax: 80,
  uploadGalleryWindowSec: 3600,
} as const

export type RateLimitConfig = {
  [K in keyof typeof LIMIT_DEFAULTS]: number
} & { ipSalt: string }

export type ApiResult = {
  status: number
  body: unknown
  retryAfterSeconds?: number
}

type BucketOutcome = { allowed: boolean; retryAfterSeconds: number }

let processSalt: string | null = null
let warnedMissingSalt = false

// Cloudflare sets this header. Do not read X-Forwarded-For. The client can set that header.
export function clientIpFrom(cfHeader?: string | null, socketIp?: string | null): string {
  const header = typeof cfHeader === 'string' ? cfHeader.trim() : ''
  if (header.length > 0 && header.length <= 64 && IP_TEXT.test(header)) return header
  const socket = typeof socketIp === 'string' ? socketIp.trim() : ''
  if (socket.length > 0 && socket.length <= 64 && IP_TEXT.test(socket)) return socket
  return 'unknown'
}

// UTC date is part of the hash so the same address is not a stable key across days.
export function hashClientAddress(address: string, now: Date, salt: string): string {
  const day = now.toISOString().slice(0, 10)
  return sha256(`${salt}\n${day}\n${address}`)
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) return fallback
  return value
}

function ipSalt(env: NodeJS.ProcessEnv): string {
  const configured = env.RATE_LIMIT_IP_SALT?.trim()
  if (configured) return configured
  if (env.NODE_ENV !== 'production') return 'dev-ip-salt'
  // A missing production salt must not store a raw address. This salt changes on restart.
  if (!processSalt) processSalt = randomBytes(32).toString('hex')
  if (!warnedMissingSalt) {
    warnedMissingSalt = true
    console.warn('RATE_LIMIT_IP_SALT is not set. This process uses a salt that changes on restart.')
  }
  return processSalt
}

export function rateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    accessFailIpMax: positiveInt(env.RATE_LIMIT_ACCESS_FAIL_IP_MAX, LIMIT_DEFAULTS.accessFailIpMax),
    accessFailIpWindowSec: positiveInt(env.RATE_LIMIT_ACCESS_FAIL_IP_WINDOW_SEC, LIMIT_DEFAULTS.accessFailIpWindowSec),
    accessFailGalleryMax: positiveInt(env.RATE_LIMIT_ACCESS_FAIL_GALLERY_MAX, LIMIT_DEFAULTS.accessFailGalleryMax),
    accessFailGalleryWindowSec: positiveInt(
      env.RATE_LIMIT_ACCESS_FAIL_GALLERY_WINDOW_SEC,
      LIMIT_DEFAULTS.accessFailGalleryWindowSec,
    ),
    accessAcceptIpMax: positiveInt(env.RATE_LIMIT_ACCESS_ACCEPT_IP_MAX, LIMIT_DEFAULTS.accessAcceptIpMax),
    accessAcceptIpWindowSec: positiveInt(
      env.RATE_LIMIT_ACCESS_ACCEPT_IP_WINDOW_SEC,
      LIMIT_DEFAULTS.accessAcceptIpWindowSec,
    ),
    accessAcceptGalleryMax: positiveInt(env.RATE_LIMIT_ACCESS_ACCEPT_GALLERY_MAX, LIMIT_DEFAULTS.accessAcceptGalleryMax),
    accessAcceptGalleryWindowSec: positiveInt(
      env.RATE_LIMIT_ACCESS_ACCEPT_GALLERY_WINDOW_SEC,
      LIMIT_DEFAULTS.accessAcceptGalleryWindowSec,
    ),
    visitVisitorMax: positiveInt(env.RATE_LIMIT_VISIT_VISITOR_MAX, LIMIT_DEFAULTS.visitVisitorMax),
    visitVisitorWindowSec: positiveInt(env.RATE_LIMIT_VISIT_VISITOR_WINDOW_SEC, LIMIT_DEFAULTS.visitVisitorWindowSec),
    visitIpMax: positiveInt(env.RATE_LIMIT_VISIT_IP_MAX, LIMIT_DEFAULTS.visitIpMax),
    visitIpWindowSec: positiveInt(env.RATE_LIMIT_VISIT_IP_WINDOW_SEC, LIMIT_DEFAULTS.visitIpWindowSec),
    leadVisitorMax: positiveInt(env.RATE_LIMIT_LEAD_VISITOR_MAX, LIMIT_DEFAULTS.leadVisitorMax),
    leadVisitorWindowSec: positiveInt(env.RATE_LIMIT_LEAD_VISITOR_WINDOW_SEC, LIMIT_DEFAULTS.leadVisitorWindowSec),
    leadIpMax: positiveInt(env.RATE_LIMIT_LEAD_IP_MAX, LIMIT_DEFAULTS.leadIpMax),
    leadIpWindowSec: positiveInt(env.RATE_LIMIT_LEAD_IP_WINDOW_SEC, LIMIT_DEFAULTS.leadIpWindowSec),
    uploadGalleryMax: positiveInt(env.RATE_LIMIT_UPLOAD_GALLERY_MAX, LIMIT_DEFAULTS.uploadGalleryMax),
    uploadGalleryWindowSec: positiveInt(
      env.RATE_LIMIT_UPLOAD_GALLERY_WINDOW_SEC,
      LIMIT_DEFAULTS.uploadGalleryWindowSec,
    ),
    ipSalt: ipSalt(env),
  }
}

export function tooMany(retryAfterSeconds: number): ApiResult {
  return {
    status: 429,
    retryAfterSeconds: Math.max(1, retryAfterSeconds),
    body: {
      error: 'Too many requests. Try again later.',
      errorFa: 'درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.',
    },
  }
}

export function writeApiResult(
  res: {
    setHeader(name: string, value: string): void
    status(code: number): { json(body: unknown): void }
  },
  result: ApiResult,
) {
  if (result.retryAfterSeconds) res.setHeader('Retry-After', String(result.retryAfterSeconds))
  res.status(result.status).json(result.body)
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function visitorSubject(visitorId: unknown): string {
  if (typeof visitorId === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(visitorId)) return visitorId
  return 'invalid'
}

function addressHash(ip: string, now: Date, config: RateLimitConfig): string {
  return hashClientAddress(ip, now, config.ipSalt)
}

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { code?: unknown; message?: unknown; cause?: unknown }
    if (record.code === '23505') return true
    if (typeof record.message === 'string' && (record.message.includes('23505') || record.message.includes('duplicate key'))) {
      return true
    }
    current = record.cause
  }
  return false
}

async function peekBucket(db: Db, bucket: string, limit: number, windowSec: number, now: Date): Promise<ApiResult | null> {
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.bucket, bucket)).limit(1)
  if (!row) return null
  const end = asDate(row.windowStart).getTime() + windowSec * 1000
  if (now.getTime() >= end) return null
  if (row.hits < limit) return null
  return tooMany(Math.ceil((end - now.getTime()) / 1000))
}

async function writeBucket(db: Db, bucket: string, limit: number, windowSec: number, now: Date): Promise<BucketOutcome> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(rateLimits).where(eq(rateLimits.bucket, bucket)).for('update').limit(1)
    const windowMs = windowSec * 1000
    if (!existing || asDate(existing.windowStart).getTime() + windowMs <= now.getTime()) {
      if (!existing) {
        await tx.insert(rateLimits).values({ bucket, windowStart: now, hits: 1 })
      } else {
        await tx.update(rateLimits).set({ windowStart: now, hits: 1 }).where(eq(rateLimits.bucket, bucket))
      }
      return { allowed: 1 <= limit, retryAfterSeconds: windowSec }
    }
    const hits = existing.hits + 1
    await tx.update(rateLimits).set({ hits }).where(eq(rateLimits.bucket, bucket))
    const retryAfterSeconds = Math.max(1, Math.ceil((asDate(existing.windowStart).getTime() + windowMs - now.getTime()) / 1000))
    return { allowed: hits <= limit, retryAfterSeconds }
  })
}

async function consumeBucket(db: Db, bucket: string, limit: number, windowSec: number, now: Date): Promise<BucketOutcome> {
  try {
    return await writeBucket(db, bucket, limit, windowSec, now)
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    return writeBucket(db, bucket, limit, windowSec, now)
  }
}

function stricter(left: ApiResult | null, right: ApiResult | null): ApiResult | null {
  if (!left) return right
  if (!right) return left
  return (left.retryAfterSeconds ?? 1) >= (right.retryAfterSeconds ?? 1) ? left : right
}

async function beforeAccessCheck(db: Db, ip: string, now: Date, config: RateLimitConfig): Promise<ApiResult | null> {
  const hash = addressHash(ip, now, config)
  const failedIp = await peekBucket(db, `access-fail:ip:${hash}`, config.accessFailIpMax, config.accessFailIpWindowSec, now)
  const failedGallery = await peekBucket(
    db,
    `access-fail:gallery:${GALLERY}`,
    config.accessFailGalleryMax,
    config.accessFailGalleryWindowSec,
    now,
  )
  const blockedFailure = stricter(failedIp, failedGallery)
  if (blockedFailure) return blockedFailure
  const acceptedIp = await peekBucket(
    db,
    `access-accept:ip:${hash}`,
    config.accessAcceptIpMax,
    config.accessAcceptIpWindowSec,
    now,
  )
  const acceptedGallery = await peekBucket(
    db,
    `access-accept:gallery:${GALLERY}`,
    config.accessAcceptGalleryMax,
    config.accessAcceptGalleryWindowSec,
    now,
  )
  return stricter(acceptedIp, acceptedGallery)
}

async function afterAccessCheck(db: Db, ip: string, status: number, now: Date, config: RateLimitConfig): Promise<ApiResult | null> {
  const hash = addressHash(ip, now, config)
  if (status === 401) {
    const ipOutcome = await consumeBucket(db, `access-fail:ip:${hash}`, config.accessFailIpMax, config.accessFailIpWindowSec, now)
    const galleryOutcome = await consumeBucket(
      db,
      `access-fail:gallery:${GALLERY}`,
      config.accessFailGalleryMax,
      config.accessFailGalleryWindowSec,
      now,
    )
    if (!ipOutcome.allowed || !galleryOutcome.allowed) {
      return tooMany(Math.max(ipOutcome.retryAfterSeconds, galleryOutcome.retryAfterSeconds))
    }
    return null
  }
  await consumeBucket(db, `access-accept:ip:${hash}`, config.accessAcceptIpMax, config.accessAcceptIpWindowSec, now)
  await consumeBucket(
    db,
    `access-accept:gallery:${GALLERY}`,
    config.accessAcceptGalleryMax,
    config.accessAcceptGalleryWindowSec,
    now,
  )
  return null
}

function gallerySubject(slug: string): string {
  return GALLERY_SLUG_PATTERN.test(slug) ? slug : 'invalid'
}

async function beforeEvent(
  db: Db,
  action: 'visit' | 'lead',
  gallerySlug: string,
  ip: string,
  visitorId: unknown,
  now: Date,
  config: RateLimitConfig,
): Promise<ApiResult | null> {
  const hash = addressHash(ip, now, config)
  const subject = visitorSubject(visitorId)
  const visitorMax = action === 'visit' ? config.visitVisitorMax : config.leadVisitorMax
  const visitorWindow = action === 'visit' ? config.visitVisitorWindowSec : config.leadVisitorWindowSec
  const ipMax = action === 'visit' ? config.visitIpMax : config.leadIpMax
  const ipWindow = action === 'visit' ? config.visitIpWindowSec : config.leadIpWindowSec
  const scope = `${action}:gallery:${gallerySubject(gallerySlug)}`
  const visitorOutcome = await consumeBucket(db, `${scope}:visitor:${subject}`, visitorMax, visitorWindow, now)
  const ipOutcome = await consumeBucket(db, `${scope}:ip:${hash}`, ipMax, ipWindow, now)
  if (visitorOutcome.allowed && ipOutcome.allowed) return null
  const retry = Math.max(
    visitorOutcome.allowed ? 0 : visitorOutcome.retryAfterSeconds,
    ipOutcome.allowed ? 0 : ipOutcome.retryAfterSeconds,
  )
  return tooMany(retry)
}

export async function runPilotRequest(
  db: Db,
  storage: ObjectStorage,
  method: string,
  body: unknown,
  ip: string,
  now = new Date(),
  config = rateLimitConfig(),
  sessionGalleryId: string | null = null,
): Promise<ApiResult> {
  const verb = (method || 'GET').toUpperCase()
  const payload = (body && typeof body === 'object' ? body : {}) as { op?: unknown; visitorId?: unknown; record?: unknown }
  if (verb === 'PUT' && sessionGalleryId) {
    const result = await publishGalleryRecordForSession(db, storage, sessionGalleryId, payload.record)
    return { status: result.status, body: result.body }
  }
  if (verb === 'PUT') {
    const blocked = await beforeAccessCheck(db, ip, now, config)
    if (blocked) return blocked
  } else if (verb === 'POST' && (payload.op === 'visit' || payload.op === 'lead')) {
    const blocked = await beforeEvent(db, payload.op, gallerySlugOf(payload), ip, payload.visitorId, now, config)
    if (blocked) return blocked
  }
  const result = await handlePilotApi(db, storage, verb, body)
  if (verb === 'PUT') {
    const blocked = await afterAccessCheck(db, ip, result.status, now, config)
    if (blocked) return blocked
  }
  return { status: result.status, body: result.body }
}

export async function runStaffRequest(
  db: Db,
  accessCode: string,
  ip: string,
  now = new Date(),
  config = rateLimitConfig(),
  sessionGalleryId: string | null = null,
): Promise<ApiResult> {
  if (sessionGalleryId) return readStaffReportForSession(db, sessionGalleryId)
  const blocked = await beforeAccessCheck(db, ip, now, config)
  if (blocked) return blocked
  const result = await handleStaffApi(db, accessCode)
  const failure = await afterAccessCheck(db, ip, result.status, now, config)
  if (failure) return failure
  return { status: result.status, body: result.body }
}

export async function beginUpload(
  db: Db,
  input: {
    gallery: unknown
    accessCode: unknown
    ip: string
    now?: Date
    config?: RateLimitConfig
    sessionGalleryId?: string | null
  },
): Promise<{ ok: true; galleryId: string } | { ok: false; result: ApiResult }> {
  const now = input.now ?? new Date()
  const config = input.config ?? rateLimitConfig()
  if (input.gallery !== GALLERY) {
    return { ok: false, result: { status: 400, body: { error: 'Unknown gallery.' } } }
  }
  const tenant = await ensureOGalleryTenant(db)
  if (input.sessionGalleryId) {
    if (input.sessionGalleryId !== tenant.gallery.id) {
      return { ok: false, result: { status: 401, body: { error: 'Sign in to upload.' } } }
    }
  } else {
    const blocked = await beforeAccessCheck(db, input.ip, now, config)
    if (blocked) return { ok: false, result: blocked }
    const code = typeof input.accessCode === 'string' ? input.accessCode : ''
    if (!verifySecret(code, tenant.gallery.accessCodeHash)) {
      const failure = await afterAccessCheck(db, input.ip, 401, now, config)
      return { ok: false, result: failure ?? { status: 401, body: { error: 'That access code does not match.' } } }
    }
    const accepted = await afterAccessCheck(db, input.ip, 200, now, config)
    if (accepted) return { ok: false, result: accepted }
  }
  const uploadBucket = `upload:gallery:${GALLERY}`
  const uploadBlocked = await peekBucket(db, uploadBucket, config.uploadGalleryMax, config.uploadGalleryWindowSec, now)
  if (uploadBlocked) return { ok: false, result: uploadBlocked }
  const upload = await consumeBucket(db, uploadBucket, config.uploadGalleryMax, config.uploadGalleryWindowSec, now)
  if (!upload.allowed) return { ok: false, result: tooMany(upload.retryAfterSeconds) }
  return { ok: true, galleryId: tenant.gallery.id }
}

export async function runSignIn(
  db: Db,
  accessCode: string,
  ip: string,
  now = new Date(),
  config = rateLimitConfig(),
): Promise<{ ok: true; token: string } | { ok: false; result: ApiResult }> {
  const blocked = await beforeAccessCheck(db, ip, now, config)
  if (blocked) return { ok: false, result: blocked }
  const created = await signInWithAccessCode(db, accessCode)
  const after = await afterAccessCheck(db, ip, created ? 200 : 401, now, config)
  if (after) return { ok: false, result: after }
  if (!created) return { ok: false, result: { status: 401, body: { error: 'That access code does not match.' } } }
  return { ok: true, token: created.token }
}
