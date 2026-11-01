import type { AppDatabase } from '../database/context'
import { galleries } from '../database/schema'
import { can, leadPhoneAccess, principalFor, type Action, type Principal } from './authz'
import { tenantBySlug, readStaffReportForSession, leadsCsvForSession } from './gallery-record'
import { writeAudit } from './audit'

export const staffHeaders = () => ({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' })

export function staffNext(value: string | null): string {
  if (!value || /[\\\r\n]/.test(value)) return '/staff'
  try {
    const url = new URL(value, 'https://inview.invalid')
    if (url.origin !== 'https://inview.invalid' || !value.startsWith('/staff')
      || !(url.pathname === '/staff' || url.pathname.startsWith('/staff/'))
      || ['/staff/sign-in', '/staff/sign-out'].includes(url.pathname)) return '/staff'
    return url.pathname + url.search
  } catch { return '/staff' }
}

export async function staffPrincipal(db: AppDatabase, request: Request) {
  const principal = await principalFor(db, request)
  if (!principal) {
    const url = new URL(request.url)
    throw new Response(null, { status: 302, headers: { ...staffHeaders(), Location: `/staff/sign-in?next=${encodeURIComponent(staffNext(url.pathname + url.search))}` } })
  }
  return principal
}

export async function staffTenant(db: AppDatabase, request: Request, slug: string, action: Action) {
  const principal = await staffPrincipal(db, request)
  const tenant = await tenantBySlug(db, slug)
  if (!tenant) throw new Response('Not found', { status: 404, headers: staffHeaders() })
  if (!can(principal, action, tenant.gallery.id)) throw new Response('Forbidden', { status: 403, headers: staffHeaders() })
  return { principal, tenant }
}

export async function staffGalleries(db: AppDatabase, principal: Principal) {
  const rows = await db.select({ id: galleries.id, slug: galleries.slug, nameEn: galleries.nameEn, nameFa: galleries.nameFa }).from(galleries).orderBy(galleries.nameEn)
  return rows.filter((gallery) => can(principal, 'view-gallery', gallery.id))
}

export function auditActor(principal: Principal) {
  return { actorUserId: principal.kind === 'shared-code' ? null : principal.userId, summary: { kind: principal.kind } }
}

export async function staffReport(db: AppDatabase, principal: Principal, galleryId: string) {
  if (!can(principal, 'view-report', galleryId)) throw new Response('Forbidden', { status: 403 })
  const result = await readStaffReportForSession(db, galleryId)
  if (result.status !== 200) throw new Response('Not found', { status: 404 })
  const access = leadPhoneAccess(principal, galleryId)
  return { ...result.body, leads: result.body.leads.map((lead) => ({ ...lead, phone: access === 'full' ? lead.phone : access === 'masked' ? `${lead.phone.slice(0, 4)}•••••${lead.phone.slice(-2)}` : '' })) }
}

export async function staffCsv(db: AppDatabase, principal: Principal, galleryId: string) {
  if (!can(principal, 'export-leads', galleryId) || leadPhoneAccess(principal, galleryId) !== 'full') throw new Response('Forbidden', { status: 403 })
  const result = await leadsCsvForSession(db, galleryId)
  if (result.status === 200) await writeAudit(db, { ...auditActor(principal), galleryId, action: 'export-leads', targetType: 'gallery', targetId: galleryId })
  return result
}
