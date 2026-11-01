import { and, desc, eq, isNotNull, isNull, sql, count } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { auditLogs, galleries, invitations, media, rateLimits, sessions, users } from '../database/schema'
import { tehranDay } from '../app/lib/tehran-day'
import { AccountInputError, createUser, normalizePhone, type AccountDb } from './accounts'
import { writeAudit } from './audit'
import { can, type PlatformRole, type Principal } from './authz'
import { createInvite } from './invitations'
import { requireOperator } from './ops'
import { pingDatabase, runChecks } from './ready'
import { rateLimitConfig } from './rate-limit'
import type { ObjectStorage } from './storage'
import { PermissionError } from './team'

export function requireOperatorAdmin(principal: Principal | null) {
  const actor = requireOperator(principal)
  if (!can(actor, 'manage-operators')) throw new PermissionError('Forbidden')
  return actor
}

function validRole(role: PlatformRole) {
  if (!['admin', 'support'].includes(role)) throw new AccountInputError('Invalid role.')
}

export async function listOperators(db: AccountDb, principal: Principal | null) {
  requireOperatorAdmin(principal)
  return db.select({ id: users.id, name: users.name, role: users.platformRole, status: users.status, lastSignedInAt: users.lastSignedInAt })
    .from(users).where(isNotNull(users.platformRole)).orderBy(users.name, users.id)
}

export async function inviteOperator(db: AccountDb, principal: Principal | null, identifier: string, role: PlatformRole) {
  const actor = requireOperatorAdmin(principal)
  validRole(role)
  const email = identifier.includes('@') ? identifier.trim().toLowerCase() : null
  const phone = email ? null : normalizePhone(identifier)
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users)
      .where(email ? sql`lower(${users.email}) = ${email}` : eq(users.phone, phone!)).limit(1)
    if (existing) throw new AccountInputError('Account already exists.')
    const user = await createUser(tx, { email, phone, platformRole: role, status: 'invited' })
    const invite = await createInvite(tx, { kind: 'operator', userId: user.id, platformRole: role, createdBy: actor.userId })
    return { invitePath: `/staff/invite/${invite.token}` }
  })
}

export async function updateOperator(db: AccountDb, principal: Principal | null, userId: string, change: { role: PlatformRole } | { disable: true }) {
  const actor = requireOperatorAdmin(principal)
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new AccountInputError('Invalid operator.')
  if ('role' in change) validRole(change.role)
  if (userId === actor.userId) throw new AccountInputError('Ask another admin to change your account.')
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ role: users.platformRole, status: users.status }).from(users)
      .where(and(eq(users.id, userId), isNotNull(users.platformRole))).for('update').limit(1)
    if (!before) throw new AccountInputError('Operator not found.')
    await tx.update(users).set({ ...('role' in change ? { platformRole: change.role } : { status: 'disabled' as const }), updatedAt: new Date() })
      .where(eq(users.id, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
    if ('role' in change) {
      await tx.update(invitations).set({ platformRole: change.role })
        .where(and(eq(invitations.userId, userId), eq(invitations.kind, 'operator'), isNull(invitations.consumedAt)))
    }
    await writeAudit(tx, { actorUserId: actor.userId, action: 'role' in change ? 'operator-role' : 'operator-disable', targetType: 'user', targetId: userId,
      summary: { before, after: 'role' in change ? { role: change.role, status: before.status } : { role: before.role, status: 'disabled' } } })
  })
}

export type AuditFilters = { gallery?: string; actor?: string; action?: string; page?: number }

export async function auditPage(db: AccountDb, principal: Principal | null, filters: AuditFilters = {}) {
  const actor = requireOperator(principal)
  if (!can(actor, 'read-audit')) throw new PermissionError('Forbidden')
  const page = Math.max(1, Math.min(100000, Math.floor(filters.page || 1)))
  const rows = await db.select({ id: auditLogs.id, galleryId: auditLogs.galleryId, gallery: galleries.nameEn, galleryFa: galleries.nameFa,
    actorUserId: auditLogs.actorUserId, actor: users.name, action: auditLogs.action, targetType: auditLogs.targetType,
    targetId: auditLogs.targetId, createdAt: auditLogs.createdAt })
    .from(auditLogs).leftJoin(galleries, eq(galleries.id, auditLogs.galleryId)).leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(filters.gallery ? sql`${auditLogs.galleryId}::text = ${filters.gallery}` : undefined,
      filters.actor ? sql`${auditLogs.actorUserId}::text = ${filters.actor}` : undefined,
      filters.action ? eq(auditLogs.action, filters.action) : undefined))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(51).offset((page - 1) * 50)
  return { rows: rows.slice(0, 50), page, hasNext: rows.length > 50 }
}

export async function auditChoices(db: AccountDb, principal: Principal | null) {
  requireOperator(principal)
  return {
    galleries: await db.select({ id: galleries.id, name: galleries.nameEn, nameFa: galleries.nameFa }).from(galleries).orderBy(galleries.nameEn),
    actors: await db.select({ id: users.id, name: users.name }).from(users).innerJoin(auditLogs, eq(auditLogs.actorUserId, users.id)).groupBy(users.id).orderBy(users.name),
    actions: await db.select({ action: auditLogs.action }).from(auditLogs).groupBy(auditLogs.action).orderBy(auditLogs.action),
  }
}

async function rateLimitBucketsToday(db: AppDatabase, now: Date) {
  const config = rateLimitConfig()
  const buckets = await db.select({ bucket: rateLimits.bucket, hits: rateLimits.hits }).from(rateLimits)
    .where(and(sql`(${rateLimits.windowStart} AT TIME ZONE 'Asia/Tehran')::date::text = ${tehranDay(now)}`,
      sql`${rateLimits.windowStart} <= ${now.toISOString()}::timestamptz`))
  return buckets.filter(({ bucket, hits }) => {
    const [action, subject] = bucket.split(':')
    const prefix = action === 'user-sign-in' ? `access-fail:${subject === 'account' ? 'gallery' : subject}` : `${action}:${subject}`
    const key = `${prefix.replace(/[-:]([a-z])/g, (_, letter: string) => letter.toUpperCase())}Max`
    const limit = config[key as keyof typeof config]
    return typeof limit === 'number' && hits >= limit
  }).length
}

export async function operatorHealth(db: AppDatabase, principal: Principal | null, storage: ObjectStorage, now = new Date()) {
  requireOperator(principal)
  const readiness = await runChecks({ db: () => pingDatabase(db), storage: () => storage.probe() })
  if (!readiness.body.ok) return { imageTag: process.env.IMAGE_TAG || 'unknown', readiness, migrations: [], blocks: null, mediaCount: null }
  const migrations = await db.select({ id: sql<string>`id`, applied_at: sql<string>`applied_at::text` }).from(sql`inview_migrations`).orderBy(sql`applied_at`, sql`id`)
  const blocks = await rateLimitBucketsToday(db, now)
  const [mediaCount] = await db.select({ value: count() }).from(media)
  return { imageTag: process.env.IMAGE_TAG || 'unknown', readiness, migrations, blocks, mediaCount: mediaCount.value }
}
