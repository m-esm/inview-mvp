import { and, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { memberships, sessions, users } from '../database/schema'
import { writeAudit } from './audit'
import { hashSecret, randomToken, sha256, verifySecret } from './crypto'
import { consumeBucket, hashClientAddress, peekBucket, rateLimitConfig, tooMany } from './rate-limit'
import type { ApiResult } from './rate-limit'
import { readCookie } from './staff-session'

export type AccountDb = Pick<AppDatabase, 'select' | 'insert' | 'update' | 'delete' | 'transaction'>
export const USER_COOKIE = 'inview_session'
const DUMMY_HASH = hashSecret(randomToken())

export class AccountInputError extends Error {}

export function normalizePhone(value: string): string {
  return value.trim().replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/^(\+98|0098)/, '0')
}

export function passwordHash(password: string): string {
  if (typeof password !== 'string' || password.length < 10 || password.length > 1024) {
    throw new AccountInputError('Use a password with 10 to 1024 characters.')
  }
  return hashSecret(password)
}

export function userSummary(user: typeof users.$inferSelect) {
  return { id: user.id, name: user.name, platformRole: user.platformRole }
}

export async function createUser(
  db: Pick<AppDatabase, 'insert'>,
  input: {
    email?: string | null
    phone?: string | null
    name?: string
    password?: string
    platformRole?: 'admin' | 'support' | null
    status?: 'invited' | 'active' | 'disabled'
  },
) {
  const email = input.email?.trim().toLowerCase() || null
  const phone = input.phone ? normalizePhone(input.phone) || null : null
  if (!email && !phone) throw new AccountInputError('An email or phone number is required.')
  if ((email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    || (phone && (phone.length > 20 || !/^\+?[0-9]{7,20}$/.test(phone)))) {
    throw new AccountInputError('Enter a valid email or phone number.')
  }
  const [user] = await db.insert(users).values({
    email,
    phone,
    name: input.name?.trim() ?? '',
    passwordHash: input.password === undefined ? null : passwordHash(input.password),
    platformRole: input.platformRole ?? null,
    status: input.status ?? 'active',
  }).returning()
  return user
}

export function userCookie(token: string, secure: boolean, maxAge: number): string {
  return [
    `${USER_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

export async function createUserSession(db: AccountDb, userId: string, secure: boolean) {
  const [user] = await db.update(users).set({ lastSignedInAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.status, 'active'))).returning()
  if (!user) throw new AccountInputError('This account cannot sign in.')
  const token = randomToken()
  const ttlSeconds = (user.platformRole ? 8 : 12) * 60 * 60
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  })
  return { user: userSummary(user), cookie: userCookie(token, secure, ttlSeconds) }
}

export async function signIn(
  db: AppDatabase,
  input: { identifier: string; password: string; ip: string; secure: boolean },
  now = new Date(),
  config = rateLimitConfig(),
): Promise<{ ok: true; user: ReturnType<typeof userSummary>; cookie: string } | { ok: false; result: ApiResult }> {
  const identifier = input.identifier.includes('@') ? input.identifier.trim().toLowerCase() : normalizePhone(input.identifier)
  const clientKey = `user-sign-in:ip:${hashClientAddress(input.ip, now, config.ipSalt)}`
  const client = await peekBucket(db, clientKey, config.accessFailIpMax, config.accessFailIpWindowSec, now)
  if (client) return { ok: false, result: client }
  const [user] = await db.select().from(users)
    .where(identifier.includes('@') ? sql`lower(${users.email}) = ${identifier}` : eq(users.phone, identifier)).limit(1)
  const accountKey = `user-sign-in:account:${sha256(user?.id ?? identifier)}`
  const account = await peekBucket(db, accountKey,
    config.accessFailGalleryMax, config.accessFailGalleryWindowSec, now)
  if (account) return { ok: false, result: account }
  const valid = verifySecret(input.password.length <= 1024 ? input.password : '', user?.passwordHash ?? DUMMY_HASH)
  if (!valid || !user || user.status !== 'active') {
    const clientFailure = await consumeBucket(db, clientKey, config.accessFailIpMax, config.accessFailIpWindowSec, now)
    const failure = await consumeBucket(db, accountKey, config.accessFailGalleryMax, config.accessFailGalleryWindowSec, now)
    if (!clientFailure.allowed || !failure.allowed) {
      return { ok: false, result: tooMany(Math.max(
        clientFailure.allowed ? 0 : clientFailure.retryAfterSeconds,
        failure.allowed ? 0 : failure.retryAfterSeconds,
      )) }
    }
    return { ok: false, result: { status: 401, body: { error: 'The sign-in details do not match.' } } }
  }
  const session = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for('update').limit(1)
    if (!current || current.status !== 'active' || current.passwordHash !== user.passwordHash) return null
    return createUserSession(tx, current.id, input.secure)
  })
  if (!session) return { ok: false, result: { status: 401, body: { error: 'The sign-in details do not match.' } } }
  return { ok: true, ...session }
}

export async function signOut(db: Pick<AppDatabase, 'delete'>, cookieHeader: string | null | undefined, secure: boolean) {
  const token = readCookie(cookieHeader, USER_COOKIE)
  if (token) await db.delete(sessions).where(and(eq(sessions.tokenHash, sha256(token)), sql`${sessions.userId} IS NOT NULL`))
  return userCookie('', secure, 0)
}

export async function signOutAll(
  db: AccountDb,
  userId: string,
  actorUserId = userId,
  galleryId?: string | null,
) {
  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
    await tx.delete(sessions).where(eq(sessions.userId, userId))
    const scopes = galleryId ? [{ galleryId }] : await tx.select({ galleryId: memberships.galleryId })
      .from(memberships).where(eq(memberships.userId, userId))
    for (const scope of scopes.length ? scopes : [{ galleryId: null }]) {
      await writeAudit(tx, { actorUserId, galleryId: scope.galleryId, action: 'sign-out-all', targetType: 'user', targetId: userId })
    }
  })
}
