import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { galleries, memberships, sessions, users } from '../database/schema'
import { createUser, signIn } from './accounts'
import { can, leadPhoneAccess, principalFor } from './authz'
import type { Action, MembershipRole, PlatformRole, Principal } from './authz'
import { randomToken, sha256 } from './crypto'
import { createTestDb } from './test-db'
import type { AppDatabase } from '../database/context'

test('every permission row covers all roles, own and other galleries, shared code and anonymous', () => {
  const rows: [Action, boolean[]][] = [
    ['view-gallery', [true, true, true, true, true]],
    ['edit-catalogue', [true, true, true, true, false]],
    ['upload-images', [true, true, true, true, false]],
    ['view-report', [true, true, true, true, true]],
    ['view-lead-phones', [true, true, true, true, false]],
    ['export-leads', [true, false, true, true, false]],
    ['manage-staff', [true, true, true, false, false]],
    ['create-qr', [true, true, true, true, false]],
    ['manage-gallery', [true, true, false, false, false]],
    ['manage-operators', [true, false, false, false, false]],
    ['read-audit', [true, true, true, false, false]],
  ]
  const roles: (PlatformRole | MembershipRole)[] = ['admin', 'support', 'owner', 'editor', 'viewer']
  for (const [action, allowed] of rows) {
    for (const [index, role] of roles.entries()) {
      const principal: Principal = role === 'admin' || role === 'support'
        ? { kind: 'operator', userId: 'person', platformRole: role }
        : { kind: 'staff', userId: 'person', memberships: [{ galleryId: 'own', role }] }
      assert.equal(can(principal, action, 'own'), allowed[index], `${action}: ${role}: own`)
      assert.equal(can(principal, action, 'other'), index < 2 || action === 'view-gallery' ? allowed[index] : false,
        `${action}: ${role}: other`)
    }
    const shared: Principal = { kind: 'shared-code', galleryId: 'own' }
    assert.equal(can(shared, action, 'own'),
      ['view-gallery', 'edit-catalogue', 'upload-images', 'view-report', 'create-qr'].includes(action), `${action}: shared own`)
    assert.equal(can(shared, action, 'other'), false, `${action}: shared other`)
    assert.equal(can(null, action, 'own'), false, `${action}: anonymous`)
  }
  for (const role of ['owner', 'editor', 'viewer'] as const) {
    const principal: Principal = { kind: 'staff', userId: 'person', memberships: [{ galleryId: 'own', role }] }
    assert.equal(leadPhoneAccess(principal, 'own'), role === 'viewer' ? 'none' : 'full')
    assert.equal(leadPhoneAccess(principal, 'other'), 'none')
  }
  assert.equal(leadPhoneAccess({ kind: 'operator', userId: 'person', platformRole: 'support' }, 'own'), 'masked')
  assert.equal(leadPhoneAccess({ kind: 'operator', userId: 'person', platformRole: 'admin' }, 'own'), 'full')
  assert.equal(leadPhoneAccess(null, 'own'), 'none')
})

test('principal resolves user cookies, roles and shared-code enablement and refuses disabled or expired users', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const [gallery] = await db.insert(galleries).values({ slug: 'principal-gallery', nameEn: 'Gallery', nameFa: 'Gallery' }).returning()
    const user = await createUser(db, { email: 'owner@example.com', password: 'long-password' })
    await db.insert(memberships).values({ userId: user.id, galleryId: gallery.id, role: 'owner' })
    const signed = await signIn(db, { identifier: 'owner@example.com', password: 'long-password', ip: 'owner', secure: false })
    assert.ok(signed.ok)
    const cookie = signed.cookie.split(';')[0]
    assert.deepEqual(await principalFor(db, new Request('http://localhost', { headers: { cookie } })), {
      kind: 'staff', userId: user.id, memberships: [{ galleryId: gallery.id, role: 'owner' }],
    })
    await db.update(users).set({ platformRole: 'support' }).where(eq(users.id, user.id))
    assert.deepEqual(await principalFor(db, cookie), { kind: 'operator', userId: user.id, platformRole: 'support' })
    const token = randomToken()
    await db.insert(sessions).values({ galleryId: gallery.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60000) })
    const shared = `inview_staff=${token}`
    assert.deepEqual(await principalFor(db, shared), { kind: 'shared-code', galleryId: gallery.id })
    await db.update(users).set({ status: 'disabled' }).where(eq(users.id, user.id))
    assert.equal(await principalFor(db, `${cookie}; ${shared}`), null)
    await db.update(users).set({ status: 'invited' }).where(eq(users.id, user.id))
    assert.equal(await principalFor(db, cookie), null)
    await db.update(users).set({ status: 'active' }).where(eq(users.id, user.id))
    await db.update(sessions).set({ expiresAt: new Date(0) }).where(eq(sessions.userId, user.id))
    assert.equal(await principalFor(db, cookie), null)
    await db.update(galleries).set({ sharedCodeEnabled: false }).where(eq(galleries.id, gallery.id))
    assert.equal(await principalFor(db, shared), null)
    assert.equal(await principalFor(db, undefined), null)
  } finally {
    await fixture.close()
  }
})
