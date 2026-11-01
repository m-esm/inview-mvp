import { eq } from 'drizzle-orm'
import { sessions } from '../database/schema'
import { ensureOGalleryTenant } from './gallery-record'
import { randomToken, sha256, verifySecret } from './crypto'

// Drizzle database handle (Postgres.js in production, PGlite in tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const STAFF_COOKIE = 'inview_staff'
export const SIGN_IN_PATH = '/dashboard/sign-in'
export const EDITOR_PATH = '/dashboard/o-gallery'
export const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000

const TTL_SECONDS = STAFF_SESSION_TTL_MS / 1000

const WRONG_CODE = 'That access code does not match.'

export function requestIsSecure(
  headerGet: (name: string) => string | null | undefined,
  url?: string,
): boolean {
  // A browser drops a Secure cookie on http://localhost. Production is https,
  // including when a proxy terminates TLS, so production always sets Secure.
  if (process.env.NODE_ENV === 'production') return true
  const forwarded = headerGet('x-forwarded-proto')
  if (forwarded && forwarded.split(',')[0]?.trim() === 'https') return true
  if (!url) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export function staffSetCookie(token: string, secure: boolean): string {
  return cookieHeader(encodeURIComponent(token), TTL_SECONDS, secure)
}

export function staffClearCookie(secure: boolean): string {
  return cookieHeader('', 0, secure)
}

function cookieHeader(value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${STAFF_COOKIE}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eqAt = part.indexOf('=')
    if (eqAt === -1) continue
    const key = part.slice(0, eqAt).trim()
    if (key !== name) continue
    const raw = part.slice(eqAt + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

export async function signInWithAccessCode(db: Db, code: string) {
  const { gallery } = await ensureOGalleryTenant(db)
  if (!verifySecret(code, gallery.accessCodeHash)) return null
  const token = randomToken()
  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + STAFF_SESSION_TTL_MS)
  await db.insert(sessions).values({
    galleryId: gallery.id,
    tokenHash,
    expiresAt,
  })
  return { token, tokenHash, galleryId: gallery.id, expiresAt }
}

export async function readStaffSession(db: Db, cookieHeader: string | null | undefined) {
  const token = readCookie(cookieHeader, STAFF_COOKIE)
  if (!token) return null
  const tokenHash = sha256(token)
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1)
  if (!row?.galleryId) return null
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.id))
    return null
  }
  return { id: row.id as string, galleryId: row.galleryId as string, expiresAt: row.expiresAt as Date }
}

export async function endStaffSession(db: Db, cookieHeader: string | null | undefined) {
  const token = readCookie(cookieHeader, STAFF_COOKIE)
  if (!token) return
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)))
}

export async function completeSignIn(db: Db, code: string, secure: boolean) {
  const created = await signInWithAccessCode(db, code)
  if (!created) return { ok: false as const, error: WRONG_CODE }
  return {
    ok: true as const,
    cookie: staffSetCookie(created.token, secure),
    location: EDITOR_PATH,
  }
}

export async function completeSignOut(db: Db, cookieHeader: string | null | undefined, secure: boolean) {
  await endStaffSession(db, cookieHeader)
  return { cookie: staffClearCookie(secure), location: SIGN_IN_PATH }
}

export function anonymousEditorGate(session: { galleryId: string } | null): Response | null {
  if (session) return null
  return new Response(null, {
    status: 302,
    headers: {
      Location: SIGN_IN_PATH,
      'Cache-Control': 'no-store',
    },
  })
}
