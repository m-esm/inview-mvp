import { database } from '../../database/context'
import { endStaffSession, requestIsSecure, staffClearCookie, staffSetCookie } from '../../server/staff-session'
import { runSignIn } from '../../server/rate-limit'
import { signIn, signOut } from '../../server/accounts'
import { can, principalFor, type Action } from '../../server/authz'
import { staffHeaders, staffNext, staffReport, staffTenant } from '../../server/staff'
import { loadStaffRecord } from '../../server/gallery-record'

export async function galleryData(request: Request, slug: string, action: Action) {
  const db = database()
  const { principal, tenant } = await staffTenant(db, request, slug, action)
  const permissions = (['edit-catalogue', 'export-leads', 'manage-staff', 'create-qr'] as const).filter((permission) => can(principal, permission, tenant.gallery.id))
  return { gallery: { slug: tenant.gallery.slug, nameEn: tenant.gallery.nameEn, nameFa: tenant.gallery.nameFa }, permissions, ...await loadStaffRecord(db, tenant), report: await staffReport(db, principal, tenant.gallery.id) }
}

export function secureFrom(request: Request): boolean {
  return requestIsSecure((name) => request.headers.get(name), request.url)
}

export function requireStaffOrigin(request: Request) {
  if (request.method !== 'POST') throw new Response('Method not allowed', { status: 405, headers: staffHeaders() })
  if (request.headers.get('origin') !== new URL(process.env.PUBLIC_APP_URL || request.url).origin) throw new Response('Forbidden', { status: 403, headers: staffHeaders() })
}

export async function redirectIfSignedIn(request: Request): Promise<Response | null> {
  if (!await principalFor(database(), request)) return null
  return new Response(null, {
    status: 302,
    headers: { ...staffHeaders(), Location: staffNext(new URL(request.url).searchParams.get('next')) },
  })
}

export async function signInAction(request: Request, clientIp = 'unknown') {
  requireStaffOrigin(request)
  const form = await request.formData()
  const shared = form.get('intent') === 'shared-code'
  const slug = String(form.get('gallery') || '')
  const result = shared
    ? await runSignIn(database(), String(form.get('accessCode') || ''), clientIp, undefined, undefined, slug)
    : await signIn(database(), { identifier: String(form.get('identifier') || ''), password: String(form.get('password') || ''), ip: clientIp, secure: secureFrom(request) })
  if (!result.ok) {
    const body = result.result.body as { error?: string }
    return {
      ok: false as const,
      status: result.result.status,
      error: body.error || 'That access code does not match.',
      retryAfterSeconds: result.result.retryAfterSeconds,
    }
  }
  const next = staffNext(new URL(request.url).searchParams.get('next'))
  return { ok: true as const, cookie: 'token' in result ? staffSetCookie(result.token, secureFrom(request)) : result.cookie, location: shared && next === '/staff' ? `/staff/${encodeURIComponent(slug)}` : next }
}

export async function signOutAction(request: Request) {
  requireStaffOrigin(request)
  const db = database()
  const secure = secureFrom(request)
  await endStaffSession(db, request.headers.get('cookie'))
  return { cookies: [await signOut(db, request.headers.get('cookie'), secure), staffClearCookie(secure)], location: '/staff/sign-in' }
}
