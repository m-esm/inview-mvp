import { and, eq, gt } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { galleries, memberships, sessions, users } from '../database/schema'
import { sha256 } from './crypto'
import { readCookie, readStaffSession } from './staff-session'

export type PlatformRole = 'admin' | 'support'
export type MembershipRole = 'owner' | 'editor' | 'viewer'
export type Principal =
  | { kind: 'operator'; userId: string; platformRole: PlatformRole }
  | { kind: 'staff'; userId: string; memberships: { galleryId: string; role: MembershipRole }[] }
  | { kind: 'shared-code'; galleryId: string }

export type Action =
  | 'view-gallery'
  | 'edit-catalogue'
  | 'upload-images'
  | 'view-report'
  | 'view-lead-phones'
  | 'export-leads'
  | 'manage-staff'
  | 'create-qr'
  | 'manage-gallery'
  | 'manage-operators'
  | 'read-audit'

const PERMISSIONS: Record<Action, readonly (PlatformRole | MembershipRole)[]> = {
  'view-gallery': ['admin', 'support', 'owner', 'editor', 'viewer'],
  'edit-catalogue': ['admin', 'support', 'owner', 'editor'],
  'upload-images': ['admin', 'support', 'owner', 'editor'],
  'view-report': ['admin', 'support', 'owner', 'editor', 'viewer'],
  'view-lead-phones': ['admin', 'support', 'owner', 'editor'],
  'export-leads': ['admin', 'owner', 'editor'],
  'manage-staff': ['admin', 'support', 'owner'],
  'create-qr': ['admin', 'support', 'owner', 'editor'],
  'manage-gallery': ['admin', 'support'],
  'manage-operators': ['admin'],
  'read-audit': ['admin', 'support', 'owner'],
}

export function can(principal: Principal | null, action: Action, galleryId?: string): boolean {
  if (!principal) return false
  if (principal.kind === 'shared-code') {
    return principal.galleryId === galleryId
      && ['view-gallery', 'edit-catalogue', 'upload-images', 'view-report', 'create-qr'].includes(action)
  }
  if (principal.kind === 'operator') return PERMISSIONS[action].includes(principal.platformRole)
  if (action === 'view-gallery') return true
  return principal.memberships.some((membership) =>
    membership.galleryId === galleryId && PERMISSIONS[action].includes(membership.role),
  )
}

export function leadPhoneAccess(principal: Principal | null, galleryId: string): 'full' | 'masked' | 'none' {
  if (!can(principal, 'view-lead-phones', galleryId)) return 'none'
  return principal?.kind === 'operator' && principal.platformRole === 'support' ? 'masked' : 'full'
}

export async function principalFor(
  db: Pick<AppDatabase, 'select' | 'delete'>,
  requestOrCookieHeader: Request | string | null | undefined,
): Promise<Principal | null> {
  const header = typeof requestOrCookieHeader === 'string'
    ? requestOrCookieHeader
    : requestOrCookieHeader?.headers.get('cookie')
  const token = readCookie(header, 'inview_session')
  if (token) {
    const [row] = await db.select({ user: users }).from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
      .limit(1)
    if (row) {
      if (row.user.status !== 'active') return null
      if (row.user.platformRole) {
        return { kind: 'operator', userId: row.user.id, platformRole: row.user.platformRole }
      }
      const roles = await db.select({ galleryId: memberships.galleryId, role: memberships.role })
        .from(memberships).where(eq(memberships.userId, row.user.id))
      return { kind: 'staff', userId: row.user.id, memberships: roles }
    }
  }
  const shared = await readStaffSession(db, header)
  if (!shared) return null
  const [gallery] = await db.select({ enabled: galleries.sharedCodeEnabled }).from(galleries)
    .where(eq(galleries.id, shared.galleryId)).limit(1)
  return gallery?.enabled ? { kind: 'shared-code', galleryId: shared.galleryId } : null
}
