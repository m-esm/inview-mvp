import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm'
import QRCode from 'qrcode'
import { auditLogs, leads, qrCodes, shows, visits, works } from '../database/schema'
import { QR_CODE_PATTERN, tehranDay } from '../app/lib/tehran-day'
import { AccountInputError, type AccountDb } from './accounts'
import { writeAudit } from './audit'
import { can, leadPhoneAccess, type Principal } from './authz'
import { leadsCsv } from './gallery-record'
import { requireOperator } from './ops'
import { PermissionError } from './team'

export function maskPhone(phone: string) {
  if (phone.length < 7) return '•'.repeat(phone.length)
  return `${phone.slice(0, 4)}${'•'.repeat(phone.length - 6)}${phone.slice(-2)}`
}

export async function galleryLeads(db: AccountDb, principal: Principal | null, galleryId: string) {
  requireOperator(principal)
  const access = leadPhoneAccess(principal, galleryId)
  if (access === 'none') throw new PermissionError('Forbidden')
  const rows = await db.select({ id: leads.id, phone: leads.phone, kind: leads.kind, createdAt: leads.createdAt,
    workTitle: works.title, workTitleFa: works.titleFa, consentTextVersion: leads.consentTextVersion })
    .from(leads).leftJoin(works, and(eq(works.id, leads.workId), eq(works.galleryId, galleryId)))
    .where(eq(leads.galleryId, galleryId)).orderBy(desc(leads.createdAt), desc(leads.id)).limit(1000)
  return rows.map((row) => ({ ...row, phone: maskPhone(row.phone) }))
}

export async function revealLeadPhone(db: AccountDb, principal: Principal | null, galleryId: string, leadId: string, reason: string) {
  const actor = requireOperator(principal)
  if (leadPhoneAccess(actor, galleryId) === 'none') throw new PermissionError('Forbidden')
  if (!/^[0-9a-f-]{36}$/.test(leadId) || !reason.trim() || reason.trim().length > 500 || (reason.match(/[0-9۰-۹٠-٩]/g)?.length ?? 0) >= 7) {
    throw new AccountInputError('Enter a reason without personal contact details.')
  }
  return db.transaction(async (tx) => {
    const [lead] = await tx.select({ phone: leads.phone }).from(leads)
      .where(and(eq(leads.galleryId, galleryId), eq(leads.id, leadId))).limit(1)
    if (!lead) throw new AccountInputError('Lead not found.')
    await writeAudit(tx, { actorUserId: actor.userId, galleryId, action: 'lead-reveal', targetType: 'lead', targetId: leadId, summary: { reason: reason.trim() } })
    return { leadId, phone: lead.phone }
  })
}

export function requireLeadExport(principal: Principal | null, galleryId: string) {
  const actor = requireOperator(principal)
  if (!can(actor, 'export-leads', galleryId)) throw new PermissionError('Forbidden')
  return actor
}

export async function exportGalleryLeads(db: AccountDb, principal: Principal | null, galleryId: string) {
  const actor = requireLeadExport(principal, galleryId)
  return db.transaction(async (tx) => {
    const rows = await tx.select({ consentAt: leads.consentAt, kind: leads.kind, phone: leads.phone,
      workId: leads.workId, workTitle: works.title, consentTextVersion: leads.consentTextVersion })
      .from(leads).leftJoin(works, and(eq(works.id, leads.workId), eq(works.galleryId, galleryId)))
      .where(eq(leads.galleryId, galleryId)).orderBy(desc(leads.createdAt), desc(leads.id)).limit(10000)
    const csv = leadsCsv(rows.map((lead) => ({ ...lead, at: lead.consentAt })))
    await writeAudit(tx, { actorUserId: actor.userId, galleryId, action: 'leads-export', targetType: 'gallery', targetId: galleryId, summary: { rows: rows.length } })
    return csv
  })
}

export async function galleryQrCodes(db: AccountDb, principal: Principal | null, galleryId: string) {
  requireOperator(principal)
  return db.select({ id: qrCodes.id, code: qrCodes.code, label: qrCodes.label, scans: count(visits.id) })
    .from(qrCodes).innerJoin(shows, eq(shows.id, qrCodes.showId))
    .leftJoin(visits, and(eq(visits.qrCodeId, qrCodes.id), eq(visits.showId, shows.id), eq(visits.kind, 'scan')))
    .where(eq(shows.galleryId, galleryId)).groupBy(qrCodes.id).orderBy(desc(qrCodes.createdAt))
}

export async function createGalleryQr(db: AccountDb, principal: Principal | null, galleryId: string, label: string, code: string) {
  const actor = requireOperator(principal)
  if (!can(actor, 'create-qr', galleryId)) throw new PermissionError('Forbidden')
  if (!QR_CODE_PATTERN.test(code) || !label.trim() || label.length > 120) throw new AccountInputError('Invalid QR fields.')
  return db.transaction(async (tx) => {
    const [show] = await tx.select({ id: shows.id }).from(shows).where(eq(shows.galleryId, galleryId))
      .orderBy(desc(shows.createdAt), desc(shows.id)).limit(1)
    if (!show) throw new AccountInputError('Show not found.')
    const [qr] = await tx.insert(qrCodes).values({ showId: show.id, label: label.trim(), code })
      .onConflictDoNothing({ target: qrCodes.code }).returning({ id: qrCodes.id })
    if (!qr) throw new AccountInputError('Code already exists.')
    await writeAudit(tx, { actorUserId: actor.userId, galleryId, action: 'qr-create', targetType: 'qr', targetId: qr.id })
    return qr
  })
}

export async function galleryQrSvg(db: AccountDb, principal: Principal | null, galleryId: string, slug: string, code: string, origin: string) {
  requireOperator(principal)
  const [qr] = await db.select({ code: qrCodes.code }).from(qrCodes).innerJoin(shows, eq(shows.id, qrCodes.showId))
    .where(and(eq(shows.galleryId, galleryId), eq(qrCodes.code, code))).limit(1)
  if (!qr) throw new AccountInputError('Code not found.')
  const url = new URL(`/g/${encodeURIComponent(slug)}`, origin)
  url.searchParams.set('q', qr.code)
  return QRCode.toString(url.href, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' })
}

export async function galleryActivity(db: AccountDb, principal: Principal | null, galleryId: string, now = new Date()) {
  requireOperator(principal)
  const today = tehranDay(now)
  const days = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.parse(`${today}T12:00:00Z`) - i * 86400000).toISOString().slice(0, 10), scans: 0, views: 0 }))
  const day = sql<string>`(${visits.createdAt} AT TIME ZONE 'Asia/Tehran')::date::text`
  const scope = and(eq(shows.galleryId, galleryId), gte(day, days[29].day), lte(day, today))
  const events = await db.select({ day, kind: visits.kind, value: count() }).from(visits)
    .innerJoin(shows, eq(shows.id, visits.showId)).where(scope).groupBy(day, visits.kind)
  for (const event of events) {
    const entry = days.find((item) => item.day === event.day)
    if (entry) entry[event.kind === 'scan' ? 'scans' : 'views'] = event.value
  }
  const workViews = await db.select({ id: works.id, title: works.title, titleFa: works.titleFa, views: count() }).from(visits)
    .innerJoin(shows, eq(shows.id, visits.showId))
    .innerJoin(works, and(eq(works.id, visits.workId), eq(works.galleryId, galleryId)))
    .where(and(scope, eq(visits.kind, 'view'))).groupBy(works.id).orderBy(desc(count()), works.id)
  const audit = await db.select({ id: auditLogs.id, action: auditLogs.action, createdAt: auditLogs.createdAt, actorUserId: auditLogs.actorUserId })
    .from(auditLogs).where(eq(auditLogs.galleryId, galleryId)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(100)
  return { days, works: workViews, audit }
}
