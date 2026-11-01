import { and, eq, isNull, sql } from 'drizzle-orm'
import { galleries, memberships, sessions, users } from '../database/schema'
import { AccountInputError, createUser, normalizePhone, type AccountDb } from './accounts'
import { writeAudit } from './audit'
import { can, type MembershipRole, type Principal } from './authz'
import { createInvite } from './invitations'

export class PermissionError extends Error {}

export function requireStaffManager(principal: Principal | null, galleryId: string) {
  if (!principal || principal.kind === 'shared-code' || !can(principal, 'manage-staff', galleryId)) {
    throw new PermissionError('Forbidden')
  }
  return principal
}

function validRole(role: MembershipRole) {
  if (!['owner', 'editor', 'viewer'].includes(role)) throw new AccountInputError('Invalid role.')
}

export async function listTeam(db: AccountDb, principal: Principal | null, galleryId: string) {
  requireStaffManager(principal, galleryId)
  return db.select({ userId: users.id, name: users.name, role: memberships.role, status: users.status, lastSignedInAt: users.lastSignedInAt })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.galleryId, galleryId), isNull(users.platformRole))).orderBy(users.name)
}

export async function inviteStaff(db: AccountDb, principal: Principal | null, galleryId: string, role: MembershipRole, identifier: string) {
  const actor = requireStaffManager(principal, galleryId)
  validRole(role)
  const email = identifier.includes('@') ? identifier.trim().toLowerCase() : null
  const phone = email ? null : normalizePhone(identifier)
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users)
      .where(email ? sql`lower(${users.email}) = ${email}` : eq(users.phone, phone!)).limit(1)
    if (existing) throw new AccountInputError('This account already exists. Use a different identifier.')
    const user = await createUser(tx, { email, phone, status: 'invited' })
    const invite = await createInvite(tx, { kind: 'staff', galleryId, userId: user.id, role, createdBy: actor.userId })
    return { invitePath: `/staff/invite/${invite.token}`, expiresAt: invite.expiresAt }
  })
}

async function teamWrite(
  db: AccountDb, principal: Principal | null, galleryId: string, userId: string,
  action: string, change: (tx: AccountDb) => Promise<void>, global = false,
) {
  const actor = requireStaffManager(principal, galleryId)
  return db.transaction(async (tx) => {
    await tx.select({ id: galleries.id }).from(galleries).where(eq(galleries.id, galleryId)).for('update')
    const [member] = await tx.select({ role: memberships.role, platformRole: users.platformRole, status: users.status })
      .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.galleryId, galleryId), eq(memberships.userId, userId))).for('update').limit(1)
    if (!member || member.platformRole) throw new PermissionError('Forbidden')
    if (global) {
      const scopes = await tx.select({ galleryId: memberships.galleryId }).from(memberships).where(eq(memberships.userId, userId))
      if (scopes.some((scope) => scope.galleryId !== galleryId)) {
        throw new AccountInputError('This account belongs to more than one gallery. Remove this membership instead.')
      }
    }
    await change(tx)
    const [after] = await tx.select({ role: memberships.role, status: users.status }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.galleryId, galleryId), eq(memberships.userId, userId))).limit(1)
    await writeAudit(tx, { actorUserId: actor.userId, galleryId, action, targetType: 'user', targetId: userId,
      summary: { before: { role: member.role, status: member.status }, after: after ?? null } })
  })
}

export async function changeRole(db: AccountDb, principal: Principal | null, galleryId: string, userId: string, role: MembershipRole) {
  validRole(role)
  await teamWrite(db, principal, galleryId, userId, 'team-role', async (tx) => {
    await tx.update(memberships).set({ role }).where(and(eq(memberships.galleryId, galleryId), eq(memberships.userId, userId)))
  })
}

export async function disableUser(db: AccountDb, principal: Principal | null, galleryId: string, userId: string) {
  await teamWrite(db, principal, galleryId, userId, 'team-disable', async (tx) => {
    await tx.update(users).set({ status: 'disabled', updatedAt: new Date() }).where(eq(users.id, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
  }, true)
}

export async function enableUser(db: AccountDb, principal: Principal | null, galleryId: string, userId: string) {
  await teamWrite(db, principal, galleryId, userId, 'team-enable', async (tx) => {
    await tx.update(users).set({ status: 'active', updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.status, 'disabled')))
  }, true)
}

export async function removeMembership(db: AccountDb, principal: Principal | null, galleryId: string, userId: string) {
  await teamWrite(db, principal, galleryId, userId, 'team-remove', async (tx) => {
    await tx.delete(memberships).where(and(eq(memberships.galleryId, galleryId), eq(memberships.userId, userId)))
  })
}

export async function resetLink(db: AccountDb, principal: Principal | null, galleryId: string, userId: string) {
  const actor = requireStaffManager(principal, galleryId)
  let invitePath = ''
  await teamWrite(db, principal, galleryId, userId, 'team-reset', async (tx) => {
    const invite = await createInvite(tx, { kind: 'reset', galleryId, userId, createdBy: actor.userId })
    invitePath = `/staff/invite/${invite.token}`
  }, true)
  return { invitePath }
}

export async function signOutUser(db: AccountDb, principal: Principal | null, galleryId: string, userId: string) {
  await teamWrite(db, principal, galleryId, userId, 'team-sign-out', async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, userId))
  }, true)
}
