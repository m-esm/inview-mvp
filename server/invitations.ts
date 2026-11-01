import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { AccountDb } from './accounts'
import { AccountInputError, createUserSession, passwordHash, signOutAll } from './accounts'
import { galleries, invitations, memberships, users } from '../database/schema'
import { writeAudit } from './audit'
import type { MembershipRole, PlatformRole } from './authz'
import { randomToken, sha256 } from './crypto'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const INVALID_INVITE = 'This invite is not valid.'
export class InvalidInviteError extends Error {
  constructor() {
    super(INVALID_INVITE)
  }
}

type InviteInput = { userId: string; createdBy?: string | null } & (
  | { kind: 'staff'; galleryId: string; role: MembershipRole }
  | { kind: 'operator'; platformRole: PlatformRole }
  | { kind: 'reset'; galleryId?: string }
)

async function auditInvite(
  db: Pick<AccountDb, 'select' | 'insert'>,
  invite: typeof invitations.$inferSelect,
  actorUserId: string | null,
  action: 'invite-create' | 'invite-accept',
) {
  const scopes = invite.galleryId ? [{ galleryId: invite.galleryId }]
    : invite.kind === 'reset'
      ? await db.select({ galleryId: memberships.galleryId }).from(memberships).where(eq(memberships.userId, invite.userId))
      : []
  for (const scope of scopes.length ? scopes : [{ galleryId: null }]) {
    await writeAudit(db, {
      actorUserId,
      galleryId: scope.galleryId,
      action,
      targetType: 'invitation',
      targetId: invite.id,
      summary: { kind: invite.kind, role: invite.role, platformRole: invite.platformRole },
    })
  }
}

export async function createInvite(db: AccountDb, input: InviteInput) {
  const token = randomToken(32)
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).for('update').limit(1)
    if (!user || user.status === 'disabled') {
      throw new AccountInputError('This account cannot receive this invite.')
    }
    const [invite] = await tx.insert(invitations).values({
      userId: input.userId,
      createdBy: input.createdBy,
      kind: input.kind,
      tokenHash: sha256(token),
      galleryId: input.kind === 'operator' ? null : input.galleryId,
      role: input.kind === 'staff' ? input.role : null,
      platformRole: input.kind === 'operator' ? input.platformRole : null,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    }).returning()
    await auditInvite(tx, invite, input.createdBy ?? null, 'invite-create')
    return { id: invite.id, token, expiresAt: invite.expiresAt }
  })
}

function availableInvite(token: string) {
  return and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.consumedAt), gt(invitations.expiresAt, sql`now()`))
}

export async function readInvite(db: Pick<AccountDb, 'select'>, token: string) {
  const [invite] = await db.select({
    kind: invitations.kind,
    galleryName: galleries.nameEn,
    role: invitations.role,
    platformRole: invitations.platformRole,
  }).from(invitations).leftJoin(galleries, eq(galleries.id, invitations.galleryId))
    .where(availableInvite(token)).limit(1)
  return invite ? { kind: invite.kind, galleryName: invite.galleryName, role: invite.role ?? invite.platformRole } : null
}

export async function acceptInvite(db: AccountDb, token: string, name: string, password: string, secure = false) {
  const hash = passwordHash(password)
  if (!name.trim() || name.length > 200) throw new AccountInputError('Enter a name with 1 to 200 characters.')
  return db.transaction(async (tx) => {
    const [invite] = await tx.update(invitations).set({ consumedAt: sql`now()` })
      .where(availableInvite(token)).returning()
    if (!invite) throw new InvalidInviteError()
    const [user] = await tx.select().from(users).where(eq(users.id, invite.userId)).for('update').limit(1)
    if (!user || user.status === 'disabled') {
      throw new InvalidInviteError()
    }
    if ((invite.kind === 'staff' && (!invite.galleryId || !invite.role))
      || (invite.kind === 'operator' && !invite.platformRole)) throw new InvalidInviteError()
    await tx.update(users).set({
      name: name.trim(),
      passwordHash: hash,
      status: 'active',
      updatedAt: new Date(),
      ...(invite.kind === 'operator' ? { platformRole: invite.platformRole } : {}),
    }).where(eq(users.id, user.id))
    if (invite.kind === 'staff' && invite.galleryId && invite.role) {
      await tx.insert(memberships).values({
        userId: user.id,
        galleryId: invite.galleryId,
        role: invite.role,
        createdBy: invite.createdBy,
      })
    }
    if (invite.kind === 'reset') await signOutAll(tx, user.id, user.id, invite.galleryId)
    await auditInvite(tx, invite, user.id, 'invite-accept')
    return createUserSession(tx, user.id, secure)
  })
}
