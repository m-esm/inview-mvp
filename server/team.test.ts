import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { auditLogs, galleries, memberships, sessions, users } from '../database/schema'
import { createUser, createUserSession } from './accounts'
import type { Principal } from './authz'
import { acceptInvite } from './invitations'
import { changeRole, disableUser, enableUser, inviteStaff, listTeam, removeMembership, resetLink, signOutUser } from './team'
import { createTestDb } from './test-db'

test('team permissions, two-gallery isolation, account revocation and audited writes', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const operator = await createUser(db, { email: 'admin@example.com', platformRole: 'admin' })
    const admin: Principal = { kind: 'operator', userId: operator.id, platformRole: 'admin' }
    const support: Principal = { ...admin, platformRole: 'support' }
    const [a, b] = await db.insert(galleries).values([{ slug: 'team-a', nameFa: 'A', nameEn: 'A' }, { slug: 'team-b', nameFa: 'B', nameEn: 'B' }]).returning()
    const owner = await createUser(db, { email: 'owner@example.com', name: 'Owner' })
    const other = await createUser(db, { email: 'other@example.com', name: 'Other gallery' })
    await db.insert(memberships).values([{ galleryId: a.id, userId: owner.id, role: 'owner' }, { galleryId: b.id, userId: other.id, role: 'owner' }])
    const staff: Principal = { kind: 'staff', userId: owner.id, memberships: [{ galleryId: a.id, role: 'owner' }] }
    const editor: Principal = { ...staff, memberships: [{ galleryId: a.id, role: 'editor' }] }
    assert.deepEqual((await listTeam(db, staff, a.id)).map((row) => row.name), ['Owner'])
    assert.deepEqual((await listTeam(db, support, b.id)).map((row) => row.name), ['Other gallery'])
    await assert.rejects(listTeam(db, staff, b.id), /Forbidden/)
    await assert.rejects(inviteStaff(db, editor, a.id, 'editor', 'denied@example.com'), /Forbidden/)
    for (const operation of [disableUser, enableUser, removeMembership, resetLink, signOutUser]) {
      await assert.rejects(operation(db, support, a.id, other.id), /Forbidden/)
    }
    await assert.rejects(changeRole(db, support, a.id, other.id, 'viewer'), /Forbidden/)
    const invitation = await inviteStaff(db, staff, a.id, 'editor', '+۹۸۹۱۲۳۴۵۶۷۸۹')
    const accepted = await acceptInvite(db, invitation.invitePath.split('/').pop()!, 'Editor', 'long-password')
    const userId = accepted.user.id
    await changeRole(db, support, a.id, userId, 'viewer')
    assert.equal((await listTeam(db, support, a.id)).find((row) => row.userId === userId)?.role, 'viewer')
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, userId))).length, 1)
    await disableUser(db, support, a.id, userId)
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, userId))).length, 0)
    await enableUser(db, support, a.id, userId)
    const reset = await resetLink(db, staff, a.id, userId)
    await acceptInvite(db, reset.invitePath.split('/').pop()!, 'Editor', 'new-password')
    await signOutUser(db, staff, a.id, userId)
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, userId))).length, 0)
    await createUserSession(db, userId, false)
    await db.insert(memberships).values({ galleryId: b.id, userId, role: 'viewer' })
    await assert.rejects(disableUser(db, support, a.id, userId), /more than one gallery/)
    await assert.rejects(resetLink(db, staff, a.id, userId), /more than one gallery/)
    await removeMembership(db, support, a.id, userId)
    assert.ok(!(await listTeam(db, support, a.id)).some((row) => row.userId === userId))
    assert.ok((await listTeam(db, support, b.id)).some((row) => row.userId === userId))
    assert.equal((await db.select().from(users).where(eq(users.id, other.id)))[0].status, 'active')
    const audits = await db.select().from(auditLogs)
    assert.ok(audits.every((row) => row.galleryId === a.id))
    for (const action of ['invite-create', 'team-role', 'team-disable', 'team-enable', 'team-reset', 'team-sign-out', 'team-remove']) {
      assert.ok(audits.some((row) => row.action === action && [operator.id, owner.id].includes(row.actorUserId!)), action)
    }
    assert.ok(!JSON.stringify(await listTeam(db, admin, b.id)).includes('09123456789'))
    assert.ok(!JSON.stringify(audits).includes('09123456789'))
    await assert.rejects(inviteStaff(db, support, a.id, 'owner', 'admin@example.com'), /already exists/)
    await db.insert(memberships).values({ galleryId: a.id, userId: operator.id, role: 'editor' })
    await assert.rejects(disableUser(db, support, a.id, operator.id), /Forbidden/)
  } finally { await fixture.close() }
})
