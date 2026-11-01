import { and, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { auditLogs, galleries, leads, qrCodes, shows, visits, works } from '../database/schema'
import { tehranDay } from '../app/lib/tehran-day'
import { AccountInputError, type AccountDb } from './accounts'
import { writeAudit } from './audit'
import { can, type Principal } from './authz'
import { hashSecret, randomToken } from './crypto'
import { inviteStaff, PermissionError } from './team'

export function requireOperator(principal: Principal | null) {
  if (!principal || principal.kind !== 'operator' || !can(principal, 'manage-gallery')) throw new PermissionError('Forbidden')
  return principal
}

function requiredText(value: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AccountInputError('Check the required fields and their lengths.')
  return value.trim()
}

const profileColumns = {
  id: galleries.id, slug: galleries.slug, nameEn: galleries.nameEn, nameFa: galleries.nameFa,
  status: galleries.status, notes: galleries.notes, sharedCodeEnabled: galleries.sharedCodeEnabled,
}

export async function galleryProfile(db: AccountDb, principal: Principal | null, slug: string) {
  requireOperator(principal)
  const [gallery] = await db.select(profileColumns).from(galleries).where(eq(galleries.slug, slug)).limit(1)
  return gallery ?? null
}

export async function listGalleries(db: AccountDb, principal: Principal | null, now = new Date()) {
  requireOperator(principal)
  const rows = await db.select(profileColumns).from(galleries).orderBy(galleries.nameFa)
  const today = tehranDay(now)
  const firstDay = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10)
  return Promise.all(rows.map(async (gallery) => {
    const [workCount] = await db.select({ value: count() }).from(works).where(and(eq(works.galleryId, gallery.id), isNull(works.removedAt)))
    const [published] = await db.select({ at: shows.updatedAt }).from(shows)
      .where(and(eq(shows.galleryId, gallery.id), eq(shows.status, 'published'))).orderBy(desc(shows.updatedAt)).limit(1)
    const periods = await Promise.all([7, 30].map(async (days) => {
      const start = firstDay(days)
      const events = await db.select({ kind: visits.kind, value: count() }).from(visits)
        .innerJoin(shows, eq(shows.id, visits.showId))
        .where(and(eq(shows.galleryId, gallery.id), gte(visits.day, start), lte(visits.day, today))).groupBy(visits.kind)
      const [leadCount] = await db.select({ value: count() }).from(leads)
        .where(and(eq(leads.galleryId, gallery.id), sql`(${leads.createdAt} AT TIME ZONE 'Asia/Tehran')::date >= ${start}::date`,
          sql`(${leads.createdAt} AT TIME ZONE 'Asia/Tehran')::date <= ${today}::date`))
      return { scans: events.find((event) => event.kind === 'scan')?.value ?? 0, views: events.find((event) => event.kind === 'view')?.value ?? 0, leads: leadCount.value }
    }))
    return { ...gallery, worksCount: workCount.value, lastPublish: published?.at ?? null, days7: periods[0], days30: periods[1] }
  }))
}

export async function recentAudit(db: AccountDb, principal: Principal | null) {
  requireOperator(principal)
  return db.select({ id: auditLogs.id, action: auditLogs.action, galleryId: auditLogs.galleryId, createdAt: auditLogs.createdAt })
    .from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12)
}

export async function createGallery(db: AccountDb, principal: Principal | null, input: {
  slug: string; nameFa: string; nameEn: string; showTitle: string; ownerIdentifier: string
}) {
  const actor = requireOperator(principal)
  if (!/^[a-z0-9-]{3,40}$/.test(input.slug)) throw new AccountInputError('Use 3 to 40 lowercase letters, digits or hyphens for the slug.')
  const nameFa = requiredText(input.nameFa, 80)
  const nameEn = requiredText(input.nameEn, 80)
  const showTitle = requiredText(input.showTitle, 160)
  return db.transaction(async (tx) => {
    const [gallery] = await tx.insert(galleries).values({ slug: input.slug, nameFa, nameEn, status: 'draft' })
      .onConflictDoNothing({ target: galleries.slug }).returning(profileColumns)
    if (!gallery) throw new AccountInputError('This slug is already in use.')
    const [show] = await tx.insert(shows).values({ galleryId: gallery.id, titleFa: showTitle, titleEn: showTitle, status: 'draft' }).returning({ id: shows.id })
    await tx.insert(qrCodes).values({ showId: show.id, code: `${gallery.slug}-main`, label: 'Main' })
    const invite = await inviteStaff(tx, actor, gallery.id, 'owner', input.ownerIdentifier)
    await writeAudit(tx, { actorUserId: actor.userId, galleryId: gallery.id, action: 'gallery-create', targetType: 'gallery', targetId: gallery.id, summary: { status: 'draft' } })
    return { gallery, ...invite }
  })
}

export async function updateGallery(db: AccountDb, principal: Principal | null, galleryId: string, input: {
  nameFa: string; nameEn: string; status: 'draft' | 'live' | 'paused'; notes: string; sharedCodeEnabled: boolean
}) {
  const actor = requireOperator(principal)
  const nameFa = requiredText(input.nameFa, 80)
  const nameEn = requiredText(input.nameEn, 80)
  if (!['draft', 'live', 'paused'].includes(input.status) || input.notes.length > 10000 || typeof input.sharedCodeEnabled !== 'boolean') {
    throw new AccountInputError('Invalid gallery settings.')
  }
  return db.transaction(async (tx) => {
    const [before] = await tx.select(profileColumns).from(galleries).where(eq(galleries.id, galleryId)).for('update').limit(1)
    if (!before) throw new AccountInputError('Gallery not found.')
    const [gallery] = await tx.update(galleries).set({ nameFa, nameEn, status: input.status, notes: input.notes, sharedCodeEnabled: input.sharedCodeEnabled, updatedAt: new Date() }).where(eq(galleries.id, galleryId)).returning(profileColumns)
    await writeAudit(tx, { actorUserId: actor.userId, galleryId, action: 'gallery-update', targetType: 'gallery', targetId: galleryId,
      summary: { before: { status: before.status, sharedCodeEnabled: before.sharedCodeEnabled }, after: { status: gallery.status, sharedCodeEnabled: gallery.sharedCodeEnabled } } })
    return gallery
  })
}

export async function rotateSharedCode(db: AccountDb, principal: Principal | null, galleryId: string) {
  const actor = requireOperator(principal)
  const code = randomToken(18)
  await db.transaction(async (tx) => {
    const rows = await tx.update(galleries).set({ accessCodeHash: hashSecret(code), updatedAt: new Date() }).where(eq(galleries.id, galleryId)).returning({ id: galleries.id })
    if (!rows.length) throw new AccountInputError('Gallery not found.')
    await writeAudit(tx, { actorUserId: actor.userId, galleryId, action: 'gallery-code-rotate', targetType: 'gallery', targetId: galleryId })
  })
  return { code }
}
